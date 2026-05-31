'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from '@mui/material';
import { ShowChart, CandlestickChart } from '@mui/icons-material';
import { usePacificaCandles, type Candle } from '@/hooks';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';

type ChartType = 'line' | 'candles';

interface InlineChartProps {
  asset: string;
  livePrice?: string | null;
  strikePrice?: string | null;
}

const INTERVALS = [
  { label: '1m', value: '1m', duration: 60 * 60 * 1000 },
  { label: '3m', value: '3m', duration: 3 * 60 * 60 * 1000 },
  { label: '5m', value: '5m', duration: 5 * 60 * 60 * 1000 },
  { label: '15m', value: '15m', duration: 12 * 60 * 60 * 1000 },
  { label: '30m', value: '30m', duration: 24 * 60 * 60 * 1000 },
  { label: '1H', value: '1h', duration: 2 * 24 * 60 * 60 * 1000 },
  { label: '4H', value: '4h', duration: 7 * 24 * 60 * 60 * 1000 },
  { label: '1D', value: '1d', duration: 30 * 24 * 60 * 60 * 1000 },
] as const;

function formatChartPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

/** Round a raw axis step ($17.42) to a Polymarket-ish "nice" value ($20).
 *  Picks from {1, 2, 2.5, 5, 10} × 10^n so adjacent ticks read as multiples
 *  of $5 / $10 / $20 / $0.50, never the arbitrary remainder of (range / N). */
function niceStep(range: number, targetTicks: number): number {
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

function formatTime(ts: number, duration: number): string {
  const d = new Date(ts);
  if (duration <= 24 * 60 * 60 * 1000) {
    // Include seconds so the snake's anchored time ruler reads at the same
    // resolution as the clock — "5:09:56" / "5:10:00" / "5:10:04" the way
    // Polymarket / Kalshi label their live charts.
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PADDING = { top: 20, right: 70, bottom: 30, left: 16 };

// Snake view caps the visible span to 2 minutes so each tick moves enough
// pixels to read as motion. With a 1-hour window each frame shifted ~0.007%
// of the chart width (eye sees nothing); at 2 minutes it's ~0.2% — smooth.
const SNAKE_WINDOW_MS = 2 * 60 * 1000;
// 100ms tick (~10fps) + matching 100ms linear CSS transition on the path,
// dot and X-axis labels: every frame stretches straight into the next so the
// motion reads as continuous flow, not as discrete steps.
const SNAKE_TICK_MS = 100;
const SNAKE_TRANS = '0.1s linear';

function useChartLayout(candles: Candle[], chartType: ChartType) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 340 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(
    () =>
      candles.map((c) => ({
        o: parseFloat(c.o),
        h: parseFloat(c.h),
        l: parseFloat(c.l),
        c: parseFloat(c.c),
        t: c.t,
      })),
    [candles],
  );

  const { maxPrice, priceRange } = useMemo(() => {
    if (parsed.length === 0) return { maxPrice: 0, priceRange: 1 };
    let min: number, max: number;
    if (chartType === 'candles') {
      min = Math.min(...parsed.map((p) => p.l));
      max = Math.max(...parsed.map((p) => p.h));
    } else {
      min = Math.min(...parsed.map((p) => p.c));
      max = Math.max(...parsed.map((p) => p.c));
    }
    // Center around the current (last) price
    const currentPrice = parsed[parsed.length - 1]?.c ?? (min + max) / 2;
    const distFromCurrent = Math.max(max - currentPrice, currentPrice - min, (max - min) * 0.1);
    const centeredMax = currentPrice + distFromCurrent * 1.3;
    const centeredMin = currentPrice - distFromCurrent * 1.3;
    return { maxPrice: centeredMax, priceRange: centeredMax - centeredMin };
  }, [parsed, chartType]);

  const chartW = dims.width - PADDING.left - PADDING.right;
  const chartH = dims.height - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (i: number) => PADDING.left + (i / Math.max(parsed.length - 1, 1)) * chartW,
    [parsed.length, chartW],
  );
  const toY = useCallback(
    (price: number) => PADDING.top + ((maxPrice - price) / priceRange) * chartH,
    [maxPrice, priceRange, chartH],
  );

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i < 5; i++) {
      const price = maxPrice - (i / 4) * priceRange;
      ticks.push({ price, y: toY(price) });
    }
    return ticks;
  }, [maxPrice, priceRange, toY]);

  const xTicks = useMemo(() => {
    if (parsed.length === 0) return [];
    const count = Math.min(5, parsed.length);
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (parsed.length - 1));
      ticks.push({ time: parsed[idx].t, x: toX(idx) });
    }
    return ticks;
  }, [parsed, toX]);

  const hoverPrice = useMemo(() => {
    if (hoverY === null) return null;
    return maxPrice - ((hoverY - PADDING.top) / chartH) * priceRange;
  }, [hoverY, maxPrice, priceRange, chartH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (parsed.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const y = e.clientY - rect.top;
      const idx = Math.round((x / chartW) * (parsed.length - 1));
      if (idx >= 0 && idx < parsed.length) setHoverIndex(idx);
      if (y >= PADDING.top && y <= PADDING.top + chartH) setHoverY(y);
    },
    [parsed.length, chartW, chartH],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    setHoverY(null);
  }, []);

  return { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, setHoverIndex, handleMouseMove, handleMouseLeave, maxPrice, priceRange };
}

