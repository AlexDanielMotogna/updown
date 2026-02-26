'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { useOrderbook } from '@/hooks/useOrderbook';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

interface OrderbookDepthProps {
  asset: string;
}

function formatPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatAmount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function OrderbookDepth({ asset }: OrderbookDepthProps) {
  const { data, loading } = useOrderbook(asset);

  const maxAmount = useMemo(() => {
    if (!data) return 1;
    const allAmounts = [...data.bids.map((l) => l.amount), ...data.asks.map((l) => l.amount)];
    return Math.max(...allAmounts, 1);
  }, [data]);

  if (loading || !data || (data.bids.length === 0 && data.asks.length === 0)) {
    return null;
  }

  const levels = Math.max(data.bids.length, data.asks.length);
  const barHeight = 22;
  const gap = 2;
  const midGap = 20;
  const svgHeight = levels * (barHeight + gap) * 2 + midGap;
  const svgWidth = 320;
  const maxBarWidth = svgWidth * 0.42;
  const centerX = svgWidth / 2;
  const labelOffset = 6;

  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        ORDERBOOK DEPTH
      </Typography>
      <Box
        sx={{
          p: 2,
          borderRadius: 1,
          background: 'rgba(255, 255, 255, 0.04)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`}>
          {/* Spread label */}
          <text
            x={centerX}
            y={levels * (barHeight + gap) + midGap / 2 + 4}
            textAnchor="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize={10}
            fontFamily="var(--font-satoshi), Satoshi, sans-serif"
          >
            Spread: ${formatPrice(data.spread)}
          </text>

          {/* Bids (green) — top half, bars extend left from center */}
          {data.bids.map((bid, i) => {
            const y = i * (barHeight + gap);
            const barW = (bid.amount / maxAmount) * maxBarWidth;

            return (
              <g key={`bid-${i}`}>
                <rect
                  x={centerX - barW}
                  y={y}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={UP_COLOR}
                  fillOpacity={0.15 + (0.35 * (data.bids.length - i)) / data.bids.length}
                />
                {/* Price label (right of center) */}
                <text
                  x={centerX + labelOffset}
                  y={y + barHeight / 2 + 4}
                  fill="rgba(255,255,255,0.5)"
                  fontSize={10}
                  fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                >
                  ${formatPrice(bid.price)}
                </text>
                {/* Amount label (inside bar) */}
                {barW > 30 && (
                  <text
                    x={centerX - barW + 6}
                    y={y + barHeight / 2 + 4}
                    fill={UP_COLOR}
                    fontSize={9}
                    fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                  >
                    {formatAmount(bid.amount)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Asks (red) — bottom half, bars extend right from center */}
          {data.asks.map((ask, i) => {
            const y = levels * (barHeight + gap) + midGap + i * (barHeight + gap);
            const barW = (ask.amount / maxAmount) * maxBarWidth;

            return (
              <g key={`ask-${i}`}>
                <rect
                  x={centerX}
                  y={y}
                  width={barW}
                  height={barHeight}
                  rx={2}
                  fill={DOWN_COLOR}
                  fillOpacity={0.15 + (0.35 * (data.asks.length - i)) / data.asks.length}
                />
                {/* Price label (left of center) */}
                <text
                  x={centerX - labelOffset}
                  y={y + barHeight / 2 + 4}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.5)"
                  fontSize={10}
                  fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                >
                  ${formatPrice(ask.price)}
                </text>
                {/* Amount label (inside bar) */}
                {barW > 30 && (
                  <text
                    x={centerX + barW - 6}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    fill={DOWN_COLOR}
                    fontSize={9}
                    fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                  >
                    {formatAmount(ask.amount)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Center line */}
          <line
            x1={centerX}
            y1={0}
            x2={centerX}
            y2={svgHeight}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        </svg>
      </Box>
    </Box>
  );
}
