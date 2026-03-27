import { sportsDbFetchV2 } from './api-sports-fetch';
import { prisma } from '../../db';

/**
 * TheSportsDB Event Status Reference (complete, per official docs)
 * ─────────────────────────────────────────────────────────────────
 *
 * SOCCER:        TBD, NS, 1H, HT, 2H, ET, P, BT, FT, AET, PEN, SUSP, INT, PST, CANC, ABD, AWD, WO
 * BASKETBALL:    NS, Q1, Q2, Q3, Q4, OT, BT, HT, FT, AOT, POST, CANC, SUSP, AWD, ABD
 * ICE HOCKEY:    NS, P1, P2, P3, OT, PT, BT, FT, AOT, AP, AW, POST, CANC, INTR, ABD
 * AM. FOOTBALL:  NS, Q1, Q2, Q3, Q4, OT, HT, FT, AOT, CANC, PST
 * BASEBALL:      NS, IN1–IN9, FT, POST, CANC, INTR, ABD
 * HANDBALL:      NS, 1H, 2H, HT, ET, BT, PT, FT, AET, AP, AW, POST, CANC, INTR, ABD, WO
 * RUGBY:         NS, 1H, 2H, HT, ET, BT, PT, FT, AET, AW, POST, CANC, INTR, ABD
 * VOLLEYBALL:    NS, S1–S5, FT, AW, POST, CANC, INTR, ABD
 *
 * Livescore JSON fields:
 *   idLiveScore, idEvent, strSport, idLeague, strLeague,
 *   idHomeTeam, idAwayTeam, strHomeTeam, strAwayTeam,
 *   strHomeTeamBadge, strAwayTeamBadge,
 *   intHomeScore, intAwayScore,
 *   strStatus, strProgress, strEventTime, dateEvent, updated
 *
 * Endpoints:
 *   /api/v2/json/livescore/all              — all sports
 *   /api/v2/json/livescore/{strSport}       — by sport name
 *   /api/v2/json/livescore/{idLeague}       — by league ID
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LiveScore {
  eventId: string;
  homeScore: number;
  awayScore: number;
  status: string;      // Raw TheSportsDB status code
  progress: string;    // '45', '90+3', 'Q3 8:42', etc.
  homeTeam: string;
  awayTeam: string;
  league: string;
  sport: string;       // 'Soccer', 'Basketball', 'Ice Hockey', etc.
  homeTeamBadge: string;
  awayTeamBadge: string;
  updatedAt: number;   // timestamp ms
}

// ─── Status classification ───────────────────────────────────────────────────

/** Statuses where the event should be removed from cache (not playable, no score) */
const SKIP_STATUSES = new Set([
  'NS', 'TBD',                          // Not started
  'PST', 'POST',                         // Postponed
  'CANC',                                // Cancelled
  'ABD',                                 // Abandoned
  'AWD', 'AW',                           // Awarded / technical loss
  'WO',                                  // Walkover
  'SUSP',                                // Suspended
  'INT', 'INTR',                         // Interrupted
]);

/** Statuses that mean the match is finished (keep in cache for final score) */
export const FINISHED_STATUSES = new Set([
  'FT',                                  // Full Time
  'AET',                                 // After Extra Time
  'PEN',                                 // After Penalties (soccer)
  'AOT',                                 // After Overtime
  'AP',                                  // After Penalties (hockey/handball)
]);

// ─── In-memory cache ─────────────────────────────────────────────────────────

const cache = new Map<string, LiveScore>();
const teamNameIndex = new Map<string, string>(); // normalized team → eventId
let polling = false;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function normalizeTeam(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ─── Cache getters (internal — used by the WithFallback functions below) ─────

const CACHE_TTL_MS = 1_200_000; // 20 min — survives NHL/NBA intermissions

function getLiveScore(eventId: string): LiveScore | null {
  const entry = cache.get(eventId);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL_MS) return null;
  return entry;
}

function getLiveScoreByTeam(homeTeam: string): LiveScore | null {
  const key = normalizeTeam(homeTeam);
  const eventId = teamNameIndex.get(key);
  if (!eventId) return null;
  return getLiveScore(eventId);
}

