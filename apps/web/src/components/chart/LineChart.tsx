'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { Candle } from '@/hooks';
import { useChartLayout } from './useChartLayout';
import { ChartAxes } from './ChartAxes';
import { formatChartPrice, PADDING } from './chart-utils';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

export interface ChartProps {
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

export function LineChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
  const t = useThemeTokens();
  const layout = useChartLayout(candles, 'line');
  const { containerRef, dims, parsed, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, handleMouseMove, handleMouseLeave } = layout;

  const closes = useMemo(() => parsed.map((p) => p.c), [parsed]);
  const times = useMemo(() => parsed.map((p) => p.t), [parsed]);

  const points = useMemo(() => closes.map((p, i) => ({ x: toX(i), y: toY(p) })), [closes, toX, toY]);

  const linePath = useMemo(() => smoothPath(points), [points]);

  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const bottom = PADDING.top + chartH;
    return `${linePath} L${points[points.length - 1].x.toFixed(1)},${bottom} L${points[0].x.toFixed(1)},${bottom} Z`;
  }, [linePath, points, chartH]);

  const isUp = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : true;
  const lineColor = isUp ? t.up : t.down;

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  const hoverData = hoverIndex !== null && hoverIndex < closes.length
    ? { price: closes[hoverIndex], time: times[hoverIndex], x: toX(hoverIndex), y: toY(closes[hoverIndex]) }
    : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="line-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {/* Strike price line */}
        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy >= PADDING.top && sy <= PADDING.top + chartH) {
            return (
              <>
                <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={sy} y2={sy} stroke={t.accent} strokeWidth={1} strokeDasharray="6,4" strokeOpacity={0.5} />
                <rect x={dims.width - PADDING.right + 1} y={sy - 9} width={PADDING.right - 4} height={18} rx={2} fill={withAlpha(t.accent, 0.19)} />
                <text x={dims.width - PADDING.right + 8} y={sy + 4} fill={t.accent} fontSize={9} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={600}>
                  {formatChartPrice(strikePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {areaPath && <path d={areaPath} fill="url(#line-area-grad)" />}
        {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

        {/* Live price line + label on Y axis */}
        {livePrice != null && lastPoint && (() => {
          const ly = toY(livePrice);
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                <line x1={lastPoint.x} x2={dims.width - PADDING.right} y1={ly} y2={ly} stroke={lineColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} />
                <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={lineColor} stroke="#111820" strokeWidth={2}>
                  <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite" />
                </circle>
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lineColor} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
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

        {/* Horizontal crosshair following mouse Y */}
        {hoverY !== null && hoverPrice !== null && (
          <>
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={hoverY} y2={hoverY} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - PADDING.right + 1} y={hoverY - 10} width={PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - PADDING.right + 8} y={hoverY + 4} fill={t.text.primary} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={500}>
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
