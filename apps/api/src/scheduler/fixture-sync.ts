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

async function upsertMatch(match: Match, source: string): Promise<void> {
  const winner = match.status === 'FINISHED' && match.homeScore != null && match.awayScore != null
    ? (match.homeScore > match.awayScore ? 'HOME' : match.awayScore > match.homeScore ? 'AWAY' : 'DRAW')
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
  const winner = result.homeScore > result.awayScore ? 'HOME'
    : result.awayScore > result.homeScore ? 'AWAY' : 'DRAW';

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
async function dailySync(): Promise<void> {
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
    try {
      const adapter = getAdapter(config.sport);
      const matches = await adapter.fetchUpcomingMatches(config.sport);

      for (const match of matches) {
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

// ── Scheduler Entry Point ──────────────────────────────────────────────────

export function startFixtureSyncScheduler(): void {
  // Daily sync at 04:00 UTC
  cron.schedule('0 4 * * *', () => {
    dailySync().catch(e => console.error('[FixtureSync] Daily sync error:', e));
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
      console.log('[FixtureSync] Cache ready — triggering football pool creation');
      return createMatchPools();
    })
    .then(() => console.log('[FixtureSync] Initial football pool creation complete'))
    .catch(e => {
      console.error('[FixtureSync] Initial sync error:', e);
      markFixtureCacheReady();
    });

  console.log('[FixtureSync] Scheduler started (daily: 04:00 UTC, poll: 5m, pre-match: 30m)');
}
