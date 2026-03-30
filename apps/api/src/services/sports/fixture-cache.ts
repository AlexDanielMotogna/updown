import { prisma } from '../../db';
import type { Match, MatchResult, MatchStatus } from './types';
import { sportsDbFetchV2 } from './api-sports-fetch';
import { FINISHED_STATUSES, API_LOOKUP_LIMIT } from './livescore';

/**
 * Fixture cache read service.
 * All consumers read from SportsFixtureCache instead of calling external APIs.
 * Only the fixture-sync scheduler writes to this table.
 */

// ── Helpers ────────────────────────────────────────────────────────────────

function rowToMatch(row: {
  externalId: string;
  sport: string;
  league: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  kickoff: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  matchday: number | null;
  season: number | null;
}): Match {
  return {
    id: row.externalId,
    sport: row.sport,
    league: row.league,
    leagueName: row.leagueName,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    homeTeamCrest: row.homeTeamCrest ?? undefined,
    awayTeamCrest: row.awayTeamCrest ?? undefined,
    kickoff: row.kickoff,
    status: row.status as MatchStatus,
    homeScore: row.homeScore ?? undefined,
    awayScore: row.awayScore ?? undefined,
    matchday: row.matchday ?? undefined,
    season: row.season ?? undefined,
  };
}

function rowToResult(row: {
  externalId: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
}): MatchResult | null {
  if (row.status !== 'FINISHED') return null;
  if (row.homeScore == null || row.awayScore == null) return null;

  return {
    matchId: row.externalId,
    status: 'FINISHED',
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    winner: (row.winner as 'HOME' | 'AWAY' | 'DRAW') ||
      (row.homeScore > row.awayScore ? 'HOME' : row.awayScore > row.homeScore ? 'AWAY' : 'DRAW'),
  };
}

// ── Read methods ───────────────────────────────────────────────────────────

/**
 * Get upcoming/scheduled fixtures for a sport+league.
 * Returns all upcoming fixtures ordered by kickoff time.
 */
export async function getCachedUpcomingFixtures(
  sport: string,
  league: string,
  opts?: { limit?: number },
): Promise<Match[]> {
  const rows = await prisma.sportsFixtureCache.findMany({
    where: {
      sport,
      league,
      status: { in: ['SCHEDULED', 'LIVE'] },
      kickoff: { gte: new Date() },
    },
    orderBy: { kickoff: 'asc' },
    take: opts?.limit ?? 50,
  });

  return rows.map(rowToMatch);
}

/**
 * Get a single fixture result by external ID.
 * Returns null if not in cache or not finished.
 */
export async function getCachedFixtureResult(
  externalId: string,
): Promise<MatchResult | null> {
  const row = await prisma.sportsFixtureCache.findFirst({
    where: { externalId },
  });

  if (!row) return null;
  return rowToResult(row);
}

/**
 * Batch fetch fixture results by external IDs.
 * Three-tier fallback: SportsFixtureCache → live_scores DB → TheSportsDB API.
 */
