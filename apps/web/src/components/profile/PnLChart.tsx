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
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Build cumulative P&L series — ONE point per pool, not per bet.
  //
  // Per-bet plotting produced false spikes on hedged pools: a wallet that
  // bets on both UP and DOWN of the same pool gets one winning bet (large
  // positive delta) and one losing bet (negative delta), both with the same
  // createdAt; cumulative goes (e.g.) 0 → +\$187 → +\$87 in zero time, which
  // reads as a peak that never happened. We collapse per-pool by summing
  // each bet's signed contribution and plotting the net at the pool's
  // endTime (when P&L was actually realised), so each pool is one step on
  // the curve.
  const allPoints = useMemo(() => {
    type Bucket = { t: number; delta: number };
    const buckets = new Map<string, Bucket>();
    for (const b of bets) {
      if (b.isWinner === null) continue; // pool not resolved yet
      if (!b.claimed && b.isWinner !== false) continue; // pending payout — skip
      const stake = Number(b.amount);
      const payout = b.payoutAmount ? Number(b.payoutAmount) : 0;
      // Refund detection FIRST — for hedged single-bettor pools the scheduler
      // marks the user's other side isWinner=false but still refunds (payout
      // == stake). Treating that as a −stake loss would double-count.
      const isRefund = payout > 0 && payout === stake;
      const delta = isRefund ? 0 : b.isWinner === false ? -stake : payout - stake;
      // Plot at pool.endTime so both bets on the same pool collapse to the
      // same x and accumulate into one net step on the curve.
      const t = new Date(b.pool.endTime).getTime();
      const existing = buckets.get(b.pool.id);
      if (existing) existing.delta += delta;
      else buckets.set(b.pool.id, { t, delta });
    }
    const sorted = [...buckets.values()].sort((a, b) => a.t - b.t);
    let cum = 0;
    return sorted.map(({ t, delta }) => {
      cum += delta;
      return { t, pnl: cum };
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

  // SVG geometry + hover helpers — coords are derived once and consumed by
  // both the static path render and the hover overlay below.
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
    const toX = (ts: number) => PADDING.left + ((ts - tMin) / tSpan) * chartW;
    const toY = (v: number) => PADDING.top + ((maxV - v) / vSpan) * chartH;
    const zeroY = toY(0);

    const xs = points.map(p => toX(p.t));
    const ys = points.map(p => toY(p.pnl));

    let d = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
    for (let i = 1; i < points.length; i++) {
      d += ` L${xs[i].toFixed(1)},${ys[i].toFixed(1)}`;
    }
    // Area fill under the line, down to the zero baseline.
    const lastX = xs[xs.length - 1].toFixed(1);
    const firstX = xs[0].toFixed(1);
    const areaD = `${d} L${lastX},${zeroY.toFixed(1)} L${firstX},${zeroY.toFixed(1)} Z`;

    return { d, areaD, zeroY, xs, ys, chartW, chartH };
  }, [points, width]);

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!chart || points.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    // Snap to the closest data point by X.
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < chart.xs.length; i++) {
      const d = Math.abs(chart.xs[i] - mouseX);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    setHoverIndex(bestIdx);
  };

  function formatHoverDate(ts: number): string {
    const d = new Date(ts);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header: just the title + range selector. The numeric value lives in
          the Net P&L tile above; repeating it here was visual duplication. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>
          Profit/Loss
        </Typography>
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
          <svg
            width={width}
            height={HEIGHT}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoverIndex(null)}
            style={{ display: 'block', cursor: 'crosshair' }}
          >
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

            {/* Hover overlay — vertical guide + focus dot + tooltip pill */}
            {hoverIndex != null && points[hoverIndex] && (() => {
              const cx = chart.xs[hoverIndex];
              const cy = chart.ys[hoverIndex];
              const hp = points[hoverIndex];
              const positive = hp.pnl >= 0;
              const tipColor = positive ? t.gain : t.down;
              const tipText = `${positive ? '+' : '−'}${formatUSDC(String(Math.round(Math.abs(hp.pnl))), { min: 2 })}`;
              const dateText = formatHoverDate(hp.t);

              // Tooltip width estimated by character count — keeps it inside
              // the plot area regardless of which side the cursor is on.
              const tipW = Math.max(96, Math.max(tipText.length, dateText.length) * 6.5 + 16);
              const tipH = 38;
              const tipPad = 10;
              const sideRight = cx + tipW + tipPad < width - PADDING.right;
              const tipX = sideRight ? cx + tipPad : cx - tipW - tipPad;
              const tipY = Math.max(PADDING.top, Math.min(cy - tipH - 8, HEIGHT - PADDING.bottom - tipH));

              return (
                <>
                  <line
                    x1={cx} y1={PADDING.top}
                    x2={cx} y2={HEIGHT - PADDING.bottom}
                    stroke={t.border.medium}
                    strokeWidth={1}
                  />
                  <circle cx={cx} cy={cy} r={4} fill={pnlColor} stroke={t.bg.app} strokeWidth={2} />
                  <g transform={`translate(${tipX}, ${tipY})`} pointerEvents="none">
                    <rect
                      x={0} y={0} width={tipW} height={tipH}
                      rx={4} ry={4}
                      fill={t.bg.surfaceAlt}
                      stroke={t.border.medium}
                      strokeWidth={1}
                    />
                    <text
                      x={8} y={15}
                      fill={t.text.tertiary}
                      fontSize={10}
                      fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                    >
                      {dateText}
                    </text>
                    <text
                      x={8} y={30}
                      fill={tipColor}
                      fontSize={12}
                      fontWeight={700}
                      fontFamily="var(--font-satoshi), Satoshi, sans-serif"
                    >
                      {tipText}
                    </text>
                  </g>
                </>
              );
            })()}
          </svg>
        ) : null}
      </Box>
    </Box>
  );
}
