import { prisma } from '../../../db';
import type { LiveScore } from './types';
import { DB_FALLBACK_TTL_MS, DB_CLEANUP_AGE_MS, isFinishedStatus, normalizeTeam } from './types';
import { regulationWinner } from '../regulation-time';

// ─── DB → LiveScore conversion ───────────────────────────────────────────────

function dbRowToLiveScore(row: {
  eventId: string; sport: string; league: string;
  homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number;
  status: string; progress: string;
  homeTeamBadge: string; awayTeamBadge: string;
  updatedAt: Date;
}): LiveScore {
  return {
    eventId: row.eventId,
    homeScore: row.homeScore,
    awayScore: row.awayScore,
    status: row.status,
    progress: row.progress,
    homeTeam: row.homeTeam,
    awayTeam: row.awayTeam,
    league: row.league,
    sport: row.sport,
    homeTeamBadge: row.homeTeamBadge,
    awayTeamBadge: row.awayTeamBadge,
    updatedAt: row.updatedAt.getTime(),
  };
}

// ─── Write operations ────────────────────────────────────────────────────────

export async function persistToDb(entries: LiveScore[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    await prisma.$transaction(
      entries.map(e =>
        prisma.liveScore.upsert({
          where: { eventId: e.eventId },
          create: {
            eventId: e.eventId,
            sport: e.sport,
            league: e.league,
            homeTeam: e.homeTeam,
            awayTeam: e.awayTeam,
            homeScore: e.homeScore,
            awayScore: e.awayScore,
            status: e.status,
            progress: e.progress,
            homeTeamBadge: e.homeTeamBadge,
            awayTeamBadge: e.awayTeamBadge,
            homeTeamNorm: normalizeTeam(e.homeTeam),
          },
          update: {
            homeScore: e.homeScore,
            awayScore: e.awayScore,
            status: e.status,
            progress: e.progress,
            homeTeamBadge: e.homeTeamBadge,
            awayTeamBadge: e.awayTeamBadge,
          },
        })
      )
    );
  } catch (error) {
    console.error('[LiveScore] DB persist error:', (error as Error).message);
  }
}

/**
 * When we capture a FT event, immediately update the pool's homeScore/awayScore
 * and the fixture cache so the UI reflects the final score without waiting for
 * the 5-minute resolver cycle.
 */
export async function syncFinishedToUi(entries: LiveScore[]): Promise<void> {
  const finished = entries.filter(e => isFinishedStatus(e.status));
  if (finished.length === 0) return;

  for (const e of finished) {
    // Regulation-time rules - when the upstream status indicates AET/PEN, the
    // 90-minute result was a draw and the pool resolves to DRAW even though
    // one side eventually won. Falls back to score-based winner for non-AET.
    const winner = regulationWinner(e.homeScore, e.awayScore, e.status);

    // Update pool score for immediate UI display
    prisma.pool.updateMany({
      where: { matchId: e.eventId, homeScore: null },
      data: { homeScore: e.homeScore, awayScore: e.awayScore },
    }).catch(() => {});

    // Update fixture cache to FINISHED so resolver finds it instantly.
    // Composite scope (externalId, sport, apiSource) — bare externalId
    // would risk bleed across data sources. LiveScore entries are
    // SDB-sourced so apiSource is the SDB constant 'sports'.
    prisma.sportsFixtureCache.updateMany({
      where: { externalId: e.eventId, sport: e.sport, apiSource: 'sports', status: { not: 'FINISHED' } },
      data: { status: 'FINISHED', homeScore: e.homeScore, awayScore: e.awayScore, winner, lastSyncedAt: new Date() },
    }).catch(() => {});
  }

  console.log(`[LiveScore] Synced ${finished.length} finished event(s) to pools & fixture cache`);
}

// ─── Read operations (DB fallback) ───────────────────────────────────────────

export async function loadFromDb(): Promise<LiveScore[]> {
  try {
    const rows = await prisma.liveScore.findMany({
      where: { updatedAt: { gt: new Date(Date.now() - DB_FALLBACK_TTL_MS) } },
    });
    return rows.map(dbRowToLiveScore);
  } catch {
    return [];
  }
}

export async function getFromDb(eventId: string): Promise<LiveScore | null> {
  try {
    const row = await prisma.liveScore.findUnique({ where: { eventId } });
    if (!row) return null;
    if (Date.now() - row.updatedAt.getTime() > DB_FALLBACK_TTL_MS) return null;
    return dbRowToLiveScore(row);
  } catch {
    return null;
  }
}

/**
 * DB-fallback team-name lookup. Must take `kickoffMs` to avoid the
 * cross-day collision the 2026-06-03 livescore bug exposed: querying
 * by team name + a "freshness" window (updatedAt > now - 4h) happily
 * returns yesterday's same-team game when its row is still warm.
 *
 * The reject rule mirrors cacheGetByTeam: refuse rows whose
 * `updatedAt` is older than `kickoffMs - 2h`. Today's pool starting
 * at 17:00 will not be matched to a row last updated at yesterday's
 * 22:00.
 *
 * The freshness window is kept as a secondary guard — old rows older
 * than DB_FALLBACK_TTL_MS are still excluded so a stale row from
 * three days ago can't slip through if the pool's kickoff is in the
 * future.
 */
const DB_MATCH_LIFE_WINDOW_MS = 2 * 3_600_000;
export async function getFromDbByTeam(homeTeam: string, kickoffMs?: number): Promise<LiveScore | null> {
  try {
    const norm = normalizeTeam(homeTeam);
    const lowerBound = kickoffMs != null
      ? new Date(kickoffMs - DB_MATCH_LIFE_WINDOW_MS)
      : new Date(Date.now() - DB_FALLBACK_TTL_MS);
    const row = await prisma.liveScore.findFirst({
      where: {
        homeTeamNorm: norm,
        updatedAt: { gt: lowerBound },
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) return null;
    return dbRowToLiveScore(row);
  } catch {
    return null;
  }
}

export async function getAllFromDb(): Promise<LiveScore[]> {
  try {
    const rows = await prisma.liveScore.findMany({
      where: { updatedAt: { gt: new Date(Date.now() - DB_FALLBACK_TTL_MS) } },
    });
    return rows.map(dbRowToLiveScore);
  } catch {
    return [];
  }
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

export async function cleanupOldDbEntries(): Promise<void> {
  try {
    await prisma.liveScore.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - DB_CLEANUP_AGE_MS) } },
    });
  } catch { /* best-effort */ }
}
