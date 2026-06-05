'use client';

/**
 * Cumulative P&L chart for the profile page, powered by TradingView
 * Lightweight Charts.
 *
 * Replaces ~300 lines of hand-rolled SVG (manual path generation, custom
 * hover overlay, ad-hoc tooltip layout). LWC handles the time axis,
 * crosshair, and y-scale animation; we own the data shaping + range
 * selector + a custom React tooltip (so we can show formatted USDC +
 * timezone-local date in the same font system the rest of the profile
 * uses).
 *
 * Per-pool bucket logic is preserved from the original: hedged single-
 * bettor pools used to spike the curve when plotted per-bet because the
 * scheduler writes both a winner and a loser row with the same createdAt.
 * Collapsing to (poolId → netΔ at pool.endTime) keeps every pool a single
 * step on the line.
 */

import { useMemo, useState, useRef, useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import {
  createChart,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type AreaData,
  type UTCTimestamp,
  CrosshairMode,
  LineStyle,
  LineType,
} from 'lightweight-charts';
import { useThemeTokens } from '@/app/providers';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
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

const HEIGHT = 160;

const toUtc = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

interface PnLChartProps {
  bets: Bet[];
}

export function PnLChart({ bets }: PnLChartProps) {
  const t = useThemeTokens();
  const [range, setRange] = useState<Range>('ALL');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  const [hover, setHover] = useState<
    | { x: number; y: number; pnl: number; ts: number }
    | null
  >(null);

  // Build cumulative P&L per pool — see the comment block at the top of the
  // file for why this is per-pool, not per-bet.
  const allPoints = useMemo(() => {
    type Bucket = { t: number; delta: number };
    const buckets = new Map<string, Bucket>();
    for (const b of bets) {
      if (b.isWinner === null) continue;
      if (!b.claimed && b.isWinner !== false) continue;
      const stake = Number(b.amount);
      const payout = b.payoutAmount ? Number(b.payoutAmount) : 0;
      const isRefund = payout > 0 && payout === stake;
      const delta = isRefund ? 0 : b.isWinner === false ? -stake : payout - stake;
      const ts = new Date(b.pool.endTime).getTime();
      const existing = buckets.get(b.pool.id);
      if (existing) existing.delta += delta;
      else buckets.set(b.pool.id, { t: ts, delta });
    }
    const sorted = [...buckets.values()].sort((a, b) => a.t - b.t);
    let cum = 0;
    return sorted.map(({ t, delta }) => {
      cum += delta;
      return { t, pnl: cum };
    });
  }, [bets]);

  // Slice by selected range, but rebase the curve so the visible window
  // starts at the user's cumulative P&L AT the cutoff (rather than zero,
  // which would draw a misleading discontinuity).
  const points = useMemo(() => {
    if (range === 'ALL') return allPoints;
    if (allPoints.length === 0) return [];
    const cutoff = rangeStart(range);
    let baseline = 0;
    for (const p of allPoints) {
      if (p.t < cutoff) baseline = p.pnl;
      else break;
    }
    return allPoints.filter(p => p.t >= cutoff).map(p => ({ t: p.t, pnl: p.pnl - baseline }));
  }, [allPoints, range]);

  const latestPnl = allPoints.length > 0 ? allPoints[allPoints.length - 1].pnl : 0;
  const pnlPositive = latestPnl >= 0;
  const pnlColor = pnlPositive ? t.gain : t.down;

  // ── LWC area data ──────────────────────────────────────────────────
  const areaData = useMemo<AreaData[]>(() => {
    // Dedupe to strictly-ascending seconds; two bets settled in the same
    // wall-clock second would otherwise blow up LWC's strict-asc assert.
    const out: AreaData[] = [];
    let prevSec = -1;
    for (const p of points) {
      const sec = Math.floor(p.t / 1000);
      // USDC values stored as integer base units — divide for display.
      const value = p.pnl / USDC_DIVISOR;
      if (sec === prevSec) {
        out[out.length - 1] = { time: sec as UTCTimestamp, value };
        continue;
      }
      if (sec < prevSec) continue;
      out.push({ time: sec as UTCTimestamp, value });
      prevSec = sec;
    }
    return out;
  }, [points]);

  // ── Chart instance lifecycle ───────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: t.text.dimmed,
        fontFamily: 'var(--font-satoshi), "Satoshi", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 10,
        attributionLogo: false,
      },
      localization: {
        // Header tile already shows the USDC value formatted; the y-axis
        // tick labels just need a compact $ prefix.
        priceFormatter: (price: number) => {
          const abs = Math.abs(price);
          if (abs >= 1000) return `$${(price / 1000).toFixed(1)}K`;
          return `$${price.toFixed(0)}`;
        },
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        },
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: t.border.medium, width: 1, style: LineStyle.Solid, labelVisible: false },
        horzLine: { color: t.border.medium, width: 1, style: LineStyle.Dotted, labelVisible: false },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const d = new Date(time * 1000);
          if (tickMarkType >= 3) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          if (tickMarkType === 2) return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          if (tickMarkType === 1) return d.toLocaleDateString(undefined, { month: 'short' });
          return d.getFullYear().toString();
        },
      },
      autoSize: true,
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    // Single React-rendered tooltip — same pattern OddsChart uses. We
    // capture the cursor x/y from param.point and the value from the
    // series data map so a hover always reads a real datapoint.
    chart.subscribeCrosshairMove((param) => {
      if (!param.point || param.time == null || !seriesRef.current) {
        setHover(null);
        return;
      }
      const d = param.seriesData.get(seriesRef.current) as AreaData | undefined;
      if (!d) {
        setHover(null);
        return;
      }
      const ts = typeof param.time === 'number' ? param.time : 0;
      setHover({ x: param.point.x, y: param.point.y, pnl: d.value, ts });
    });

    return () => {
      seriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme + color update without re-creating the chart (color changes when
  // the user flips between positive / negative P&L).
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: t.text.dimmed },
      crosshair: {
        vertLine: { color: t.border.medium },
        horzLine: { color: t.border.medium },
      },
    });

    // Detach the previous series and attach a fresh one in the new colour.
    if (seriesRef.current) {
      chart.removeSeries(seriesRef.current);
      seriesRef.current = null;
    }
    seriesRef.current = chart.addSeries(AreaSeries, {
      lineColor: pnlColor,
      topColor: `${pnlColor}38`,
      bottomColor: `${pnlColor}00`,
      lineWidth: 2,
      // Smooth curved line (rounded "waves") rather than step lines — for the
      // profile P&L the trend reads better as a continuous curve than as the
      // discrete vertical jumps the markets charts use.
      lineType: LineType.Curved,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 4,
      crosshairMarkerBorderWidth: 2,
      crosshairMarkerBorderColor: t.bg.app,
      crosshairMarkerBackgroundColor: pnlColor,
      priceFormat: {
        type: 'custom',
        formatter: (v: number) => `$${v.toFixed(2)}`,
        minMove: 0.01,
      },
    });
    seriesRef.current.setData(areaData);
    try { chart.timeScale().fitContent(); } catch { /* ignore */ }
  }, [pnlColor, areaData, t.bg.app, t.border.medium, t.text.dimmed]);

  function formatHoverDate(secs: number): string {
    return new Date(secs * 1000).toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      {/* Header: title + range selector. The numeric value lives in the
          Net P&L tile above; repeating it here would be visual duplication. */}
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

      {/* Chart canvas — container ALWAYS mounts. Placeholder and tooltip
          overlay on top via absolute positioning so the LWC instance can
          create itself on first paint without racing the data fetch.
          `flex: 1` makes it grow to fill the card height; negative margins
          bleed it to the card edges (left edge + right price axis) so it
          isn't inset by the card's padding. */}
      <Box sx={{ position: 'relative', flex: 1, minHeight: HEIGHT, mx: -2, mb: -2 }}>
        <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />
        {areaData.length === 0 && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <Typography sx={{ fontSize: '0.78rem', color: t.text.quaternary }}>
              No settled bets in this range yet
            </Typography>
          </Box>
        )}
        {hover && areaData.length > 0 && (() => {
          const TOOLTIP_W = 150;
          const positive = hover.pnl >= 0;
          const tipColor = positive ? t.gain : t.down;
          const sign = positive ? '+' : '−';
          const tipText = `${sign}${formatUSDC(String(Math.round(Math.abs(hover.pnl) * USDC_DIVISOR)), { min: 2 })}`;
          const containerW = containerRef.current?.clientWidth ?? 400;
          const flipLeft = hover.x > 0.65 * containerW;
          const left = flipLeft
            ? Math.max(4, hover.x - TOOLTIP_W - 12)
            : Math.min(containerW - TOOLTIP_W - 4, hover.x + 12);
          const containerH = containerRef.current?.clientHeight ?? HEIGHT;
          const top = Math.max(4, Math.min(hover.y - 12, containerH - 60));
          return (
            <Box
              sx={{
                position: 'absolute',
                left, top,
                width: TOOLTIP_W,
                px: 1, py: 0.75,
                borderRadius: 1,
                bgcolor: 'rgba(8, 13, 22, 0.88)',
                border: `1px solid ${t.border.medium}`,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.4)',
                pointerEvents: 'none',
                zIndex: 4,
                fontFamily: 'var(--font-satoshi), "Satoshi", sans-serif',
              }}
            >
              <Typography sx={{ fontSize: '0.62rem', color: t.text.quaternary, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                {formatHoverDate(hover.ts)}
              </Typography>
              <Typography sx={{ fontSize: '0.95rem', color: tipColor, fontWeight: 700, fontVariantNumeric: 'tabular-nums', mt: 0.25 }}>
                {tipText}
              </Typography>
            </Box>
          );
        })()}
      </Box>
    </Box>
  );
}
