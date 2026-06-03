/**
 * Per-asset price-tick buffer fed by the Pacifica WebSocket subscription,
 * with persistent backing via the `price_ticks` Postgres table so the
 * scheduler can survive an API restart without losing the recent history
 * a pool's endTime resolution depends on.
 *
 * Why this exists:
 *   resolvePool() in scheduler/resolve-logic.ts used to call
 *   priceProvider.getSpotPrice(asset) at resolution time. The pool's
 *   resolution can run 5-15 seconds AFTER pool.endTime (5s cutoff
 *   buffer + scheduler tick latency), so the "final" price we wrote
 *   on-chain was the price NOW, not the price at endTime. For a
 *   crypto pool that's the difference between winner=UP and winner=
 *   DOWN when the strike is close to spot. Same bug class as the
 *   2026-06-03 livescore yesterday-result incident — using current
 *   data for a historical decision.
 *
 *   Pacifica doesn't expose a historical candle endpoint
 *   (/info/candles → 404), so we keep our own short-window ring
 *   buffer of ticks per asset (in memory, hot path) backed by a
 *   throttled Postgres write (~5s/asset) so cold-start can rehydrate.
 *
 * Source:
 *   The WebSocket subscription started by initWebSocket() calls
 *   priceProvider.subscribe(asset, cb) and broadcasts ticks to
 *   pool:{poolId} rooms. We just pipe the same callback into
 *   recordTick() here. From recordTick we:
 *     1. push to the in-memory ring buffer (always)
 *     2. schedule a throttled write to price_ticks (every PERSIST_INTERVAL_MS)
 *
 * Cold-start:
 *   hydratePriceHistory() loads the last HYDRATION_WINDOW_MS of ticks
 *   per asset from Postgres into the buffer. Called once at API
 *   startup from index.ts before the scheduler starts resolving
 *   anything.
 *
 * Cleanup:
 *   pruneOldTicks() deletes rows older than PRUNE_WINDOW_MS. Called
 *   on a daily cron from the scheduler.
 */

import type { PrismaClient } from '@prisma/client';

interface Tick {
  /** Stringified price with 2 decimals (matches the WS payload format). */
  price: string;
  /** ms epoch */
  timestamp: number;
}

const BUFFER_SIZE = 500;
const PERSIST_INTERVAL_MS = 5_000;
const HYDRATION_WINDOW_MS = 60 * 60_000;  // 1h — covers worst-case restart gap
const PRUNE_WINDOW_MS = 24 * 60 * 60_000; // 24h — anything older is dropped

const buffers = new Map<string, Tick[]>();
const lastPersistedAt = new Map<string, number>();
const stats = new Map<string, { totalTicks: number; lastTickAt: number; persistFailures: number }>();

// Lazily-injected prisma client. We can't import the singleton at module
// load because that pulls the env-driven URL before the test setup runs;
// initPriceHistoryPersistence() wires it from the caller instead.
let prismaRef: PrismaClient | null = null;
export function initPriceHistoryPersistence(prisma: PrismaClient): void {
  prismaRef = prisma;
}

export function recordTick(asset: string, price: string, timestamp: number): void {
  let buf = buffers.get(asset);
  if (!buf) {
    buf = [];
    buffers.set(asset, buf);
  }
  buf.push({ price, timestamp });
  // Drop oldest when over capacity. Cheaper than splice() because we
  // expect appends to be the hot path.
  if (buf.length > BUFFER_SIZE) {
    buf.shift();
  }
  const s = stats.get(asset) ?? { totalTicks: 0, lastTickAt: 0, persistFailures: 0 };
  s.totalTicks++;
  s.lastTickAt = timestamp;
  stats.set(asset, s);

  // Throttled persist: write at most one row per asset per
  // PERSIST_INTERVAL_MS so the table doesn't explode (1 tick/s × N
  // assets × 86_400 = ~350k rows/day at 1Hz, vs ~70k at 5s throttle).
  // We deliberately fire-and-forget — losing a persist is fine because
  // the in-memory buffer still has the tick, and the next tick in 5s
  // will succeed.
  if (prismaRef) {
    const last = lastPersistedAt.get(asset) ?? 0;
    if (timestamp - last >= PERSIST_INTERVAL_MS) {
      lastPersistedAt.set(asset, timestamp);
      prismaRef.priceTick.create({
        data: { asset, price, timestamp: new Date(timestamp) },
      }).catch(err => {
        // The (asset, timestamp) unique key can collide if two WS
        // callbacks race in the same ms — fine, drop silently. Other
        // failures (DB down, network) bump the counter so operations
        // can spot persistent issues.
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('Unique constraint')) {
          s.persistFailures++;
        }
      });
    }
  }
}

