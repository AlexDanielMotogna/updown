import cron from 'node-cron';
import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import { createMatchPools } from './sports-scheduler';
import {
  getFixturesNeedingPoll,
  getStalePreMatchFixtures,
  markFixtureCacheReady,
} from '../services/sports/fixture-cache';
import { getFootballConfigs, getSportsDbConfigs } from '../services/category-config';
import type { Match, MatchResult } from '../services/sports/types';
import { regulationWinner } from '../services/sports/regulation-time';
import { getEventFighterImages, isCombatSport } from '../services/sports/fighter-images';
const RATE_LIMIT_DELAY_MS = 2_000; // 2s between API calls (TheSportsDB allows 100/min)
const API_SOURCE = 'sports';

// ── Helpers ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

// Sport→leagues whitelist derived from the live DB. Cached for
// WHITELIST_TTL_MS so we don't hit the DB on every upsert; invalidated
// explicitly whenever categories mutate (see invalidateSportLeagueWhitelist).
// The legacy hardcoded map was wrong for any operator-created category:
// SPORT_LEAGUE_WHITELIST['BOXIN']  was undefined, so the guard silently
// accepted anything — that's how 898 soccer matches ended up stamped
// sport=BOXIN/league=BOXIN. Deriving from PoolCategory closes that hole
// AND keeps new categories protected automatically.
const WHITELIST_TTL_MS = 60_000; // 1 min — categories rarely change
let _whitelistCache: { ts: number; data: Record<string, Set<string>> } | null = null;

async function getSportLeagueWhitelist(): Promise<Record<string, Set<string>>> {
  const now = Date.now();
  if (_whitelistCache && now - _whitelistCache.ts < WHITELIST_TTL_MS) return _whitelistCache.data;

  const cats = await prisma.poolCategory.findMany({
    where: { type: { in: ['FOOTBALL_LEAGUE', 'SPORTSDB_SPORT', 'POLYMARKET'] } },
    select: { code: true, type: true },
  });
  const map: Record<string, Set<string>> = {};
  const add = (sport: string, code: string) => { (map[sport] ??= new Set<string>()).add(code); };
  for (const c of cats) {
    if (c.type === 'FOOTBALL_LEAGUE') add('FOOTBALL', c.code);
    else if (c.type === 'SPORTSDB_SPORT') add(c.code, c.code); // sport === code for these
    else if (c.type === 'POLYMARKET') add('POLYMARKET', c.code);
  }
  _whitelistCache = { ts: now, data: map };
  return map;
}

/** Drop the in-memory whitelist cache. Call from category mutation paths. */
export function invalidateSportLeagueWhitelist(): void {
  _whitelistCache = null;
}

async function upsertMatch(match: Match, source: string): Promise<void> {
  // Pollution guard: refuse to upsert rows where the (sport, league) pair
  // is not in the live category set. Logs loudly so a stale process or
  // misconfigured adapter surfaces in stderr instead of silently filling
  // the cache.
  const whitelist = await getSportLeagueWhitelist();
  const allowed = whitelist[match.sport];
  if (!allowed) {
    console.warn(`[FixtureSync] REFUSED upsert: sport=${match.sport} has no configured category. matchId=${match.id}`);
    return;
  }
  if (!allowed.has(match.league)) {
    console.warn(`[FixtureSync] REFUSED upsert: sport=${match.sport} but league=${match.league} (allowed: ${[...allowed].join(',')}). matchId=${match.id}`);
    return;
  }

  const winner = match.status === 'FINISHED' && match.homeScore != null && match.awayScore != null
    ? regulationWinner(match.homeScore, match.awayScore, match.rawStatus)
    : null;

  await prisma.sportsFixtureCache.upsert({
    where: {
      externalId_sport_apiSource: {
        externalId: match.id,
        sport: match.sport,
        apiSource: source,
      },
    },
    create: {
      externalId: match.id,
      sport: match.sport,
      league: match.league,
      leagueName: match.leagueName,
      season: match.season ?? null,
      matchday: match.matchday ?? null,
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCrest: match.homeTeamCrest ?? null,
      awayTeamCrest: match.awayTeamCrest ?? null,
      kickoff: match.kickoff,
      status: match.status,
      homeScore: match.homeScore ?? null,
      awayScore: match.awayScore ?? null,
      winner,
      apiSource: source,
      lastSyncedAt: new Date(),
    },
    update: {
      homeTeam: match.homeTeam,
      awayTeam: match.awayTeam,
      homeTeamCrest: match.homeTeamCrest ?? null,
      awayTeamCrest: match.awayTeamCrest ?? null,
      kickoff: match.kickoff,
      status: match.status,
      homeScore: match.homeScore ?? null,
      awayScore: match.awayScore ?? null,
      winner,
      matchday: match.matchday ?? null,
      lastSyncedAt: new Date(),
    },
  });
}

