'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type { Candle } from '@/hooks';
import { useChartLayout } from './useChartLayout';
import { ChartAxes } from './ChartAxes';
import { formatChartPrice, PADDING } from './chart-utils';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface ChartProps {
  candles: Candle[];
  duration: number;
  livePrice?: number | null;
  strikePrice?: number | null;
}

export function CandlesChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
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
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block' }}>
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
            <g key={i}>
              <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1} />
              <rect x={x - half} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} fillOpacity={isUp ? 0.25 : 0.8} stroke={color} strokeWidth={1} />
            </g>
          );
        })}

        {/* Live price line + label */}
        {livePrice != null && (() => {
          const ly = toY(livePrice);
          const lastX = parsed.length > 0 ? toX(parsed.length - 1) : PADDING.left;
          const lvColor = parsed.length > 1 ? (parsed[parsed.length - 1].c >= parsed[0].c ? t.up : t.down) : t.up;
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                <line x1={lastX} x2={dims.width - PADDING.right} y1={ly} y2={ly} stroke={lvColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} />
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lvColor} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill={t.text.contrast} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
                  {formatChartPrice(livePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {/* Vertical crosshair */}
        {hoverCandle && hoverIndex !== null && (
          <line x1={toX(hoverIndex)} x2={toX(hoverIndex)} y1={PADDING.top} y2={PADDING.top + chartH} stroke={t.text.muted} strokeWidth={1} strokeDasharray="3,3" />
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

      {/* Hover OHLC tooltip */}
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
