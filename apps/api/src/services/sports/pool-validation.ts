/**
 * Three-layer defence against creating sports pools for matches that
 * already happened, were rescheduled, or were silently deleted from the
 * upstream source. Triggered by the 2026-06-04 incident where a WTA
 * tennis pool (`1c557f78-…`) surfaced with `kickoff: 2026-06-04 09:00`
 * for a match that had actually been played the day before — SDB
 * dropped the event from its catalog without flipping our cache row,
 * and we had no second source to catch it.
 *
 * Layer 1 — Sport whitelist (`isSportLiveCovered`):
 *   Only sports we've proven have working live-score coverage make it
 *   into the pool-creation loop. Tennis / Golf / Cricket / F1 / Esports
 *   are blocked until we add a real live feed for them. Cheap, catches
 *   the long tail of "we sync the fixture but never get a result".
 *
 * Layer 2 — SDB re-validation at creation (`revalidateSdbEventBeforeCreation`):
 *   Single fresh lookup against TheSportsDB right before
 *   `prisma.pool.create`. Catches the "cache row was synced last week,
 *   event got moved / deleted since" case. ~80 pools/day × 1 call =
 *   well under the SDB 30/min limit.
 *
 * Layer 3 — Post-creation zombie audit (`findZombieSportsPools`):
 *   Cron sweep finds JOINING/ACTIVE sports pools whose
 *   `lockTime + 2× expected duration` is past with no live-score row.
 *   Those almost certainly never had real coverage; the admin tab
 *   surfaces them for force-refund. Net of last resort.
 */

import { sportsDbFetchV2 } from './api-sports-fetch';
import { prisma } from '../../db';
import { logEvent } from '../../scheduler/resolver-types';
import { EXPECTED_MATCH_DURATION_MS, DEFAULT_EXPECTED_DURATION_MS } from './livescore/types';

// ─── Layer 1 — Sport whitelist ────────────────────────────────────────────────

/**
 * SDB `strSport` values for which we've confirmed live-score coverage
 * — either through the SDB v2 `/livescore/all` feed (observed daily
 * across these sports) OR through the Odds API fallback (mapped via
 * `LEAGUE_TO_ODDS_API`).
 *
 * Anything outside this set is a gamble — SDB will quietly stop
 * publishing scores mid-tournament, the Odds API doesn't cover the
 * generic tour, and we end up with zombie pools.
 *
 * Override at runtime via env so the operator can A/B add a sport
 * without a redeploy: `SPORTS_POOL_WHITELIST=Soccer,Basketball,…`.
 */
const DEFAULT_LIVE_COVERED_SPORTS = new Set([
  'Soccer',
  'Basketball',
  'Baseball',
  'Ice Hockey',
  'American Football',
  'Fighting',
  'Rugby',
]);

const LIVE_COVERED_SPORTS: Set<string> = (() => {
  const raw = process.env.SPORTS_POOL_WHITELIST;
  if (!raw) return DEFAULT_LIVE_COVERED_SPORTS;
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? new Set(items) : DEFAULT_LIVE_COVERED_SPORTS;
})();

export function isSportLiveCovered(sportName: string | null | undefined): boolean {
  if (!sportName) return false;
  return LIVE_COVERED_SPORTS.has(sportName);
}

export function getLiveCoveredSports(): string[] {
  return [...LIVE_COVERED_SPORTS];
}

// ─── Layer 2 — SDB re-validation ──────────────────────────────────────────────

/**
 * Statuses that mean the event already concluded. Pulling these into a
 * single set keeps the revalidator decisive — anything in the set is
 * "do not create pool, the match is over".
 *
 * Includes the regulation-time finishers and the rare "ATP / WTA"
 * tennis variants SDB uses ("Match Finished", "Walkover", "Retired",
 * etc.). The Soccer set extends naturally to most other sports.
 */
const FINISHED_STATUSES = new Set([
  'FT', 'AET', 'PEN', 'AOT', 'AP',
  'Match Finished', 'Final', 'Finished',
  'Walkover', 'Retired', 'Cancelled', 'Abandoned',
]);

export type RevalidationResult =
  | { ok: true; kickoff: Date }
  | { ok: false; reason: 'not-found' | 'finished' | 'in-progress' | 'rescheduled' | 'malformed'; detail?: string };

/**
 * Hit SDB's lookup-by-event-id with the matchId we're about to create
 * a pool for and decide whether the cached fixture is still safe to
 * trust.
 *
 * Returns `{ ok: true }` only when:
 *   • Event exists in SDB right now (no "No data found")
 *   • Status isn't a finished marker
 *   • intHomeScore / intAwayScore are null (no result populated yet)
 *   • Kickoff parsed from strTimestamp is in the future
 *
 * The caller skips pool creation on any non-`ok` result and lets the
 * cache row stale out naturally — we don't actively delete here to
 * avoid races with the bulk sync that might bring the event back.
 */