/**
 * Look up the price tick at or just before the target timestamp.
 *
 * Returns null when:
 *   - The buffer has no entries for the asset (no WS subscription yet
 *     AND no Postgres history to hydrate from, e.g. brand-new asset).
 *   - The oldest buffered tick is AFTER the target — we don't have
 *     history that far back.
 *   - Every tick is in the future relative to the target.
 *
 * The caller (resolve-logic) falls back to getSpotPrice in that case
 * with a warning logged — better than blocking the resolution, but the
 * caller should log it so operations can investigate.
 */
export function getPriceAtOrBefore(asset: string, targetMs: number): Tick | null {
  const buf = buffers.get(asset);
  if (!buf || buf.length === 0) return null;
  // Buffer is append-only with monotonically-increasing timestamps from
  // a single source, so binary search for the rightmost tick whose ts
  // is <= targetMs.
  let lo = 0;
  let hi = buf.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (buf[mid].timestamp <= targetMs) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best === -1) return null;
  return buf[best];
}

/**
 * Cold-start hydration. Loads up to HYDRATION_WINDOW_MS of ticks per
 * asset from Postgres into the in-memory buffer, ordered by timestamp
 * ascending so the buffer's monotonic-timestamp invariant holds.
 *
 * Idempotent: re-running just merges any new rows above the existing
 * buffer tail. Safe to call repeatedly.
 *
 * Called once at API startup BEFORE the scheduler begins resolving
 * pools — otherwise we'd race a pool whose endTime fell inside the
 * hydration window.
 */
export async function hydratePriceHistory(prisma: PrismaClient): Promise<{
  assets: number;
  ticks: number;
}> {
  const cutoff = new Date(Date.now() - HYDRATION_WINDOW_MS);
  const rows = await prisma.priceTick.findMany({
    where: { timestamp: { gte: cutoff } },
    orderBy: [{ asset: 'asc' }, { timestamp: 'asc' }],
  });
  for (const row of rows) {
    const ts = row.timestamp.getTime();
    let buf = buffers.get(row.asset);
    if (!buf) {
      buf = [];
      buffers.set(row.asset, buf);
    }
    // Don't double-insert if the same ts is already buffered (e.g.
    // re-hydrate after a brief pause without restart).
    if (buf.length > 0 && buf[buf.length - 1].timestamp >= ts) continue;
    buf.push({ price: row.price, timestamp: ts });
    if (buf.length > BUFFER_SIZE) buf.shift();
  }
  const assets = new Set(rows.map(r => r.asset)).size;
  return { assets, ticks: rows.length };
}

/**
 * Daily cleanup. Deletes price_ticks older than PRUNE_WINDOW_MS. Called
 * from the scheduler's daily cron — we don't need history beyond a day
 * since hydration only ever reads the last hour.
 */
export async function pruneOldTicks(prisma: PrismaClient): Promise<number> {
  const cutoff = new Date(Date.now() - PRUNE_WINDOW_MS);
  const { count } = await prisma.priceTick.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  return count;
}

/** Operator-facing diagnostic. */
export function getPriceHistoryStats(): Record<string, {
  bufferSize: number;
  oldestTs: number | null;
  newestTs: number | null;
  totalTicks: number;
  lastTickAt: number | null;
  persistFailures: number;
}> {
  const out: Record<string, {
    bufferSize: number;
    oldestTs: number | null;
    newestTs: number | null;
    totalTicks: number;
    lastTickAt: number | null;
    persistFailures: number;
  }> = {};
  for (const [asset, buf] of buffers) {
    const s = stats.get(asset);
    out[asset] = {
      bufferSize: buf.length,
      oldestTs: buf.length > 0 ? buf[0].timestamp : null,
      newestTs: buf.length > 0 ? buf[buf.length - 1].timestamp : null,
      totalTicks: s?.totalTicks ?? 0,
      lastTickAt: s?.lastTickAt ?? null,
      persistFailures: s?.persistFailures ?? 0,
    };
  }
  return out;
}

/** Test-only. Resets the buffer + stats so unit tests aren't cross-contaminated. */
export function __resetPriceHistory(): void {
  buffers.clear();
  lastPersistedAt.clear();
  stats.clear();
  prismaRef = null;
}