async function updateCacheFromResult(result: MatchResult): Promise<void> {
  // Prefer the regulation-time winner already on the MatchResult; fall back
  // to recomputing from rawStatus + score for callers that don't populate it.
  const winner = result.winner
    ?? regulationWinner(result.homeScore, result.awayScore, result.rawStatus);

  await prisma.sportsFixtureCache.updateMany({
    where: { externalId: result.matchId },
    data: {
      status: result.status,
      homeScore: result.homeScore,
      awayScore: result.awayScore,
      winner,
      lastSyncedAt: new Date(),
    },
  });
}

// ── Sync Jobs ──────────────────────────────────────────────────────────────

/**
 * Daily sync: fetch 14 days of fixtures per league, upsert into cache.
 * ~6 API calls (1 per league).
 */
export async function dailySync(): Promise<void> {
  let totalSynced = 0;
  let sourceCount = 0;

  // ── Football leagues (via TheSportsDB) ──
  const footballConfigs = await getFootballConfigs();
  for (const config of footballConfigs) {
    try {
      const adapter = getAdapter(config.sport); // CL, PL, EL, etc.
      const matches = await adapter.fetchUpcomingMatches(config.sport);

      for (const match of matches) {
        // Store with sport='FOOTBALL' so reads via getCachedUpcomingFixtures('FOOTBALL', leagueCode) match.
        // The league code (CL, PL, etc.) goes in the league field.
        await upsertMatch({ ...match, sport: 'FOOTBALL', league: config.sport }, API_SOURCE);
      }

      totalSynced += matches.length;
      sourceCount++;
      console.log(`[FixtureSync] ${config.sport}: synced ${matches.length} fixtures`);
    } catch (error) {
      console.error(`[FixtureSync] Failed to sync ${config.sport}:`, error instanceof Error ? error.message : error);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  // ── Other sports (NBA, NHL, MMA, NFL via TheSportsDB) ──
  const sportsConfigs = await getSportsDbConfigs();
  for (const config of sportsConfigs) {
    // Skip categories that don't have a SDB league id wired. The fallback
    // `eventsday.php?s=<sportQuery>` path returns every event for the
    // umbrella sport (e.g. sportQuery=Fighting → boxing + MMA + UFC + K-1)
    // — without a leagueFilter it pollutes the cache, and even with one,
    // the filter has historically misfired. Treat 'no leagueId' as
    // 'not ready to sync'. Operator gets a one-shot warning per cycle.
    if (!config.leagueId) {
      console.warn(`[FixtureSync] SKIPPED ${config.sport}: no externalLeagueId configured. Add the SDB league id in admin → Categories or via Browse SDB.`);
      continue;
    }
    try {
      const adapter = getAdapter(config.sport);
      const matches = await adapter.fetchUpcomingMatches(config.sport);

      for (const match of matches) {
        // Combat-sport enrichment. SDB's eventsnextleague endpoint leaves
        // strHomeTeamBadge / strAwayTeamBadge null for boxing / MMA / K-1
        // (fighters live behind searchplayers.php, not on the event).
        // Resolve each fighter once, persisted long-term in
        // fighter_image_cache, and plug the cutout URL into the existing
        // homeTeamCrest / awayTeamCrest columns so downstream code
        // (pool cards, match header) renders fighter photos with zero
        // schema change. Negative cache means an unranked debut costs
        // one SDB call per 7 days, not one per sync.
        if (isCombatSport(config.sportQuery) && (!match.homeTeamCrest || !match.awayTeamCrest)) {
          const { homeImage, awayImage } = await getEventFighterImages(match.homeTeam, match.awayTeam, config.sportQuery);
          if (!match.homeTeamCrest && homeImage) match.homeTeamCrest = homeImage;
          if (!match.awayTeamCrest && awayImage) match.awayTeamCrest = awayImage;
        }
        await upsertMatch(match, API_SOURCE);
      }

      totalSynced += matches.length;
      sourceCount++;
      console.log(`[FixtureSync] ${config.sport}: synced ${matches.length} fixtures`);
    } catch (error) {
      console.error(`[FixtureSync] Failed to sync ${config.sport}:`, error instanceof Error ? error.message : error);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(`[FixtureSync] Daily sync complete: ${totalSynced} fixtures across ${sourceCount} sources`);
}

/**
 * Match window poll: only check fixtures currently in play (kickoff < now < kickoff+3h).
 * Polls individual match results for fixtures that haven't finished yet.
 * ~12-36 API calls/day (only on match days, only during match windows).
 */
async function matchWindowPoll(): Promise<void> {
  const fixtures = await getFixturesNeedingPoll();
  if (fixtures.length === 0) return;

  let updated = 0;

  for (const fix of fixtures) {
    try {
      const adapter = getAdapter(fix.sport);
      const result = await adapter.fetchMatchResult(fix.externalId);
      if (result) {
        await updateCacheFromResult(result);
        updated++;
      }
    } catch (error) {
      console.warn(`[FixtureSync] Poll failed for ${fix.externalId} (${fix.sport}):`, error instanceof Error ? error.message : error);
    }

    // Rate limit between calls
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  if (updated > 0) {
    console.log(`[FixtureSync] Poll: updated ${updated}/${fixtures.length} fixture results`);
  }
}

/**
 * Pre-match refresh: re-check fixtures kicking off within 1h whose cache is >6h old.
 * Catches postponements, kickoff time changes.
 * ~2-4 API calls/day.
 */
async function preMatchRefresh(): Promise<void> {
  const stale = await getStalePreMatchFixtures();
  if (stale.length === 0) return;

  for (const fix of stale) {
    try {
      const adapter = getAdapter(fix.sport);
      const result = await adapter.fetchMatchResult(fix.externalId);
      if (result) {
        await prisma.sportsFixtureCache.updateMany({
          where: { externalId: fix.externalId },
          data: {
            status: result.status,
            homeScore: result.homeScore,
            awayScore: result.awayScore,
            lastSyncedAt: new Date(),
          },
        });
      }
    } catch (error) {
      console.warn(`[FixtureSync] Pre-match refresh failed for ${fix.externalId}:`, error instanceof Error ? error.message : error);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  if (stale.length > 0) {
    console.log(`[FixtureSync] Pre-match refresh: checked ${stale.length} fixtures`);
  }
}

// ── Cleanup ────────────────────────────────────────────────────────────────

/**
 * Sweep stale + orphan rows from the sports cache. Runs daily after
 * dailySync. Mirrors the polymarket-sync cleanup pattern (which has
 * existed for PM rows since day one); pre-this-commit the non-PM cache
 * had no cleanup at all and rows accumulated indefinitely.
 *
 * Two passes:
 *  1. Orphan — (sport, league) not in the live category set (e.g. the
 *     operator deleted a category but cache rows remained).
 *  2. Stale  — FINISHED events whose last sync is older than
 *     STALE_FINISHED_DAYS.
 *
 * Polymarket rows are skipped — polymarket-sync.cleanup() owns those.
 */
const STALE_FINISHED_DAYS = 30;
export async function cleanupSportsCache(): Promise<{ orphan: number; stale: number }> {
  const cats = await prisma.poolCategory.findMany({
    where: { type: { in: ['FOOTBALL_LEAGUE', 'SPORTSDB_SPORT'] } },
    select: { code: true, type: true },
  });
  const validPairs = new Set<string>();
  for (const c of cats) {
    const sport = c.type === 'FOOTBALL_LEAGUE' ? 'FOOTBALL' : c.code;
    validPairs.add(`${sport}|${c.code}`);
  }

  // Pull just (sport, league) groups so the deleteMany list stays tiny
  // even on a multi-million-row cache.
  const groups = await prisma.sportsFixtureCache.groupBy({
    by: ['sport', 'league'],
    where: { sport: { not: 'POLYMARKET' } },
    _count: { _all: true },
  });
  const orphanFilters: Array<{ sport: string; league: string }> = [];
  for (const g of groups) {
    if (!g.league) continue;
    if (!validPairs.has(`${g.sport}|${g.league}`)) {
      orphanFilters.push({ sport: g.sport, league: g.league });
    }
  }

  let orphan = 0;
  if (orphanFilters.length > 0) {
    const { count } = await prisma.sportsFixtureCache.deleteMany({
      where: { OR: orphanFilters },
    });
    orphan = count;
  }

  const cutoff = new Date(Date.now() - STALE_FINISHED_DAYS * 24 * 60 * 60 * 1000);
  const { count: stale } = await prisma.sportsFixtureCache.deleteMany({
    where: {
      sport: { not: 'POLYMARKET' },
      status: 'FINISHED',
      lastSyncedAt: { lt: cutoff },
    },
  });

  if (orphan + stale > 0) {
    console.log(`[FixtureSync] Cleanup: ${orphan} orphan + ${stale} stale rows removed`);
  }
  return { orphan, stale };
}

// ── Combat-sport image backfill ────────────────────────────────────────────

/**
 * Walk every combat-sport fixture cache row whose home/away crest is empty
 * and try to fill it from the fighter-image cache. New rows already get
 * enriched at upsert time (see dailySync above); this is the one-shot path
 * to repopulate rows created before fighter-images.ts existed. Idempotent.
 *
 * Pool rows that point at the same matchId get the same patch — Pool
 * stores its own crest snapshot so the public app reads it without going
 * through the cache.
 *
 * Rate-limit aware: one SDB call per unique unresolved fighter,
 * 2s between requests, negative-cache prevents re-trying misses for 7
 * days even across runs.
 */
export async function backfillCombatSportImages(): Promise<{ rowsScanned: number; rowsUpdated: number; poolsUpdated: number }> {
  const sportsConfigs = await getSportsDbConfigs();
  const combatConfigs = sportsConfigs.filter(c => isCombatSport(c.sportQuery));
  if (combatConfigs.length === 0) {
    return { rowsScanned: 0, rowsUpdated: 0, poolsUpdated: 0 };
  }

  let rowsScanned = 0;
  let rowsUpdated = 0;
  let poolsUpdated = 0;

  for (const config of combatConfigs) {
    if (!config.sportQuery) continue;
    const rows = await prisma.sportsFixtureCache.findMany({
      where: {
        sport: config.sport,
        OR: [{ homeTeamCrest: null }, { awayTeamCrest: null }],
      },
      select: {
        externalId: true,
        homeTeam: true,
        awayTeam: true,
        homeTeamCrest: true,
        awayTeamCrest: true,
      },
    });

    for (const row of rows) {
      rowsScanned++;
      const { homeImage, awayImage } = await getEventFighterImages(row.homeTeam, row.awayTeam, config.sportQuery);
      const nextHome = !row.homeTeamCrest && homeImage ? homeImage : row.homeTeamCrest;
      const nextAway = !row.awayTeamCrest && awayImage ? awayImage : row.awayTeamCrest;
      if (nextHome === row.homeTeamCrest && nextAway === row.awayTeamCrest) {
        continue;
      }

      const updatedCache = await prisma.sportsFixtureCache.updateMany({
        where: { externalId: row.externalId, sport: config.sport },
        data: { homeTeamCrest: nextHome, awayTeamCrest: nextAway, lastSyncedAt: new Date() },
      });
      rowsUpdated += updatedCache.count;

      const updatedPools = await prisma.pool.updateMany({
        where: { matchId: row.externalId, poolType: 'SPORTS' },
        data: { homeTeamCrest: nextHome, awayTeamCrest: nextAway },
      });
      poolsUpdated += updatedPools.count;

      // Be polite to SDB — getEventFighterImages already hits the cache
      // for known names, but new lookups within this loop should pace.
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  if (rowsScanned > 0) {
    console.log(`[FixtureSync] Combat image backfill: scanned=${rowsScanned} cacheUpdated=${rowsUpdated} poolsUpdated=${poolsUpdated}`);
  }
  return { rowsScanned, rowsUpdated, poolsUpdated };
}

// ── Scheduler Entry Point ──────────────────────────────────────────────────

export function startFixtureSyncScheduler(): void {
  // Daily sync at 04:00 UTC
  cron.schedule('0 4 * * *', () => {
    dailySync().catch(e => console.error('[FixtureSync] Daily sync error:', e));
  });

  // Sports cache cleanup at 04:30 UTC (after dailySync, before the
  // working day in EU/Americas hits its peak). Idempotent — re-running
  // returns 0 if nothing to delete.
  cron.schedule('30 4 * * *', () => {
    cleanupSportsCache().catch(e => console.error('[FixtureSync] Cleanup error:', e));
  });

  // Match window poll every 5 minutes
  setInterval(() => {
    matchWindowPoll().catch(e => console.error('[FixtureSync] Poll error:', e));
  }, 5 * 60 * 1000);

  // Pre-match refresh every 30 minutes
  setInterval(() => {
    preMatchRefresh().catch(e => console.error('[FixtureSync] Pre-match error:', e));
  }, 30 * 60 * 1000);

  // Seed cache on startup, then trigger pool creation for football
  dailySync()
    .then(() => {
      markFixtureCacheReady();
      console.log('[FixtureSync] Cache ready - triggering football pool creation');
      return createMatchPools();
    })
    .then(() => console.log('[FixtureSync] Initial football pool creation complete'))
    .catch(e => {
      console.error('[FixtureSync] Initial sync error:', e);
      markFixtureCacheReady();
    });

  console.log('[FixtureSync] Scheduler started (daily: 04:00 UTC, poll: 5m, pre-match: 30m)');
}
