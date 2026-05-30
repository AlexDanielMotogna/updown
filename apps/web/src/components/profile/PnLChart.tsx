'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { formatUSDC } from '@/lib/format';
import type { Bet } from '@/lib/api';

type Range = '1D' | '1W' | '1M' | '1Y' | 'YTD' | 'ALL';

const RANGES: Range[] = ['1D', '1W', '1M', '1Y', 'YTD', 'ALL'];

function rangeStart(range: Range): number {
  const now = Date.now();
  switch (range) {
    case '1D': return now - 24 * 60 * 60 * 1000;
    case '1W': return now - 7 * 24 * 60 * 60 * 1000;
    case '1M': return now - 30 * 24 * 60 * 60 * 1000;
    case '1Y': return now - 365 * 24 * 60 * 60 * 1000;
    case 'YTD': return new Date(new Date().getFullYear(), 0, 1).getTime();
    case 'ALL': return 0;
  }
}

const PADDING = { top: 16, right: 8, bottom: 18, left: 8 };
const HEIGHT = 160;

interface PnLChartProps {
  bets: Bet[];
}

/**
 * Compact P&L line chart with a time-range selector. Cumulative net P&L
 * from all settled bets (won − lost − refund-fees) plotted over time.
 * Refunds contribute 0 (stake comes back). Lost bets contribute −stake.
 * Won bets contribute payoutAmount − stake.
 */
export function PnLChart({ bets }: PnLChartProps) {
  const t = useThemeTokens();
  const [range, setRange] = useState<Range>('ALL');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build cumulative P&L series.
  // - Lost: bet.payoutAmount is null AND bet.isWinner === false → −stake.
  // - Won: payoutAmount > stake → +(payout − stake).
  // - Refund: payoutAmount === stake → 0 contribution.
  const allPoints = useMemo(() => {
    const settled = bets
      .filter(b => b.isWinner !== null && (b.claimed || b.isWinner === false))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    let cum = 0;
    return settled.map(b => {
      const stake = Number(b.amount);
      const payout = b.payoutAmount ? Number(b.payoutAmount) : 0;
      // Refund detection MUST come before the isWinner check: for hedged
      // single-bettor pools the scheduler picks one side as the synthetic
      // winner, so the user's other (refunded) side ends up with
      // isWinner=false even though they got their money back. Treating
      // that as a -stake loss would double-count and skew the curve.
      const isRefund = payout > 0 && payout === stake;
      const delta = isRefund ? 0 : b.isWinner === false ? -stake : payout - stake;
      cum += delta;
      return { t: new Date(b.createdAt).getTime(), pnl: cum };
    });
  }, [bets]);

  const points = useMemo(() => {
    if (range === 'ALL') return allPoints;
    const cutoff = rangeStart(range);
    // Start the series at the cumulative P&L AT the cutoff time, then keep
    // the points after the cutoff. This way zoomed ranges still show a
    // meaningful curve instead of suddenly starting from 0.
    if (allPoints.length === 0) return [];
    let baseline = 0;
    for (const p of allPoints) {
      if (p.t < cutoff) baseline = p.pnl;
      else break;
    }
    const tail = allPoints.filter(p => p.t >= cutoff);
    return tail.map(p => ({ t: p.t, pnl: p.pnl - baseline }));
  }, [allPoints, range]);

  const latestPnl = allPoints.length > 0 ? allPoints[allPoints.length - 1].pnl : 0;
  const pnlPositive = latestPnl >= 0;
  const pnlColor = pnlPositive ? t.gain : t.down;

  // SVG path.
  const chart = useMemo(() => {
    if (points.length === 0 || width <= 0) return null;
    const chartW = Math.max(width - PADDING.left - PADDING.right, 50);
    const chartH = HEIGHT - PADDING.top - PADDING.bottom;
    const tMin = points[0].t;
    const tMax = points[points.length - 1].t || tMin + 1;
    const tSpan = Math.max(tMax - tMin, 1);
    const values = points.map(p => p.pnl);
    const minV = Math.min(0, ...values);
    const maxV = Math.max(0, ...values);
    const vSpan = Math.max(maxV - minV, 1);
    const toX = (t: number) => PADDING.left + ((t - tMin) / tSpan) * chartW;
    const toY = (v: number) => PADDING.top + ((maxV - v) / vSpan) * chartH;
    const zeroY = toY(0);

    let d = `M${toX(points[0].t).toFixed(1)},${toY(points[0].pnl).toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${toX(points[i].t).toFixed(1)},${toY(points[i].pnl).toFixed(1)}`;
    }
    // Area fill under the line, down to the zero baseline.
    const lastX = toX(points[points.length - 1].t).toFixed(1);
    const firstX = toX(points[0].t).toFixed(1);
    const areaD = `${d} L${lastX},${zeroY.toFixed(1)} L${firstX},${zeroY.toFixed(1)} Z`;

    return { d, areaD, zeroY };
  }, [points, width]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header: P&L value + range selector */}
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            P&amp;L · {range}
          </Typography>
          <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: pnlColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
            {pnlPositive ? '+' : '−'}{formatUSDC(String(Math.round(Math.abs(latestPnl))), { min: 2 })}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.25, p: 0.25, bgcolor: t.bg.surface, borderRadius: '6px', border: `1px solid ${t.border.subtle}` }}>
          {RANGES.map(r => {
            const active = r === range;
            return (
              <Box
                key={r}
                onClick={() => setRange(r)}
                sx={{
                  px: 1, py: 0.4, cursor: 'pointer', borderRadius: '4px',
                  fontSize: '0.7rem', fontWeight: 700,
                  color: active ? t.text.primary : t.text.tertiary,
                  bgcolor: active ? t.bg.surfaceAlt : 'transparent',
                  transition: 'all 0.12s ease',
                  '&:hover': { color: t.text.primary },
                }}
              >
                {r}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* SVG */}
      <Box ref={containerRef} sx={{ width: '100%', height: HEIGHT, position: 'relative' }}>
        {points.length === 0 ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.78rem', color: t.text.quaternary }}>
              No settled bets in this range yet
            </Typography>
          </Box>
        ) : chart ? (
          <svg width={width} height={HEIGHT} style={{ display: 'block' }}>
            <defs>
              <linearGradient id="pnl-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={pnlColor} stopOpacity={0.22} />
                <stop offset="100%" stopColor={pnlColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            {/* Zero baseline (only visible if it sits inside the plot area) */}
            <line
              x1={PADDING.left}
              y1={chart.zeroY}
              x2={width - PADDING.right}
              y2={chart.zeroY}
              stroke={t.border.subtle}
              strokeWidth={1}
              strokeDasharray="3,4"
            />
            <path d={chart.areaD} fill="url(#pnl-area)" />
            <path
              d={chart.d}
              fill="none"
              stroke={pnlColor}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 3px ${withAlpha(pnlColor, 0.4)})` }}
            />
          </svg>
        ) : null}
      </Box>
    </Box>
  );
}
