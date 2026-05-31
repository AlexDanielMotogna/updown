'use client';

/**
 * Polymarket / Kalshi-style real-time line chart.
 *
 * Architecture in one breath:
 *   - useSnakeHistory keeps a rolling per-tick buffer (~10 entries/sec,
 *     bounded by SNAKE_WINDOW_MS) hydrated from sessionStorage and seeded
 *     from candle interpolation so first paint always renders a full line.
 *   - Path coordinates are in absolute time-space (X = (t − refT) × pxPerMs)
 *     and stay stable across renders. A wrapping <g transform=translateX>
 *     slides the whole layer leftwards by groupOffsetX each tick; the CSS
 *     transform-transition runs the animation on the GPU compositor, no
 *     CPU-bound `d` interpolation.
 *   - The clip-path that bounds the chart sits on the OUTER untransformed
 *     group so it acts on the rendered result, not on the path's raw local
 *     coords (which are mostly negative).
 *   - The live dot / halo are pinned to the chart's right edge — pinning
 *     them avoids a visible left/right hop each push that would happen if
 *     they rode inside the moving group.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { Candle } from '@/hooks';
import { useThemeTokens } from '@/app/providers';
import { getAssetTint } from '@/lib/assets';
import {
  CHART_FONT_FAMILY,
  CHART_PADDING,
  SNAKE_TRANS,
  SNAKE_WINDOW_MS,
} from './constants';
import { ChartAxes } from './ChartAxes';
import {
  formatChartPrice,
  generatePriceTicks,
  generateTimeTicks,
  timeTickInterval,
} from './scale';
import { areaPathFromLine, stepPath } from './paths';
import { useChartLayout } from './useChartLayout';
import { useSnakeHistory } from './useSnakeHistory';

interface Props {
  candles: Candle[];
  asset?: string;
  /** Visible window — capped at SNAKE_WINDOW_MS so the snake stays readable
   *  at the configured tick rate. */
  duration: number;
  livePrice?: number | null;
  strikePrice?: number | null;
}

/** Floor on Y-axis span so a flat 3-min window doesn't collapse the line
 *  onto a single horizontal. Scales with price magnitude. */
function priceSpanFloor(center: number): number {
  return Math.max(center * 0.0005, 0.01);
}