interface AxesProps {
  dims: { width: number; height: number };
  yTicks: { price: number; y: number }[];
  xTicks: { time: number; x: number }[];
  duration: number;
}

function ChartAxes({ dims, yTicks, xTicks, duration }: AxesProps) {
  const t = useThemeTokens();
  return (
    <>
      {yTicks.map((tick, i) => (
        <g key={`y-${i}`}>
          <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={tick.y} y2={tick.y} stroke={t.border.default} strokeWidth={1} />
          <text x={dims.width - PADDING.right + 8} y={tick.y + 4} fill={t.text.tertiary} fontSize={11} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
            {formatChartPrice(tick.price)}
          </text>
        </g>
      ))}
      {/* X labels are keyed by their *time* (not array index) so the snake
          can shift smoothly: each tick keeps its DOM node across renders and
          the CSS transition on `transform` interpolates its X position. */}
      {xTicks.map((tick) => (
        <g
          key={`x-${tick.time}`}
          transform={`translate(${tick.x}, 0)`}
          style={{ transition: `transform ${SNAKE_TRANS}` }}
        >
          <text x={0} y={dims.height - 6} fill={t.text.tertiary} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700} textAnchor="middle">
            {formatTime(tick.time, duration)}
          </text>
        </g>
      ))}
    </>
  );
}

interface ChartProps {
  candles: Candle[];
  duration: number;
  livePrice?: number | null;
  strikePrice?: number | null;
}

function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cpx = (prev.x + curr.x) / 2;
    d += ` C${cpx.toFixed(1)},${prev.y.toFixed(1)} ${cpx.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}

/** "Wave step" — Polymarket/Kalshi-style line: holds horizontal at the
 *  previous price for the first half of each segment, then eases into the
 *  new price with a cubic Bezier S-curve. No sharp 90° corners, no full
 *  Bezier swoop through the data; reads as a softly-stepped wave that
 *  follows the price ticks. */
function stepPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  let d = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    // Hold horizontal for the first ~50% of the segment, then S-curve to the
    // new price over the remaining ~50%. The control points are pulled in
    // toward the corners so the curve enters/exits horizontally (no sharp
    // join with the flat portion) — that's the rounded-step look.
    const holdEndX = prev.x + dx * 0.5;
    const cp1x = holdEndX + dx * 0.18;
    const cp2x = curr.x - dx * 0.18;
    d += ` L${holdEndX.toFixed(1)},${prev.y.toFixed(1)}`;
    d += ` C${cp1x.toFixed(1)},${prev.y.toFixed(1)} ${cp2x.toFixed(1)},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }
  return d;
}

function LineChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
  const t = useThemeTokens();
  const layout = useChartLayout(candles, 'line');
  // We only borrow the container ref + measured chart box from the layout
  // hook. The data model below is a rolling tick buffer, not the layout's
  // index-mapped candle list.
  const { containerRef, dims, parsed, chartH } = layout;

  // ── Rolling tick buffer ────────────────────────────────────────────────
  // Instead of plotting from candles + a phantom (now, livePrice) point — the
  // old setup where the whole line interpolated together when livePrice moved
  // and hover only had 2–3 snap targets — we maintain a per-tick history:
  //   - Seeded from the fetched candle closes (so we don't start with a blank
  //     chart while the buffer fills).
  //   - Appended every SNAKE_TICK_MS with the current livePrice (≈10/sec).
  //   - Pruned to the last SNAKE_WINDOW_MS.
  //
  // Effect: the rightmost point is always the latest tick, so price changes
  // visibly start at the tip and the older body just slides left in time.
  // Hover gets ~1200 snap targets in the 2-min window instead of 2–3 candles.
  const [history, setHistory] = useState<{ t: number; p: number }[]>([]);

  // Seed once from candle closes when they arrive — bootstraps the chart so
  // there's an actual line on first paint, not just a single dot at "now".
  useEffect(() => {
    if (parsed.length === 0) return;
    setHistory((prev) => {
      if (prev.length > 0) return prev;
      return parsed.map((p) => ({ t: p.t, p: p.c }));
    });
  }, [parsed]);

  // Push livePrice every SNAKE_TICK_MS and prune. We don't rely on a
  // separate `now` state — the head of `history` is "now".
  useEffect(() => {
    const iv = setInterval(() => {
      if (livePrice == null) return;
      const ts = Date.now();
      setHistory((h) => {
        const cutoff = ts - SNAKE_WINDOW_MS;
        const next = [...h.filter((e) => e.t >= cutoff), { t: ts, p: livePrice }];
        return next;
      });
    }, SNAKE_TICK_MS);
    return () => clearInterval(iv);
  }, [livePrice]);

  // Render clock: we need *some* re-render between tick pushes when livePrice
  // is null (e.g. WS hiccup) so the X axis can still advance and old points
  // can scroll off. Cheap — derives nothing else.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), SNAKE_TICK_MS);
    return () => clearInterval(iv);
  }, []);

  const chartW = dims.width - PADDING.left - PADDING.right;
  const windowMs = Math.min(duration, SNAKE_WINDOW_MS);
  // Use the most recent point we know about (history head if present, else
  // wall clock) as the right edge — keeps the tip glued to the boundary.
  const tMax = history.length > 0 ? Math.max(history[history.length - 1].t, now) : now;
  const tMin = tMax - windowMs;

  const tToX = useCallback(
    (ts: number) => PADDING.left + ((ts - tMin) / windowMs) * chartW,
    [tMin, windowMs, chartW],
  );

  // ── Y-axis scoped to the visible window ────────────────────────────────
  // Range is computed off the rolling tick buffer (so it tracks intra-minute
  // fluctuations the candle close would miss) plus strike, with a small span
  // floor so a flat 2-min window doesn't collapse the line to a horizontal.
  const { maxPrice, priceRange, toY } = useMemo(() => {
    const values: number[] = [];
    for (const h of history) values.push(h.p);
    if (livePrice != null) values.push(livePrice);
    if (strikePrice != null) values.push(strikePrice);
    if (values.length === 0) {
      return { maxPrice: 0, priceRange: 1, toY: (_p: number) => PADDING.top + chartH / 2 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const center = livePrice ?? values[values.length - 1];
    // Floor at 0.05% of price (~$36 for BTC at $73k, ~$0.04 for SOL at $82).
    const minSpan = Math.max(center * 0.0005, 0.01);
    const distFromCenter = Math.max(max - center, center - min, minSpan);
    const span = distFromCenter * 1.3;
    const tMaxP = center + span;
    const tRange = span * 2;
    return {
      maxPrice: tMaxP,
      priceRange: tRange,
      toY: (p: number) => PADDING.top + ((tMaxP - p) / tRange) * chartH,
    };
  }, [history, livePrice, strikePrice, chartH]);

  // Y-axis ticks rounded to "nice" multiples (BTC: every $10 / $20, SOL:
  // every $0.20 / $0.50) so the axis reads as a clean ruler. We anchor from
  // the lowest visible price upward, dropping any that fall outside the
  // chart box.
  const yTicks = useMemo(() => {
    const minPrice = maxPrice - priceRange;
    const step = niceStep(priceRange, 5);
    const first = Math.ceil(minPrice / step) * step;
    const ticks: { price: number; y: number }[] = [];
    for (let price = first; price <= maxPrice; price += step) {
      ticks.push({ price, y: toY(price) });
    }
    return ticks;
  }, [maxPrice, priceRange, toY]);

  // Points come straight from the rolling history. We drop the leading
  // entries that are outside the visible window but keep one neighbor so the
  // line draws cleanly through the left boundary.
  const visibleHistory = useMemo(() => {
    if (history.length === 0) return [];
    const firstInside = history.findIndex((h) => h.t >= tMin);
    const start = firstInside <= 0 ? 0 : firstInside - 1;
    return history.slice(start);
  }, [history, tMin]);

  const points = useMemo(
    () => visibleHistory.map((h) => ({ x: tToX(h.t), y: toY(h.p) })),
    [visibleHistory, tToX, toY],
  );

  // Wave-step line — matches the rounded-step look Polymarket / Kalshi use:
  // horizontal hold, then a smooth S-curve into the next price, no peaks.
  const linePath = useMemo(() => stepPath(points), [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottom = PADDING.top + chartH;
    return `${linePath} L${points[points.length - 1].x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`;
  }, [linePath, points, chartH]);

  const firstPrice = visibleHistory.length > 0 ? visibleHistory[0].p : null;
  const lastPrice = visibleHistory.length > 0 ? visibleHistory[visibleHistory.length - 1].p : null;
  const isUp = firstPrice != null && lastPrice != null ? lastPrice >= firstPrice : true;
  const lineColor = isUp ? t.up : t.down;

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  // Time ticks anchored to round wall-clock instants (5:10:00, 5:10:30, …).
  // Each tick keeps its label and rides the snake leftwards every frame, so
  // the strip reads as a stable ruler the chart slides under — exactly the
  // behaviour Polymarket / TradingView use for live ticks.
  const xTicks = useMemo(() => {
    // Pick a label cadence the window can comfortably fit (~4–6 labels).
    const tickInterval =
      windowMs > 6 * 3600_000 ? 60 * 60_000          // > 6h → hourly
      : windowMs > 3600_000   ? 15 * 60_000          // 1–6h → every 15m
      : windowMs > 30 * 60_000 ? 5 * 60_000          // 30m–1h → every 5m
      : windowMs > 5 * 60_000  ? 60_000              // 5–30m → every 1m
      : windowMs > 60_000      ? 30_000              // 1–5m → every 30s
                               : 15_000;             // ≤ 1m → every 15s
    const ticks: { time: number; x: number }[] = [];
    const start = Math.floor(tMin / tickInterval) * tickInterval;
    for (let ts = start; ts <= tMax + tickInterval; ts += tickInterval) {
      if (ts >= tMin && ts <= tMax) ticks.push({ time: ts, x: tToX(ts) });
    }
    return ticks;
  }, [tMin, tMax, windowMs, tToX]);

  // Hover snaps to the nearest tick in the rolling history — at ~10
  // ticks/second the buffer holds ~1200 points in a 2-min window, so the
  // crosshair can resolve a price for essentially any cursor X.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleHistory.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // History is time-sorted, so we could binary-search; linear is fine
      // for ~1200 entries and avoids any boundary subtleties.
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < visibleHistory.length; i++) {
        const d = Math.abs(tToX(visibleHistory[i].t) - mx);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      setHoverIdx(best);
      if (my >= PADDING.top && my <= PADDING.top + chartH) setHoverY(my);
    },
    [visibleHistory, tToX, chartH],
  );
  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null);
    setHoverY(null);
  }, []);

  const hoverData = hoverIdx !== null && hoverIdx < visibleHistory.length
    ? {
        price: visibleHistory[hoverIdx].p,
        time: visibleHistory[hoverIdx].t,
        x: tToX(visibleHistory[hoverIdx].t),
        y: toY(visibleHistory[hoverIdx].p),
      }
    : null;
  const hoverPrice = hoverY !== null
    ? maxPrice - ((hoverY - PADDING.top) / chartH) * priceRange
    : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block', willChange: 'contents' }}>
        <defs>
          <linearGradient id="inline-line-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
          {/* Soft halo behind the live dot — the radial gradient bleeds into
              the chart so the tip glows the way Polymarket's last point does. */}
          <radialGradient id="inline-live-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.55} />
            <stop offset="60%" stopColor={lineColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </radialGradient>
        </defs>

        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy >= PADDING.top && sy <= PADDING.top + chartH) {
            return (
              <g style={{ transition: 'transform 0.4s ease' }}>
                <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={sy} y2={sy} stroke={t.accent} strokeWidth={1} strokeDasharray="6,4" strokeOpacity={0.5} />
                <rect x={0} y={sy - 11} width={PADDING.left + 72} height={22} rx={3} fill={t.accent} />
                <text x={6} y={sy + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
                  Strike {formatChartPrice(strikePrice)}
                </text>
              </g>
            );
          }
          return null;
        })()}

        {areaPath && <path d={areaPath} fill="url(#inline-line-area-grad)" style={{ transition: `d ${SNAKE_TRANS}, opacity 0.3s` }} />}
        {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transition: `d ${SNAKE_TRANS}` }} />}

        {livePrice != null && lastPoint && (() => {
          const ly = toY(livePrice);
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                {/* Glow halo behind the tip — kept separate so the dot itself
                    stays crisp while the radial gradient bleeds around it. */}
                <circle cx={lastPoint.x} cy={lastPoint.y} r={16} fill="url(#inline-live-glow)" style={{ transition: `cx ${SNAKE_TRANS}, cy ${SNAKE_TRANS}` }} pointerEvents="none" />
                {/* The live dot rides the right edge — its X is the latest
                    tick we appended, so the matching linear transition keeps
                    it visually glued to the head of the snake. */}
                <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={lineColor} stroke="#111820" strokeWidth={2} style={{ transition: `cx ${SNAKE_TRANS}, cy ${SNAKE_TRANS}` }}>
                  <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite" />
                </circle>
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lineColor} style={{ transition: 'y 0.4s ease' }} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700} style={{ transition: 'y 0.4s ease' }}>
                  {formatChartPrice(livePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {hoverData && (
          <>
            <line x1={hoverData.x} x2={hoverData.x} y1={PADDING.top} y2={PADDING.top + chartH} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hoverData.x} cy={hoverData.y} r={4} fill={lineColor} stroke="#111820" strokeWidth={2} />
          </>
        )}

        {hoverY !== null && hoverPrice !== null && (
          <>
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={hoverY} y2={hoverY} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - PADDING.right + 1} y={hoverY - 10} width={PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - PADDING.right + 8} y={hoverY + 4} fill={t.text.primary} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
              {formatChartPrice(hoverPrice)}
            </text>
          </>
        )}
      </svg>

      {hoverData && (
        <Box sx={{ position: 'absolute', top: 8, left: PADDING.left, display: 'flex', gap: 2, alignItems: 'baseline', pointerEvents: 'none' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: lineColor, fontVariantNumeric: 'tabular-nums' }}>
            ${formatChartPrice(hoverData.price)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {new Date(hoverData.time).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

function CandlesChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
  const t = useThemeTokens();
  const layout = useChartLayout(candles, 'candles');
  const { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, handleMouseMove, handleMouseLeave } = layout;

  const candleWidth = useMemo(() => {
    if (parsed.length <= 1) return 6;
    return Math.max(1, Math.min(12, (chartW / parsed.length) * 0.7));
  }, [parsed.length, chartW]);

  const hoverCandle = hoverIndex !== null && hoverIndex < parsed.length ? parsed[hoverIndex] : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block', willChange: 'contents' }}>
        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy >= PADDING.top && sy <= PADDING.top + chartH) {
            return (
              <g style={{ transition: 'transform 0.4s ease' }}>
                <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={sy} y2={sy} stroke={t.accent} strokeWidth={1} strokeDasharray="6,4" strokeOpacity={0.5} />
                <rect x={0} y={sy - 11} width={PADDING.left + 72} height={22} rx={3} fill={t.accent} />
                <text x={6} y={sy + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
                  Strike {formatChartPrice(strikePrice)}
                </text>
              </g>
            );
          }
          return null;
        })()}

        {parsed.map((c, i) => {
          const x = toX(i);
          const isUp = c.c >= c.o;
          const color = isUp ? t.up : t.down;
          const bodyTop = toY(Math.max(c.o, c.c));
          const bodyBottom = toY(Math.min(c.o, c.c));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const wickTop = toY(c.h);
          const wickBottom = toY(c.l);
          const half = candleWidth / 2;

          return (
            <g key={i} style={{ transition: 'opacity 0.3s' }}>
              <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
              <rect x={x - half} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} fillOpacity={isUp ? 0.25 : 0.8} stroke={color} strokeWidth={1} style={{ transition: 'y 0.4s ease, height 0.4s ease' }} />
            </g>
          );
        })}

        {livePrice != null && (() => {
          const ly = toY(livePrice);
          const lastX = parsed.length > 0 ? toX(parsed.length - 1) : PADDING.left;
          const lvColor = parsed.length > 1 ? (parsed[parsed.length - 1].c >= parsed[0].c ? t.up : t.down) : t.up;
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                <line x1={lastX} x2={dims.width - PADDING.right} y1={ly} y2={ly} stroke={lvColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lvColor} style={{ transition: 'y 0.4s ease' }} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700} style={{ transition: 'y 0.4s ease' }}>
                  {formatChartPrice(livePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {hoverCandle && hoverIndex !== null && (
          <line x1={toX(hoverIndex)} x2={toX(hoverIndex)} y1={PADDING.top} y2={PADDING.top + chartH} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
        )}

        {hoverY !== null && hoverPrice !== null && (
          <>
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={hoverY} y2={hoverY} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - PADDING.right + 1} y={hoverY - 10} width={PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - PADDING.right + 8} y={hoverY + 4} fill={t.text.primary} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
              {formatChartPrice(hoverPrice)}
            </text>
          </>
        )}
      </svg>

      {hoverCandle && (
        <Box sx={{ position: 'absolute', top: 4, left: PADDING.left, display: 'flex', gap: 1.5, alignItems: 'baseline', pointerEvents: 'none' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>O</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.o)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>H</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.h)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>L</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.l)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>C</Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: hoverCandle.c >= hoverCandle.o ? t.up : t.down, fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.c)}
          </Typography>
          <Typography variant="caption" sx={{ color: t.text.dimmed, ml: 0.5 }}>
            {new Date(hoverCandle.t).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function InlineChart({ asset, livePrice: livePriceStr, strikePrice: strikePriceStr }: InlineChartProps) {
  const t = useThemeTokens();
  const livePriceNum = livePriceStr ? Number(livePriceStr) : null;
  const strikePriceNum = strikePriceStr ? Number(strikePriceStr) / USDC_DIVISOR : null;
  const [chartType, setChartType] = useState<ChartType>('line');
  // Snake view is hard-locked to 1-minute candles — the user can't tune the
  // resolution because the visible span (2 min, see SNAKE_WINDOW_MS) wouldn't
  // accommodate larger candles. Polymarket likewise hides the interval choice
  // on its real-time line view.
  const interval = INTERVALS[0];

  const { candles, loading, error } = usePacificaCandles({
    symbol: asset,
    interval: interval.value,
    durationMs: interval.duration,
    enabled: true,
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 280, md: 460 },
        bgcolor: t.bg.app,
        borderRadius: { xs: 0, md: 2 },
        overflow: 'hidden',
      }}
    >
      {/* Controls: chart-type toggle only (no interval picker — locked to 1m). */}
      <Box sx={{ px: { xs: 1, md: 2 }, pb: 0.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, val) => { if (val !== null) setChartType(val); }}
          size="small"
          sx={{
            flexShrink: 0,
            '& .MuiToggleButton-root': {
              color: 'text.secondary',
              border: 'none',
              borderRadius: '3px !important',
              px: 0.75,
              py: 0.15,
              '&.Mui-selected': {
                color: t.text.primary,
                bgcolor: t.hover.strong,
              },
            },
          }}
        >
          <ToggleButton value="line" aria-label="Line chart">
            <ShowChart sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="candles" aria-label="Candlestick chart">
            <CandlestickChart sx={{ fontSize: 16 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Chart area */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={28} sx={{ color: t.text.dimmed }} />
          </Box>
        )}
        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: t.down }}>{error}</Typography>
          </Box>
        )}
        {!loading && !error && candles.length > 0 && (
          chartType === 'line'
            ? <LineChart candles={candles} duration={interval.duration} livePrice={livePriceNum} strikePrice={strikePriceNum} />
            : <CandlesChart candles={candles} duration={interval.duration} livePrice={livePriceNum} strikePrice={strikePriceNum} />
        )}
        {!loading && !error && candles.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No data available</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
