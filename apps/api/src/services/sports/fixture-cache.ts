import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import type { Match, MatchResult, MatchStatus } from './types';
import { sportsDbFetchV2 } from './api-sports-fetch';
import { FINISHED_STATUSES, API_LOOKUP_LIMIT, isFinishedStatus, normalizeStatus } from './livescore';
import { regulationWinner, isNoTieSport } from './regulation-time';

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
  sport?: string | null;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
}): MatchResult | null {
  if (row.status !== 'FINISHED') return null;
  if (row.homeScore == null || row.awayScore == null) return null;

  const winner = (row.winner as 'HOME' | 'AWAY' | 'DRAW') ||
    (row.homeScore > row.awayScore ? 'HOME' : row.awayScore > row.homeScore ? 'AWAY' : 'DRAW');
  // A tied "final" for a no-tie sport (MLB/NBA/NHL) is bad/incomplete data — don't
  // treat it as a result. Returning null leaves the pool unresolved for the admin
  // to settle by hand (and for the next sync to overwrite with the true score).
  if (winner === 'DRAW' && isNoTieSport(row.sport)) return null;

  return {
    matchId: row.externalId,
    status: 'FINISHED',
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    winner,
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

  // ── Source 2: live_scores table (fallback - captures FT from livescore polling) ──
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
        // Skip phantom draws for no-tie sports — leave the pool for admin / next sync.
        if (winner === 'DRAW' && isNoTieSport(row.sport)) continue;
        map.set(row.eventId, {
          matchId: row.eventId,
          status: 'FINISHED',
          homeScore: row.homeScore,
          awayScore: row.awayScore,
          winner,
        });
        // Sync back to SportsFixtureCache so next time it's found in
        // primary. Composite scope (externalId, sport, apiSource):
        // bare externalId would risk bleed across data sources if IDs
        // ever collide. row.sport comes from the live_scores row we
        // just queried; apiSource is hard-coded 'sports' since SDB is
        // the only feed that populates this table.
        prisma.sportsFixtureCache.updateMany({
          where: { externalId: row.eventId, sport: row.sport, apiSource: 'sports' },
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
      const data = await sportsDbFetchV2<{ lookup?: Array<{
        strStatus?: string | null;
        intHomeScore?: string | number | null;
        intAwayScore?: string | number | null;
        strSport?: string | null;
        strLeague?: string | null;
        strHomeTeam?: string | null;
        strAwayTeam?: string | null;
        strHomeTeamBadge?: string | null;
        strAwayTeamBadge?: string | null;
      }> }>(`lookup/event/${eventId}`);
      const evt = data?.lookup?.[0];
      if (!evt) continue;
      const rawStatus = (evt.strStatus || '').trim();
      const status = normalizeStatus(rawStatus);
      const homeScore = Number(evt.intHomeScore);
      const awayScore = Number(evt.intAwayScore);
      // Only use if the API confirms the match is finished with valid scores
      if (!isFinishedStatus(rawStatus) || isNaN(homeScore) || isNaN(awayScore)) continue;
      // Regulation-time rules: extra-time / penalty winners collapse to DRAW.
      const winner = regulationWinner(homeScore, awayScore, rawStatus);
      // Skip phantom draws for no-tie sports (MLB/NBA/NHL) — don't cache a bogus
      // FINISHED draw; leave the pool for admin / a later sync with the real score.
      if (winner === 'DRAW' && isNoTieSport(evt.strSport)) continue;
      map.set(eventId, { matchId: eventId, status: 'FINISHED', rawStatus, homeScore, awayScore, winner });
      // Sync to both caches. Composite scope on the fixture row: SDB
      // event lookup gives us evt.strSport; apiSource is the SDB
      // constant 'sports'. Without these the updateMany could clobber
      // a different-source row that happens to share the externalId.
      prisma.sportsFixtureCache.updateMany({
        where: { externalId: eventId, sport: evt.strSport || '', apiSource: 'sports' },
        data: { status: 'FINISHED', homeScore, awayScore, winner, lastSyncedAt: new Date() },
      }).catch(() => {});
      prisma.liveScore.upsert({
        where: { eventId },
        create: { eventId, sport: evt.strSport || '', league: evt.strLeague || '', homeTeam: evt.strHomeTeam || '', awayTeam: evt.strAwayTeam || '', homeScore, awayScore, status, progress: '', homeTeamBadge: evt.strHomeTeamBadge || '', awayTeamBadge: evt.strAwayTeamBadge || '', homeTeamNorm: (evt.strHomeTeam || '').toLowerCase().replace(/[^a-z0-9]/g, '') },
        update: { homeScore, awayScore, status },
      }).catch(() => {});
      console.log(`[FixtureCache] Resolved ${evt.strHomeTeam} ${homeScore}-${awayScore} ${evt.strAwayTeam} from API lookup`);
    } catch { /* rate limit or network error - skip */ }
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
  const where: Prisma.SportsFixtureCacheWhereInput = { sport, league };
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
  const sixHoursAgo = new Date(now.getTime() - 6 * 60 * 60 * 1000);

  return prisma.sportsFixtureCache.findMany({
    where: {
      status: { notIn: ['FINISHED', 'CANCELLED', 'POSTPONED'] },
      kickoff: { lte: now, gte: sixHoursAgo },
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
