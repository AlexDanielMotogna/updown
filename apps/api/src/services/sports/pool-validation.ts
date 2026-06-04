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
 * Three sources of truth for "this sport has reliable live coverage":
 *
 *  1. **Env override (`SPORTS_POOL_WHITELIST`)** — if set, wins over
 *     everything. Use for emergency rollouts ("turn on tennis right
 *     now because a tournament started") or rollbacks ("turn off
 *     basketball, SDB feed is misbehaving").
 *
 *  2. **Observed coverage (`live_scores` rows in the last
 *     `OBSERVATION_WINDOW_MS`)** — distinct sports we've actually
 *     received a livescore row for recently. This is the canonical
 *     answer because it's empirical: if we've been getting Basketball
 *     livescores all week, basketball is covered. If we haven't seen
 *     Tennis in 7 days, tennis is dark. Self-healing — when SDB
 *     starts/stops covering a sport, our policy follows automatically.
 *
 *  3. **Bootstrap fallback** — when the API has just started on a
 *     fresh DB the `live_scores` table is empty. Falling back to
 *     `DEFAULT_LIVE_COVERED_SPORTS` for the first observation window
 *     keeps pool creation alive while the livescore poller fills the
 *     table. Once even one row lands for a sport, that sport is the
 *     fresh source of truth.
 *
 * Cache: the observed-set query is cheap (single distinct on an
 * indexed column) but called per pool creation. 5-minute in-process
 * cache absorbs the burst when the scheduler creates many pools in a
 * tick.
 */
/**
 * Bootstrap fallback used when the `live_scores` table is empty
 * (cold start on a fresh DB) and the env override is unset. THIS LIST
 * MUST MATCH THE PROVIDER'S DECLARED LIVE COVERAGE — the steady-state
 * decision flows from observed rows, but the bootstrap window is
 * exposed to the operator before the poller fills the table.
 *
 * TheSportsDB confirmed coverage 2026-06-04 (operator received written
 * confirmation from the SDB account contact):
 *
 *   Soccer, NFL (American Football), Basketball, Baseball, Ice Hockey
 *
 * Previous versions of this list (Fighting + Rugby) were assumed,
 * NOT verified — the assumption was wrong and would have produced
 * zombie pools the moment a fresh deploy created a Fighting or Rugby
 * pool inside the bootstrap window. Don't reintroduce sports here
 * without a documented coverage signal from the provider.
 */
const DEFAULT_LIVE_COVERED_SPORTS = new Set([
  'Soccer',
  'American Football',
  'Basketball',
  'Baseball',
  'Ice Hockey',
]);

const OBSERVATION_WINDOW_MS = 7 * 24 * 60 * 60_000; // 7 days
const COVERAGE_CACHE_MS = 5 * 60_000;

interface CoverageSnapshot {
  envOverride: Set<string> | null;
  observed: Set<string>;
  effective: Set<string>;
  source: 'env' | 'observed' | 'bootstrap';
  cachedAt: number;
}

let coverageCache: CoverageSnapshot | null = null;

const ENV_OVERRIDE: Set<string> | null = (() => {
  const raw = process.env.SPORTS_POOL_WHITELIST;
  if (!raw) return null;
  const items = raw.split(',').map(s => s.trim()).filter(Boolean);
  return items.length > 0 ? new Set(items) : null;
})();

/**
 * Hit the `live_scores` table for distinct sports we've seen in the
 * observation window, merge with env / bootstrap rules, cache for the
 * COVERAGE_CACHE_MS window. The cache is invalidated only by time so
 * a sport that goes dark today doesn't disappear from the whitelist
 * until the cache expires — that's fine, the pool-creation impact of
 * a stale 5-minute decision is negligible compared to the constant
 * DB churn of querying every call.
 */
export async function getCoverageSnapshot(): Promise<CoverageSnapshot> {
  const now = Date.now();
  if (coverageCache && now - coverageCache.cachedAt < COVERAGE_CACHE_MS) {
    return coverageCache;
  }
  const since = new Date(now - OBSERVATION_WINDOW_MS);
  const rows = await prisma.liveScore.findMany({
    where: { updatedAt: { gt: since } },
    select: { sport: true },
    distinct: ['sport'],
  });
  const observed = new Set(
    rows.map(r => r.sport).filter((s): s is string => !!s && s !== 'Unknown'),
  );

  let effective: Set<string>;
  let source: CoverageSnapshot['source'];
  if (ENV_OVERRIDE) {
    effective = ENV_OVERRIDE;
    source = 'env';
  } else if (observed.size > 0) {
    effective = observed;
    source = 'observed';
  } else {
    effective = DEFAULT_LIVE_COVERED_SPORTS;
    source = 'bootstrap';
  }
  coverageCache = { envOverride: ENV_OVERRIDE, observed, effective, source, cachedAt: now };
  return coverageCache;
}

/** Test-only — drops the in-memory cache so unit tests don't carry
 *  state across scenarios. */
export function __resetCoverageCache(): void {
  coverageCache = null;
}

export async function isSportLiveCovered(sportName: string | null | undefined): Promise<boolean> {
  if (!sportName) return false;
  const snapshot = await getCoverageSnapshot();
  return snapshot.effective.has(sportName);
}

/** Effective allow-list (env > observed > bootstrap). Used by the
 *  admin badges + the create-pool guard. */
export async function getLiveCoveredSports(): Promise<string[]> {
  const snapshot = await getCoverageSnapshot();
  return [...snapshot.effective];
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
