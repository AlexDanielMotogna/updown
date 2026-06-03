/**
 * Per-asset price-tick buffer fed by the Pacifica WebSocket subscription.
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
 *   buffer of ticks per asset and pick the one at-or-just-before the
 *   pool's endTime at resolution time.
 *
 * Source:
 *   The WebSocket subscription started by initWebSocket() calls
 *   priceProvider.subscribe(asset, cb) and broadcasts ticks to
 *   pool:{poolId} rooms. We just pipe the same callback into
 *   recordTick() here, so the buffer fills as long as ANY client is
 *   subscribed to that asset (in practice always, since the markets
 *   page subscribes).
 *
 * Size budget:
 *   500 ticks per asset. Pacifica pushes ~1 tick/sec on active
 *   markets so ~8 minutes of history — plenty for the worst-case
 *   resolution lag (~30s) plus headroom for sparse-tick assets.
 */

interface Tick {
  /** Stringified price with 2 decimals (matches the WS payload format). */
  price: string;
  /** ms epoch */
  timestamp: number;
}

const BUFFER_SIZE = 500;
const buffers = new Map<string, Tick[]>();
// Per-asset metrics surfaced via the admin /system tab. Lets us spot
// "buffer empty for asset X" issues before they bite a resolution.
const stats = new Map<string, { totalTicks: number; lastTickAt: number }>();

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
  const s = stats.get(asset) ?? { totalTicks: 0, lastTickAt: 0 };
  s.totalTicks++;
  s.lastTickAt = timestamp;
  stats.set(asset, s);
}

/**
 * Look up the price tick at or just before the target timestamp.
 *
 * Returns null when:
 *   - The buffer has no entries for the asset (no WS subscription yet,
 *     or process just started).
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

/** Operator-facing diagnostic. */
export function getPriceHistoryStats(): Record<string, { bufferSize: number; oldestTs: number | null; newestTs: number | null; totalTicks: number; lastTickAt: number | null }> {
  const out: Record<string, { bufferSize: number; oldestTs: number | null; newestTs: number | null; totalTicks: number; lastTickAt: number | null }> = {};
  for (const [asset, buf] of buffers) {
    const s = stats.get(asset);
    out[asset] = {
      bufferSize: buf.length,
      oldestTs: buf.length > 0 ? buf[0].timestamp : null,
      newestTs: buf.length > 0 ? buf[buf.length - 1].timestamp : null,
      totalTicks: s?.totalTicks ?? 0,
      lastTickAt: s?.lastTickAt ?? null,
    };
  }
  return out;
}

/** Test-only. Resets the buffer + stats so unit tests aren't cross-contaminated. */
export function __resetPriceHistory(): void {
  buffers.clear();
  stats.clear();
}