export async function revalidateSdbEventBeforeCreation(eventId: string): Promise<RevalidationResult> {
  let evt: any;
  try {
    const data = await sportsDbFetchV2(`lookup/event/${eventId}`);
    evt = data?.lookup?.[0];
  } catch (err) {
    // Network / rate-limit error — be conservative. We don't want a
    // flaky SDB to block every pool creation, so treat this as "don't
    // know, trust the cache" by returning ok=true with a far-future
    // kickoff. The cache row already passed the kickoff-in-future
    // filter upstream.
    return { ok: false, reason: 'malformed', detail: err instanceof Error ? err.message : String(err) };
  }
  if (!evt) {
    return { ok: false, reason: 'not-found' };
  }
  const rawStatus = (evt.strStatus || '').trim();
  if (rawStatus && FINISHED_STATUSES.has(rawStatus)) {
    return { ok: false, reason: 'finished', detail: rawStatus };
  }
  // SDB sometimes leaves strStatus empty but populates scores once a
  // match concludes (especially for tennis). Treat scored events as
  // finished regardless of strStatus.
  if (evt.intHomeScore != null && evt.intHomeScore !== '' && evt.intAwayScore != null && evt.intAwayScore !== '') {
    return { ok: false, reason: 'finished', detail: `score=${evt.intHomeScore}-${evt.intAwayScore}` };
  }
  // Parse kickoff. SDB uses strTimestamp (ISO-ish) for most events
  // and falls back to dateEvent + strEventTime for a few.
  const ts = evt.strTimestamp
    || (evt.dateEvent && evt.strEventTime ? `${evt.dateEvent}T${evt.strEventTime}` : null);
  if (!ts) {
    return { ok: false, reason: 'malformed', detail: 'no timestamp' };
  }
  const kickoff = new Date(ts);
  if (Number.isNaN(kickoff.getTime())) {
    return { ok: false, reason: 'malformed', detail: `bad timestamp "${ts}"` };
  }
  if (kickoff.getTime() < Date.now()) {
    // Either in-progress or just-finished — caller skips either way.
    return { ok: false, reason: 'in-progress' };
  }
  return { ok: true, kickoff };
}

// ─── Layer 3 — Post-creation zombie audit ─────────────────────────────────────

export interface ZombiePool {
  id: string;
  matchId: string;
  league: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  startTime: Date;
  lockTime: Date;
  status: string;
  betCount: number;
  expectedEnd: Date;
  hoursOverdue: number;
}

/**
 * JOINING/ACTIVE sports pools whose `lockTime + 2 × expected match
 * duration` is in the past and that still have no `live_score` row.
 *
 * Twice the expected duration is the slack — football extra time +
 * penalties can drag a 90-min match to 150 min; the multiplier
 * absorbs outliers without being so generous it loses zombies. The
 * caller (admin tab + scheduler audit job) decides what to do with
 * them. Force-refund and delete is the usual answer.
 */
export async function findZombieSportsPools(): Promise<ZombiePool[]> {
  const cutoff = new Date();
  const pools = await prisma.pool.findMany({
    where: {
      poolType: 'SPORTS',
      status: { in: ['JOINING', 'ACTIVE'] },
      lockTime: { lt: cutoff },
    },
    select: {
      id: true, matchId: true, league: true, homeTeam: true, awayTeam: true,
      startTime: true, lockTime: true, status: true,
      _count: { select: { bets: true } },
    },
  });
  const zombies: ZombiePool[] = [];
  const matchIds = pools.map(p => p.matchId).filter((m): m is string => !!m);
  const liveScores = matchIds.length > 0
    ? await prisma.liveScore.findMany({ where: { eventId: { in: matchIds } }, select: { eventId: true } })
    : [];
  const hasLiveScore = new Set(liveScores.map(s => s.eventId));
  const nowMs = cutoff.getTime();
  for (const p of pools) {
    if (!p.matchId) continue;
    const expectedDurationMs = EXPECTED_MATCH_DURATION_MS[p.league || ''] ?? DEFAULT_EXPECTED_DURATION_MS;
    const expectedEndMs = p.lockTime.getTime() + 2 * expectedDurationMs;
    if (expectedEndMs > nowMs) continue;
    if (hasLiveScore.has(p.matchId)) continue;
    zombies.push({
      id: p.id,
      matchId: p.matchId,
      league: p.league,
      homeTeam: p.homeTeam,
      awayTeam: p.awayTeam,
      startTime: p.startTime,
      lockTime: p.lockTime,
      status: p.status,
      betCount: p._count.bets,
      expectedEnd: new Date(expectedEndMs),
      hoursOverdue: Math.round(((nowMs - expectedEndMs) / 3600_000) * 10) / 10,
    });
  }
  return zombies;
}

/**
 * Logs each zombie to `event_log` for the admin tab. Runs from the
 * 30-min scheduler tick. Idempotent: re-running emits new event_log
 * rows but doesn't double-flag the pool.
 */
export async function logZombieSportsPools(zombies: ZombiePool[]): Promise<void> {
  for (const z of zombies) {
    await logEvent(prisma, 'SPORTS_POOL_ZOMBIE_DETECTED', 'pool', z.id, {
      matchId: z.matchId,
      league: z.league ?? '',
      teams: `${z.homeTeam ?? ''} vs ${z.awayTeam ?? ''}`,
      hoursOverdue: z.hoursOverdue.toString(),
      betCount: z.betCount.toString(),
      expectedEnd: z.expectedEnd.toISOString(),
    }).catch(() => { /* best-effort */ });
  }
}