export function SnakeLineChart({ candles, asset, duration, livePrice, strikePrice }: Props) {
  const t = useThemeTokens();
  const { containerRef, dims, chartH } = useChartLayout(candles);
  const lineColor = getAssetTint(asset, t.accent);

  const { history, now } = useSnakeHistory({ asset, candles, livePrice });

  // ── X-axis ───────────────────────────────────────────────────────────
  // Coords are anchored to a mount-time reference so the path's X values
  // are stable across renders. Visible-window math falls out of (now, refT).
  const chartW = dims.width - CHART_PADDING.left - CHART_PADDING.right;
  const windowMs = Math.min(duration, SNAKE_WINDOW_MS);
  const refTRef = useRef(Date.now());
  const refT = refTRef.current;
  const pxPerMs = chartW / windowMs;
  const tToX = useCallback(
    (ts: number) => (ts - refT) * pxPerMs,
    [refT, pxPerMs],
  );

  const tMax = now;
  const tMin = tMax - windowMs;

  // Anchor the group so the latest tick (or `now` when the WS is between
  // pushes) sits at the chart's right edge.
  const anchorT = history.length > 0
    ? Math.max(history[history.length - 1].t, now)
    : now;
  const groupOffsetX = CHART_PADDING.left + chartW - tToX(anchorT);

  // ── Y-axis ───────────────────────────────────────────────────────────
  // Range is computed over the rolling tick buffer (so intra-minute swings
  // candles would miss still set the bounds) plus strike, with a span
  // floor so a quiet window doesn't flatten the line.
  const { maxPrice, priceRange, toY } = useMemo(() => {
    const values: number[] = [];
    for (const h of history) values.push(h.p);
    if (livePrice != null) values.push(livePrice);
    if (strikePrice != null) values.push(strikePrice);
    if (values.length === 0) {
      return { maxPrice: 0, priceRange: 1, toY: (_p: number) => CHART_PADDING.top + chartH / 2 };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const center = livePrice ?? values[values.length - 1];
    const dist = Math.max(max - center, center - min, priceSpanFloor(center));
    const span = dist * 1.3;
    const tMaxP = center + span;
    const tRange = span * 2;
    return {
      maxPrice: tMaxP,
      priceRange: tRange,
      toY: (p: number) => CHART_PADDING.top + ((tMaxP - p) / tRange) * chartH,
    };
  }, [history, livePrice, strikePrice, chartH]);

  const yTicks = useMemo(
    () => generatePriceTicks(maxPrice, priceRange, toY),
    [maxPrice, priceRange, toY],
  );

  // ── Visible entries + path ───────────────────────────────────────────
  // Keep one neighbour past the left boundary so the line draws cleanly
  // through it instead of clipping at the first visible entry.
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

  const linePath = useMemo(() => stepPath(points), [points]);
  const areaPath = useMemo(
    () => areaPathFromLine(linePath, points, CHART_PADDING.top + chartH),
    [linePath, points, chartH],
  );

  // ── X tick labels (anchored to round wall-clock instants) ────────────
  const xTicks = useMemo(() => {
    const interval = timeTickInterval(windowMs);
    return generateTimeTicks(tMin, tMax, interval, tToX);
  }, [tMin, tMax, windowMs, tToX]);

  // ── Hover ─────────────────────────────────────────────────────────────
  // Snap to the nearest tick in the rolling buffer; Y-axis crosshair just
  // reads the cursor Y back through the price scale.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (visibleHistory.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      // Cursor X is in SVG space; the line lives inside a translated group
      // so we undo that offset before snapping.
      const dataX = mx - groupOffsetX;
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < visibleHistory.length; i++) {
        const d = Math.abs(tToX(visibleHistory[i].t) - dataX);
        if (d < bestDist) { bestDist = d; best = i; }
      }
      setHoverIdx(best);
      if (my >= CHART_PADDING.top && my <= CHART_PADDING.top + chartH) setHoverY(my);
    },
    [visibleHistory, tToX, chartH, groupOffsetX],
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
  const hoverPriceLabel = hoverY !== null
    ? maxPrice - ((hoverY - CHART_PADDING.top) / chartH) * priceRange
    : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg
        width={dims.width}
        height={dims.height}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', willChange: 'contents' }}
      >
        <defs>
          <linearGradient id="snake-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
          {/* Soft halo behind the live tip — radial gradient bleeds into the
              chart so the dot glows like Polymarket's last point. */}
          <radialGradient id="snake-live-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.55} />
            <stop offset="60%" stopColor={lineColor} stopOpacity={0.15} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </radialGradient>
          <clipPath id="snake-clip">
            <rect x={CHART_PADDING.left} y={CHART_PADDING.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Y axis stays fixed; X axis lives inside the moving group below. */}
        <ChartAxes dims={dims} yTicks={yTicks} xTicks={[]} durationMs={duration} />

        {/* Strike line — fixed full-width horizontal with the price tag at left. */}
        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy < CHART_PADDING.top || sy > CHART_PADDING.top + chartH) return null;
          return (
            <g>
              <line
                x1={CHART_PADDING.left}
                x2={dims.width - CHART_PADDING.right}
                y1={sy} y2={sy}
                stroke={t.accent}
                strokeWidth={1}
                strokeDasharray="6,4"
                strokeOpacity={0.5}
              />
              <rect x={0} y={sy - 11} width={CHART_PADDING.left + 72} height={22} rx={3} fill={t.accent} />
              <text x={6} y={sy + 4} fill={t.text.contrast} fontSize={10} fontFamily={CHART_FONT_FAMILY} fontWeight={700}>
                Strike {formatChartPrice(strikePrice)}
              </text>
            </g>
          );
        })()}

        {/* Snake group. Clip-path on the OUTER un-transformed wrapper so it
            acts on the rendered (post-transform) result, not on the path's
            raw local coords which are mostly negative. */}
        <g clipPath="url(#snake-clip)">
          <g
            transform={`translate(${groupOffsetX.toFixed(2)}, 0)`}
            style={{ transition: `transform ${SNAKE_TRANS}`, willChange: 'transform' }}
          >
            {areaPath && <path d={areaPath} fill="url(#snake-area-grad)" />}
            {linePath && (
              <path
                d={linePath}
                fill="none"
                stroke={lineColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {xTicks.map((tick) => (
              <text
                key={`x-${tick.time}`}
                x={tick.x}
                y={dims.height - 6}
                fill={t.text.tertiary}
                fontSize={10}
                fontFamily={CHART_FONT_FAMILY}
                fontWeight={700}
                textAnchor="middle"
              >
                {new Date(tick.time).toLocaleTimeString('en-US', {
                  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
                })}
              </text>
            ))}

            {hoverData && (
              <>
                <line
                  x1={hoverData.x}
                  x2={hoverData.x}
                  y1={CHART_PADDING.top}
                  y2={CHART_PADDING.top + chartH}
                  stroke={t.text.muted}
                  strokeWidth={1}
                  strokeDasharray="3,3"
                />
                <circle cx={hoverData.x} cy={hoverData.y} r={4} fill={lineColor} stroke="#111820" strokeWidth={2} />
              </>
            )}
          </g>
        </g>

        {/* Live dot + halo pinned to the right edge — see SnakeLineChart header. */}
        {livePrice != null && (() => {
          const ly = toY(livePrice);
          if (ly < CHART_PADDING.top || ly > CHART_PADDING.top + chartH) return null;
          const dotX = CHART_PADDING.left + chartW;
          return (
            <>
              <circle cx={dotX} cy={ly} r={16} fill="url(#snake-live-glow)" pointerEvents="none" style={{ transition: 'cy 0.1s linear' }} />
              <circle cx={dotX} cy={ly} r={3.5} fill={lineColor} stroke="#111820" strokeWidth={2} style={{ transition: 'cy 0.1s linear' }}>
                <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite" />
              </circle>
              <rect
                x={dims.width - CHART_PADDING.right + 1}
                y={ly - 10}
                width={CHART_PADDING.right - 4}
                height={20}
                rx={3}
                fill={lineColor}
                style={{ transition: 'y 0.4s ease' }}
              />
              <text
                x={dims.width - CHART_PADDING.right + 8}
                y={ly + 4}
                fill={t.text.contrast}
                fontSize={10}
                fontFamily={CHART_FONT_FAMILY}
                fontWeight={700}
                style={{ transition: 'y 0.4s ease' }}
              >
                {formatChartPrice(livePrice)}
              </text>
            </>
          );
        })()}

        {/* Hover horizontal crosshair + price tag (fixed; not in the snake group). */}
        {hoverY !== null && hoverPriceLabel !== null && (
          <>
            <line
              x1={CHART_PADDING.left}
              x2={dims.width - CHART_PADDING.right}
              y1={hoverY} y2={hoverY}
              stroke={t.text.muted}
              strokeWidth={1}
              strokeDasharray="3,3"
            />
            <rect
              x={dims.width - CHART_PADDING.right + 1}
              y={hoverY - 10}
              width={CHART_PADDING.right - 4}
              height={20}
              rx={3}
              fill="rgba(255,255,255,0.12)"
            />
            <text
              x={dims.width - CHART_PADDING.right + 8}
              y={hoverY + 4}
              fill={t.text.primary}
              fontSize={10}
              fontFamily={CHART_FONT_FAMILY}
              fontWeight={700}
            >
              {formatChartPrice(hoverPriceLabel)}
            </text>
          </>
        )}
      </svg>

      {/* Top-left hover info pill. */}
      {hoverData && (
        <Box
          sx={{
            position: 'absolute',
            top: 8,
            left: CHART_PADDING.left,
            display: 'flex',
            gap: 2,
            alignItems: 'baseline',
            pointerEvents: 'none',
          }}
        >
          <Typography variant="body2" sx={{ fontWeight: 700, color: lineColor, fontVariantNumeric: 'tabular-nums' }}>
            ${formatChartPrice(hoverData.price)}
          </Typography>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'text.secondary' }}>
            {new Date(hoverData.time).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