function getAllLiveScores(): LiveScore[] {
  const now = Date.now();
  return Array.from(cache.values()).filter(e => now - e.updatedAt < CACHE_TTL_MS);
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_FALLBACK_TTL_MS = 4 * 3_600_000;   // 4h — max age for DB fallback results
const DB_CLEANUP_AGE_MS = 24 * 3_600_000;    // 24h — delete old DB entries
const CACHE_CLEANUP_MS = 1_500_000;           // 25 min — stale cache eviction
const POLL_INTERVAL_MS = 30_000;              // 30s — livescore polling interval
export const API_LOOKUP_LIMIT = 5;             // Max API lookups per resolver cycle (rate limit)

// ─── Public getters (async — cache + DB fallback) ────────────────────────────

export async function getLiveScoreWithFallback(eventId: string): Promise<LiveScore | null> {
  // 1. Check cache first
  const cached = getLiveScore(eventId);
  if (cached) return cached;

  // 2. Fallback to DB (entries up to 4h old)
  try {
    const row = await prisma.liveScore.findUnique({ where: { eventId } });
    if (!row) return null;
    if (Date.now() - row.updatedAt.getTime() > DB_FALLBACK_TTL_MS) return null;
    return dbRowToLiveScore(row);
  } catch {
    return null;
  }
}

export async function getLiveScoreByTeamWithFallback(homeTeam: string): Promise<LiveScore | null> {
  // 1. Check cache
  const cached = getLiveScoreByTeam(homeTeam);
  if (cached) return cached;

  // 2. Fallback to DB by normalized team name
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

export async function getAllLiveScoresWithFallback(): Promise<LiveScore[]> {
  // 1. Cache first
  const cached = getAllLiveScores();
  if (cached.length > 0) return cached;

  // 2. Fallback to DB — return entries updated in the last 4h
  try {
    const rows = await prisma.liveScore.findMany({
      where: { updatedAt: { gt: new Date(Date.now() - DB_FALLBACK_TTL_MS) } },
    });
    return rows.map(dbRowToLiveScore);
  } catch {
    return [];
  }
}

// ─── DB helpers ──────────────────────────────────────────────────────────────

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

async function persistToDb(entries: LiveScore[]): Promise<void> {
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
async function syncFinishedToUi(entries: LiveScore[]): Promise<void> {
  const finished = entries.filter(e => FINISHED_STATUSES.has(e.status));
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

async function cleanupOldDbEntries(): Promise<void> {
  try {
    await prisma.liveScore.deleteMany({
      where: { updatedAt: { lt: new Date(Date.now() - DB_CLEANUP_AGE_MS) } },
    });
  } catch { /* best-effort */ }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function pollLiveScores(): Promise<void> {
  try {
    const data = await sportsDbFetchV2('livescore/all');
    const events = data?.livescore || [];

    const sportCounts: Record<string, number> = {};
    const toPersist: LiveScore[] = [];

    for (const e of events) {
      if (!e.idEvent) continue;
      const status = (e.strStatus || '').trim();
      if (!status) continue;

      // Remove cancelled/postponed events from cache
      if (SKIP_STATUSES.has(status)) {
        const eid = String(e.idEvent);
        if (cache.has(eid)) cache.delete(eid);
        continue;
      }

      const sport = e.strSport || 'Unknown';
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;

      const eventId = String(e.idEvent);
      const entry: LiveScore = {
        eventId,
        homeScore: Number(e.intHomeScore ?? 0),
        awayScore: Number(e.intAwayScore ?? 0),
        status,
        progress: (e.strProgress || '').trim(),
        homeTeam: e.strHomeTeam || '',
        awayTeam: e.strAwayTeam || '',
        league: e.strLeague || '',
        sport,
        homeTeamBadge: e.strHomeTeamBadge || '',
        awayTeamBadge: e.strAwayTeamBadge || '',
        updatedAt: Date.now(),
      };

      cache.set(eventId, entry);
      toPersist.push(entry);

      // Build team name index for football lookups
      if (e.strHomeTeam) {
        teamNameIndex.set(normalizeTeam(e.strHomeTeam), eventId);
      }
    }

    // Persist to DB (non-blocking)
    persistToDb(toPersist).catch(() => {});
    syncFinishedToUi(toPersist).catch(() => {});

    // Clean stale entries from in-memory cache (older than 25 min)
    const now = Date.now();
    for (const [key, val] of cache) {
      if (now - val.updatedAt > CACHE_CLEANUP_MS) cache.delete(key);
    }

    const summary = Object.entries(sportCounts).map(([s, n]) => `${s}:${n}`).join(', ');
    if (summary) {
      console.log(`[LiveScore] ${summary} (${toPersist.length} persisted to DB)`);
    }
  } catch (error) {
    // Silently skip — livescore is best-effort
  }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

export function startLiveScorePolling(): void {
  if (polling) return;
  polling = true;

  // Initial poll
  pollLiveScores().catch(() => {});

  // Poll every 30s
  pollInterval = setInterval(() => {
    pollLiveScores().catch(() => {});
  }, POLL_INTERVAL_MS);

  // Cleanup old DB entries once a day
  setInterval(() => {
    cleanupOldDbEntries().catch(() => {});
  }, DB_CLEANUP_AGE_MS);

  console.log('[LiveScore] Polling started (every 30s, persisting to DB)');
}

export function stopLiveScorePolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  polling = false;
}
