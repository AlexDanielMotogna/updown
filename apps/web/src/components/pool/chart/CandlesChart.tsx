'use client';

/**
 * Classic OHLC candlestick view. Index-mapped X axis (one candle per slot,
 * spread evenly across the chart width). Static — no rolling buffer, no
 * snake animation. Used as the secondary view when the user wants OHLC
 * detail instead of the real-time line.
 */

import { useCallback, useMemo, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { Candle } from '@/hooks';
import { useThemeTokens } from '@/app/providers';
import { CHART_FONT_FAMILY, CHART_PADDING } from './constants';
import { ChartAxes } from './ChartAxes';
import { formatChartPrice, generatePriceTicks } from './scale';
import { useChartLayout } from './useChartLayout';

interface Props {
  candles: Candle[];
  duration: number;
  livePrice?: number | null;
  strikePrice?: number | null;
}

export function CandlesChart({ candles, duration, livePrice, strikePrice }: Props) {
  const t = useThemeTokens();
  const { containerRef, dims, parsed, chartW, chartH } = useChartLayout(candles);

  // Y range covers the full high/low envelope of the visible candles,
  // centered on the latest close with light padding so the wick tips don't
  // graze the chart border.
  const { maxPrice, priceRange, toY } = useMemo(() => {
    if (parsed.length === 0) {
      return { maxPrice: 0, priceRange: 1, toY: (_p: number) => CHART_PADDING.top + chartH / 2 };
    }
    const min = Math.min(...parsed.map((p) => p.l));
    const max = Math.max(...parsed.map((p) => p.h));
    const center = parsed[parsed.length - 1]?.c ?? (min + max) / 2;
    const dist = Math.max(max - center, center - min, (max - min) * 0.1);
    const tMaxP = center + dist * 1.3;
    const tRange = dist * 2.6;
    return {
      maxPrice: tMaxP,
      priceRange: tRange,
      toY: (p: number) => CHART_PADDING.top + ((tMaxP - p) / tRange) * chartH,
    };
  }, [parsed, chartH]);

  const yTicks = useMemo(
    () => generatePriceTicks(maxPrice, priceRange, toY),
    [maxPrice, priceRange, toY],
  );

  const toX = useCallback(
    (i: number) => CHART_PADDING.left + (i / Math.max(parsed.length - 1, 1)) * chartW,
    [parsed.length, chartW],
  );

  const xTicks = useMemo(() => {
    if (parsed.length === 0) return [];
    const count = Math.min(5, parsed.length);
    const ticks: { time: number; x: number }[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / Math.max(count - 1, 1)) * (parsed.length - 1));
      ticks.push({ time: parsed[idx].t, x: toX(idx) });
    }
    return ticks;
  }, [parsed, toX]);

  const candleWidth = useMemo(() => {
    if (parsed.length <= 1) return 6;
    return Math.max(1, Math.min(12, (chartW / parsed.length) * 0.7));
  }, [parsed.length, chartW]);

  // Hover snaps to the nearest candle by X.
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (parsed.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - CHART_PADDING.left;
      const y = e.clientY - rect.top;
      const idx = Math.round((x / chartW) * (parsed.length - 1));
      if (idx >= 0 && idx < parsed.length) setHoverIdx(idx);
      if (y >= CHART_PADDING.top && y <= CHART_PADDING.top + chartH) setHoverY(y);
    },
    [parsed.length, chartW, chartH],
  );
  const handleMouseLeave = useCallback(() => {
    setHoverIdx(null);
    setHoverY(null);
  }, []);

  const hoverCandle = hoverIdx !== null && hoverIdx < parsed.length ? parsed[hoverIdx] : null;
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
        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} durationMs={duration} />

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
          const lastX = parsed.length > 0 ? toX(parsed.length - 1) : CHART_PADDING.left;
          const lvColor = parsed.length > 1 ? (parsed[parsed.length - 1].c >= parsed[0].c ? t.up : t.down) : t.up;
          if (ly < CHART_PADDING.top || ly > CHART_PADDING.top + chartH) return null;
          return (
            <>
              <line x1={lastX} x2={dims.width - CHART_PADDING.right} y1={ly} y2={ly} stroke={lvColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
              <rect x={dims.width - CHART_PADDING.right + 1} y={ly - 10} width={CHART_PADDING.right - 4} height={20} rx={3} fill={lvColor} style={{ transition: 'y 0.4s ease' }} />
              <text x={dims.width - CHART_PADDING.right + 8} y={ly + 4} fill={t.text.contrast} fontSize={10} fontFamily={CHART_FONT_FAMILY} fontWeight={700} style={{ transition: 'y 0.4s ease' }}>
                {formatChartPrice(livePrice)}
              </text>
            </>
          );
        })()}

        {hoverCandle && hoverIdx !== null && (
          <line x1={toX(hoverIdx)} x2={toX(hoverIdx)} y1={CHART_PADDING.top} y2={CHART_PADDING.top + chartH} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
        )}

        {hoverY !== null && hoverPriceLabel !== null && (
          <>
            <line x1={CHART_PADDING.left} x2={dims.width - CHART_PADDING.right} y1={hoverY} y2={hoverY} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - CHART_PADDING.right + 1} y={hoverY - 10} width={CHART_PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - CHART_PADDING.right + 8} y={hoverY + 4} fill={t.text.primary} fontSize={10} fontFamily={CHART_FONT_FAMILY} fontWeight={700}>
              {formatChartPrice(hoverPriceLabel)}
            </text>
          </>
        )}
      </svg>

      {hoverCandle && (
        <Box sx={{ position: 'absolute', top: 4, left: CHART_PADDING.left, display: 'flex', gap: 1.5, alignItems: 'baseline', pointerEvents: 'none' }}>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>O</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.o)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>H</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.h)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>L</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.l)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>C</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: hoverCandle.c >= hoverCandle.o ? t.up : t.down, fontVariantNumeric: 'tabular-nums' }}>
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
