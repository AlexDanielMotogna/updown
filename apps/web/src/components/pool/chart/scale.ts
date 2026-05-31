/**
 * Numeric formatting and tick generation for the chart axes. Kept separate
 * from rendering so the same helpers can be reused if we ever swap the SVG
 * renderer for something else (TradingView, Visx, etc).
 */

/** Currency-style formatting used on the chart's Y-axis tick labels. Wider
 *  range of decimals than the page-level formatPrice so a SOL chart isn't
 *  reduced to two decimals when the strike is captured at 4. */
export function formatChartPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** "HH:MM:SS" for sub-day spans, falling back to a month-day stamp for
 *  multi-day windows. The seconds are important for the snake's live
 *  ticker - without them the axis reads "5:09 / 5:09 / 5:09" while the
 *  chart slides through the actual seconds. */
export function formatChartTime(ts: number, durationMs: number): string {
  const d = new Date(ts);
  if (durationMs <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Round a raw axis step ($17.42) to a Polymarket-ish "nice" value ($20).
 *  Picks from {1, 2, 2.5, 5, 10} × 10^n so adjacent ticks read as multiples
 *  of $5 / $10 / $20 / $0.50, never the arbitrary remainder of (range / N). */
export function niceStep(range: number, targetTicks: number): number {
  if (range <= 0 || !Number.isFinite(range)) return 1;
  const rough = range / Math.max(1, targetTicks - 1);
  const exp = Math.floor(Math.log10(rough));
  const factor = Math.pow(10, exp);
  const normalized = rough / factor;
  const nice =
    normalized < 1.5 ? 1
    : normalized < 3 ? 2
    : normalized < 4 ? 2.5
    : normalized < 7 ? 5
    : 10;
  return nice * factor;
}

/** Pick a sensible time-tick cadence for an X-axis span. Aims for ~4-6
 *  labels in the visible window so they're spaced cleanly without crowding. */
export function timeTickInterval(windowMs: number): number {
  if (windowMs > 6 * 3600_000) return 60 * 60_000;          // > 6h  → hourly
  if (windowMs > 3600_000) return 15 * 60_000;              // 1-6h  → 15m
  if (windowMs > 30 * 60_000) return 5 * 60_000;            // 30m-1h → 5m
  if (windowMs > 5 * 60_000) return 60_000;                 // 5-30m  → 1m
  if (windowMs > 60_000) return 30_000;                     // 1-5m   → 30s
  return 15_000;                                            // ≤ 1m   → 15s
}

/** Generate evenly-spaced ticks across a [tMin, tMax] span, anchored to
 *  round wall-clock instants of size tickInterval. Used by the snake's
 *  X-axis so labels read as a stable ruler the chart slides under. */
export function generateTimeTicks(
  tMin: number,
  tMax: number,
  tickInterval: number,
  toX: (t: number) => number,
): { time: number; x: number }[] {
  const ticks: { time: number; x: number }[] = [];
  const start = Math.floor(tMin / tickInterval) * tickInterval;
  for (let ts = start; ts <= tMax + tickInterval; ts += tickInterval) {
    if (ts >= tMin && ts <= tMax) ticks.push({ time: ts, x: toX(ts) });
  }
  return ticks;
}

/** Build "nice"-rounded price ticks across a price range. Anchored at the
 *  lowest visible price; clipped to the chart's Y bounds at the call site. */
export function generatePriceTicks(
  maxPrice: number,
  priceRange: number,
  toY: (p: number) => number,
  targetTicks = 5,
): { price: number; y: number }[] {
  const minPrice = maxPrice - priceRange;
  const step = niceStep(priceRange, targetTicks);
  const first = Math.ceil(minPrice / step) * step;
  const ticks: { price: number; y: number }[] = [];
  for (let price = first; price <= maxPrice; price += step) {
    ticks.push({ price, y: toY(price) });
  }
  return ticks;
}