export async function getCachedFixtureResults(
  externalIds: string[],
): Promise<Map<string, MatchResult>> {
  if (externalIds.length === 0) return new Map();

  const map = new Map<string, MatchResult>();

  // ── Source 1: SportsFixtureCache (primary) ──
  const rows = await prisma.sportsFixtureCache.findMany({
    where: { externalId: { in: externalIds }, status: 'FINISHED' },
  });
  for (const row of rows) {
    const result = rowToResult(row);
    if (result) map.set(row.externalId, result);
  }

  // ── Source 2: live_scores table (fallback — captures FT from livescore polling) ──
  const missing1 = externalIds.filter(id => !map.has(id));
  if (missing1.length > 0) {
    try {
      const liveRows = await prisma.liveScore.findMany({
        where: { eventId: { in: missing1 }, status: { in: [...FINISHED_STATUSES] } },
      });
      for (const row of liveRows) {
        const winner = row.homeScore > row.awayScore ? 'HOME' as const
          : row.awayScore > row.homeScore ? 'AWAY' as const
          : 'DRAW' as const;
        map.set(row.eventId, {
          matchId: row.eventId,
          status: 'FINISHED',
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          winner,
        });
        // Sync back to SportsFixtureCache so next time it's found in primary
        prisma.sportsFixtureCache.updateMany({
          where: { externalId: row.eventId },
          data: { status: 'FINISHED', homeScore: row.homeScore, awayScore: row.awayScore, winner, lastSyncedAt: new Date() },
        }).catch(() => {});
      }
      if (liveRows.length > 0) {
        console.log(`[FixtureCache] Resolved ${liveRows.length} result(s) from live_scores DB fallback`);
      }
    } catch { /* best-effort */ }
  }

  // ── Source 3: TheSportsDB /lookup/event API (final fallback, max 5 per cycle) ──
  const missing2 = externalIds.filter(id => !map.has(id));
  const toFetch = missing2.slice(0, API_LOOKUP_LIMIT);
  for (const eventId of toFetch) {
    try {
      const data = await sportsDbFetchV2(`lookup/event/${eventId}`);
      const evt = data?.lookup?.[0];
      if (!evt) continue;
      const status = (evt.strStatus || '').trim();
      const homeScore = Number(evt.intHomeScore);
      const awayScore = Number(evt.intAwayScore);
      // Only use if the API confirms the match is finished with valid scores
      if (!FINISHED_STATUSES.has(status) || isNaN(homeScore) || isNaN(awayScore)) continue;
      const winner = homeScore > awayScore ? 'HOME' as const
        : awayScore > homeScore ? 'AWAY' as const
        : 'DRAW' as const;
      map.set(eventId, { matchId: eventId, status: 'FINISHED', homeScore, awayScore, winner });
      // Sync to both caches
      prisma.sportsFixtureCache.updateMany({
        where: { externalId: eventId },
        data: { status: 'FINISHED', homeScore, awayScore, winner, lastSyncedAt: new Date() },
      }).catch(() => {});
      prisma.liveScore.upsert({
        where: { eventId },
        create: { eventId, sport: evt.strSport || '', league: evt.strLeague || '', homeTeam: evt.strHomeTeam || '', awayTeam: evt.strAwayTeam || '', homeScore, awayScore, status, progress: '', homeTeamBadge: evt.strHomeTeamBadge || '', awayTeamBadge: evt.strAwayTeamBadge || '', homeTeamNorm: (evt.strHomeTeam || '').toLowerCase().replace(/[^a-z0-9]/g, '') },
        update: { homeScore, awayScore, status },
      }).catch(() => {});
      console.log(`[FixtureCache] Resolved ${evt.strHomeTeam} ${homeScore}-${awayScore} ${evt.strAwayTeam} from API lookup`);
    } catch { /* rate limit or network error — skip */ }
  }

  return map;
}

/**
 * Get all cached fixtures for a sport+league (any status).
 * Used by assignMatchdayToRound to pick fixtures for a tournament round.
 */
export async function getCachedMatchdayFixtures(
  sport: string,
  league: string,
  matchday?: number,
): Promise<Match[]> {
  const where: any = { sport, league };
  if (matchday != null) where.matchday = matchday;
  else {
    where.status = { in: ['SCHEDULED', 'LIVE'] };
    where.kickoff = { gte: new Date() };
  }

  const rows = await prisma.sportsFixtureCache.findMany({
    where,
    orderBy: { kickoff: 'asc' },
  });

  return rows.map(rowToMatch);
}

// ── Sync job helpers (used by fixture-sync.ts) ─────────────────────────────

/**
 * Get fixtures that need live polling: kickoff passed, within 3h window, not finished.
 */
export async function getFixturesNeedingPoll(): Promise<Array<{
  externalId: string;
  sport: string;
  league: string;
  apiSource: string;
  kickoff: Date;
  lastSyncedAt: Date;
}>> {
  const now = new Date();
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  return prisma.sportsFixtureCache.findMany({
    where: {
      status: { notIn: ['FINISHED', 'CANCELLED', 'POSTPONED'] },
      kickoff: { lte: now, gte: threeHoursAgo },
    },
    select: { externalId: true, sport: true, league: true, apiSource: true, kickoff: true, lastSyncedAt: true },
  });
}

/**
 * Get fixtures with stale data: kicking off within 1h, cache >6h old.
 */
export async function getStalePreMatchFixtures(): Promise<Array<{
  externalId: string;
  sport: string;
  league: string;
  apiSource: string;
}>> {
  const now = new Date();
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  return prisma.sportsFixtureCache.findMany({
    where: {
      status: 'SCHEDULED',
      kickoff: { gte: now, lte: oneHourFromNow },
      lastSyncedAt: { lt: sixHoursAgo },
    },
    select: { externalId: true, sport: true, league: true, apiSource: true },
  });
}

// ── Cache readiness ────────────────────────────────────────────────────────

let _cacheReady = false;

export function markFixtureCacheReady(): void {
  _cacheReady = true;
}

export function isFixtureCacheReady(): boolean {
  return _cacheReady;
}
