import { prisma } from '../../../db';
import type { LiveScore } from './types';
import { DB_FALLBACK_TTL_MS, DB_CLEANUP_AGE_MS, isFinishedStatus, normalizeTeam } from './types';

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
    const winner = e.homeScore > e.awayScore ? 'HOME'
      : e.awayScore > e.homeScore ? 'AWAY' : 'DRAW';

    // Update pool score for immediate UI display
    prisma.pool.updateMany({
      where: { matchId: e.eventId, homeScore: null },
      data: { homeScore: e.homeScore, awayScore: e.awayScore },
    }).catch(() => {});

    // Update fixture cache to FINISHED so resolver finds it instantly
    prisma.sportsFixtureCache.updateMany({
      where: { externalId: e.eventId, status: { not: 'FINISHED' } },
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

export async function getFromDbByTeam(homeTeam: string): Promise<LiveScore | null> {
  try {
    const norm = normalizeTeam(homeTeam);
    const row = await prisma.liveScore.findFirst({
      where: {
        homeTeamNorm: norm,
        updatedAt: { gt: new Date(Date.now() - DB_FALLBACK_TTL_MS) },
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
