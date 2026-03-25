import cron from 'node-cron';
import { prisma } from '../db';
import { getAdapter } from '../services/sports';
import { createMatchPools } from './sports-scheduler';
import {
  getFixturesNeedingPoll,
  getStalePreMatchFixtures,
  markFixtureCacheReady,
} from '../services/sports/fixture-cache';
import type { Match, MatchResult } from '../services/sports/types';

const LEAGUES = ['CL', 'PL', 'PD', 'SA', 'BL1', 'FL1', 'BSA'];
const RATE_LIMIT_DELAY_MS = 7_000; // 7s between API calls (stays under 10/min)
const API_SOURCE = 'football-data';

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
  const today = new Date();
  const dateFrom = formatDate(today);
  const dateTo = formatDate(addDays(today, 14));
  let totalSynced = 0;

  for (const league of LEAGUES) {
    try {
      const adapter = getAdapter('FOOTBALL');
      const matches = await adapter.fetchMatchesByDateRange(league, dateFrom, dateTo);

      for (const match of matches) {
        await upsertMatch(match, API_SOURCE);
      }

      totalSynced += matches.length;
      console.log(`[FixtureSync] ${league}: synced ${matches.length} fixtures`);
    } catch (error) {
      console.error(`[FixtureSync] Failed to sync ${league}:`, error instanceof Error ? error.message : error);
    }

    // Rate limit: wait between leagues
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  console.log(`[FixtureSync] Daily sync complete: ${totalSynced} fixtures across ${LEAGUES.length} leagues`);
}

/**
 * Match window poll: only check fixtures currently in play (kickoff < now < kickoff+3h).
 * Polls individual match results for fixtures that haven't finished yet.
 * ~12-36 API calls/day (only on match days, only during match windows).
 */
async function matchWindowPoll(): Promise<void> {
  const fixtures = await getFixturesNeedingPoll();
  if (fixtures.length === 0) return;

  const adapter = getAdapter('FOOTBALL');
  let updated = 0;

  for (const fix of fixtures) {
    try {
      const result = await adapter.fetchMatchResult(fix.externalId);
      if (result) {
        await updateCacheFromResult(result);
        updated++;
      }
    } catch (error) {
      console.warn(`[FixtureSync] Poll failed for ${fix.externalId}:`, error instanceof Error ? error.message : error);
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

  const adapter = getAdapter('FOOTBALL');

  for (const fix of stale) {
    try {
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
