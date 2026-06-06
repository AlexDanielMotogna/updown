'use client';

/**
 * Gamified cumulative P&L chart - a custom neon SVG built from scratch.
 *
 * Replaces the lightweight-charts version with an arcade look: a glowing
 * draw-in line over a gradient area, a count-up "score" header, and milestone
 * flags planted on the curve (🏆 all-time peak, 🔥 current win streak). Pure
 * SVG + an HTML overlay for the flags/tooltip - no charting lib.
 *
 * Data shaping is per-pool (one cumulative step per resolved pool at its
 * endTime) so a hedged pool that writes a winner + loser row doesn't spike
 * the curve.
 */

import { useMemo, useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { formatUSDC } from '@/lib/format';
import type { Bet } from '@/lib/api';

type Range = '1D' | '1W' | '1M' | '1Y' | 'ALL';
const RANGES: Range[] = ['1D', '1W', '1M', '1Y', 'ALL'];

function rangeStart(range: Range): number {
  const now = Date.now();
  switch (range) {
    case '1D': return now - 24 * 60 * 60 * 1000;
    case '1W': return now - 7 * 24 * 60 * 60 * 1000;
    case '1M': return now - 30 * 24 * 60 * 60 * 1000;
    case '1Y': return now - 365 * 24 * 60 * 60 * 1000;
    case 'ALL': return 0;
  }
}

const H = 210;
const PAD = { left: 10, right: 50, top: 16, bottom: 24 };
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** micro-USDC → compact $ axis label. */
function fmtAxisUsd(micro: number): string {
  const d = micro / 1_000_000;
  const a = Math.abs(d);
  const s = d < 0 ? '-' : '';
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(1)}K`;
  return `${s}$${Math.round(a)}`;
}

interface PnLChartProps {
  bets: Bet[];
}

export function PnLChart({ bets }: PnLChartProps) {
  const t = useThemeTokens();
  const [range, setRange] = useState<Range>('ALL');
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(640);
  const [hoverX, setHoverX] = useState<number | null>(null);

  // Measure width for crisp (non-distorted) pixel coordinates.
  useLayoutEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => setW(el.clientWidth || 640);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Cumulative P&L per pool ──────────────────────────────────────────
  const allPoints = useMemo(() => {
    const buckets = new Map<string, { t: number; delta: number }>();
    for (const b of bets) {
      if (b.isWinner === null) continue;
      if (!b.claimed && b.isWinner !== false) continue;
      const stake = Number(b.amount);
      const payout = b.payoutAmount ? Number(b.payoutAmount) : 0;
      const isRefund = payout > 0 && payout === stake;
      const delta = isRefund ? 0 : b.isWinner === false ? -stake : payout - stake;
      const ts = new Date(b.pool.endTime).getTime();
      const e = buckets.get(b.pool.id);
      if (e) e.delta += delta;
      else buckets.set(b.pool.id, { t: ts, delta });
    }
    const sorted = [...buckets.values()].sort((a, b) => a.t - b.t);
    let cum = 0;
    return sorted.map(({ t, delta }) => { cum += delta; return { t, pnl: cum }; });
  }, [bets]);

  const points = useMemo(() => {
    if (range === 'ALL') return allPoints;
    if (allPoints.length === 0) return [];
    const cutoff = rangeStart(range);
    let baseline = 0;
    for (const p of allPoints) { if (p.t < cutoff) baseline = p.pnl; else break; }
    return allPoints.filter(p => p.t >= cutoff).map(p => ({ t: p.t, pnl: p.pnl - baseline }));
  }, [allPoints, range]);

  const latestPnl = points.length > 0 ? points[points.length - 1].pnl : 0;
  const positive = latestPnl >= 0;
  const color = positive ? t.gain : t.down;

  // Current win streak (consecutive trailing pools with delta > 0).
  const streak = useMemo(() => {
    let s = 0;
    for (let i = points.length - 1; i > 0; i--) {
      if (points[i].pnl > points[i - 1].pnl) s++; else break;
    }
    // include the first point if it alone is a gain
    if (points.length === 1 && points[0].pnl > 0) s = 1;
    return s;
  }, [points]);

  // ── Geometry (pixel space) ───────────────────────────────────────────
  const geo = useMemo(() => {
    const plotW = Math.max(1, w - PAD.left - PAD.right);
    const plotH = H - PAD.top - PAD.bottom;
    if (points.length === 0) return null;
    const ts = points.map(p => p.t);
    const ys = points.map(p => p.pnl);
    const minT = ts[0];
    const maxT = ts[ts.length - 1];
    const minY = Math.min(0, ...ys);
    const maxY = Math.max(0, ...ys);
    const spanT = maxT - minT || 1;
    const spanY = maxY - minY || 1;
    const sx = (tv: number) => PAD.left + (points.length === 1 ? plotW : ((tv - minT) / spanT) * plotW);
    const sy = (v: number) => PAD.top + (1 - (v - minY) / spanY) * plotH;
    const coords = points.map(p => ({ x: sx(p.t), y: sy(p.pnl), pnl: p.pnl, t: p.t }));
    // Smooth (Catmull-Rom → bezier) for rounded "waves".
    let line = coords.length ? `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}` : '';
    for (let i = 0; i < coords.length - 1; i++) {
      const p0 = coords[i - 1] || coords[i];
      const p1 = coords[i];
      const p2 = coords[i + 1];
      const p3 = coords[i + 2] || p2;
      // Clamp control points' X within the segment so the curve never goes
      // backward in X (which makes the bezier self-cross into a loop when two
      // pools resolved at nearly the same time). Y stays free for smoothness.
      const c1x = Math.max(p1.x, Math.min(p2.x, p1.x + (p2.x - p0.x) / 6)), c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = Math.max(p1.x, Math.min(p2.x, p2.x - (p3.x - p1.x) / 6)), c2y = p2.y - (p3.y - p1.y) / 6;
      line += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    const bottom = PAD.top + plotH;
    const area = coords.length
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${bottom} L ${coords[0].x.toFixed(1)} ${bottom} Z`
      : '';
    const zeroY = sy(0);
    // Axis ticks.
    const yTicks: Array<{ v: number; y: number }> = [];
    for (let i = 0; i <= 3; i++) { const v = minY + (maxY - minY) * (i / 3); yTicks.push({ v, y: sy(v) }); }
    const xTicks: Array<{ t: number; x: number }> = [];
    const xn = Math.min(4, coords.length);
    const dayKey = (ms: number) => new Date(ms).toDateString();
    if (xn === 1) xTicks.push({ t: coords[0].t, x: coords[0].x });
    else for (let i = 0; i < xn; i++) {
      const idx = Math.round((coords.length - 1) * (i / (xn - 1)));
      const cand = { t: coords[idx].t, x: coords[idx].x };
      // Skip ticks that land on the same day as the previous one (avoids the
      // "jun jun jun" overlap when several pools resolved close together).
      if (xTicks.length === 0 || dayKey(cand.t) !== dayKey(xTicks[xTicks.length - 1].t)) xTicks.push(cand);
    }
    return { coords, line, area, bottom, zeroY, plotW, yTicks, xTicks };
  }, [points, w]);

  // ── Count-up score ───────────────────────────────────────────────────
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  shownRef.current = shown;
  useEffect(() => {
    let raf = 0;
    // Animate from the currently-shown value (not 0) so switching range
    // doesn't flash through $0 - which changed the number's width and made
    // the range selector on the right jump for an instant.
    const from = shownRef.current, to = latestPnl, dur = 650;
    let startTs = 0;
    const tick = (now: number) => {
      if (!startTs) startTs = now;
      const k = Math.min(1, (now - startTs) / dur);
      setShown(from + (to - from) * easeOut(k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [latestPnl, range]);

  const scoreStr = `${shown >= 0 ? '+' : '−'}${formatUSDC(String(Math.round(Math.abs(shown))), { min: 2 })}`;

  const fmtX = (ms: number) => {
    const d = new Date(ms);
    return range === '1D' || range === '1W'
      ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const hover = useMemo(() => {
    if (hoverX == null || !geo) return null;
    let best = geo.coords[0];
    let bestD = Infinity;
    for (const c of geo.coords) { const d = Math.abs(c.x - hoverX); if (d < bestD) { bestD = d; best = c; } }
    return best;
  }, [hoverX, geo]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header: animated score + range selector */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
        <Box>
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 1 }}>
            Profit / Loss
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{
              fontSize: { xs: '1.3rem', md: '1.7rem' }, fontWeight: 900, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              textShadow: `0 0 18px ${withAlpha(color, 0.55)}`,
            }}>
              {scoreStr}
            </Typography>
            <Box component="span" sx={{ fontSize: '1rem', color }}>{positive ? '▲' : '▼'}</Box>
            {streak > 1 && (
              <Box sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.25, ml: 0.5,
                px: 0.75, py: 0.2, borderRadius: '999px',
                bgcolor: withAlpha(t.gold, 0.15), border: `1px solid ${withAlpha(t.gold, 0.45)}`,
              }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 900, color: t.gold }}>🔥 {streak}</Typography>
              </Box>
            )}
          </Box>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.25, p: 0.25, bgcolor: t.bg.surfaceAlt, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
          {RANGES.map(r => {
            const active = r === range;
            return (
              <Box key={r} onClick={() => setRange(r)} sx={{
                px: 1, py: 0.4, cursor: 'pointer', borderRadius: '6px',
                fontSize: '0.7rem', fontWeight: 800,
                color: active ? t.text.contrast : t.text.tertiary,
                bgcolor: active ? color : 'transparent',
                boxShadow: active ? `0 0 12px ${withAlpha(color, 0.5)}` : 'none',
                transition: 'all 0.15s ease',
                '&:hover': { color: active ? t.text.contrast : t.text.primary },
              }}>
                {r}
              </Box>
            );
          })}
        </Box>
      </Box>

      {/* Chart canvas */}
      <Box ref={wrapRef} sx={{
        position: 'relative', width: '100%', height: H,
        '@keyframes pnlDraw': { from: { strokeDashoffset: 1 }, to: { strokeDashoffset: 0 } },
        '@keyframes pnlPulse': { '0%,100%': { opacity: 0.1 }, '50%': { opacity: 0.45 } },
        '& .pnl-line': { strokeDasharray: 1, animation: 'pnlDraw 1.1s ease-out forwards' },
        '& .pnl-pulse': { animation: 'pnlPulse 1.6s ease-in-out infinite' },
      }}>
        {!geo ? (
          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.quaternary }}>No settled bets in this range yet</Typography>
          </Box>
        ) : (
          <>
            <svg
              width={w}
              height={H}
              style={{ display: 'block', overflow: 'visible' }}
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setHoverX(e.clientX - rect.left);
              }}
              onMouseLeave={() => setHoverX(null)}
            >
              <defs>
                <linearGradient id="pnlFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>

              {/* y gridlines + value labels (right), x time labels (bottom) */}
              {geo.yTicks.map((tk, i) => (
                <g key={`y${i}`}>
                  <line x1={PAD.left} y1={tk.y} x2={w - PAD.right} y2={tk.y} stroke={t.border.subtle} strokeWidth={1} opacity={0.4} />
                  <text x={w - PAD.right + 6} y={tk.y + 3} fill={t.text.quaternary} fontSize={9}>{fmtAxisUsd(tk.v)}</text>
                </g>
              ))}
              {geo.xTicks.map((tk, i) => (
                <text key={`x${i}`} x={tk.x} y={H - 7} fill={t.text.quaternary} fontSize={9} textAnchor="middle">{fmtX(tk.t)}</text>
              ))}

              {/* zero baseline */}
              {geo.zeroY > PAD.top && geo.zeroY < geo.bottom && (
                <line x1={PAD.left} y1={geo.zeroY} x2={w - PAD.right} y2={geo.zeroY}
                  stroke={t.border.medium} strokeWidth={1} strokeDasharray="3 4" opacity={0.6} />
              )}

              {/* area */}
              <path d={geo.area} fill="url(#pnlFill)" />

              {/* glowing line with draw-in animation */}
              <path
                className="pnl-line"
                d={geo.line}
                fill="none"
                stroke={color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                pathLength={1}
                style={{ filter: `drop-shadow(0 0 3px ${withAlpha(color, 0.9)}) drop-shadow(0 0 7px ${withAlpha(color, 0.5)})` }}
              />

              {/* endpoint pulse dot */}
              {geo.coords.length > 0 && (() => {
                const last = geo.coords[geo.coords.length - 1];
                return (
                  <>
                    <circle className="pnl-pulse" cx={last.x} cy={last.y} r={8} fill={color} />
                    <circle cx={last.x} cy={last.y} r={3.5} fill={color} style={{ filter: `drop-shadow(0 0 5px ${color})` }} />
                  </>
                );
              })()}

              {/* hover crosshair + dot */}
              {hover && (
                <>
                  <line x1={hover.x} y1={PAD.top} x2={hover.x} y2={geo.bottom} stroke={t.border.medium} strokeWidth={1} opacity={0.7} />
                  <circle cx={hover.x} cy={hover.y} r={4} fill={t.bg.surface} stroke={color} strokeWidth={2} />
                </>
              )}
            </svg>

            {/* hover tooltip */}
            {hover && (() => {
              const TW = 130;
              const flip = hover.x > w - TW - 12;
              const left = flip ? hover.x - TW - 10 : hover.x + 10;
              const hp = hover.pnl >= 0;
              return (
                <Box sx={{
                  position: 'absolute', pointerEvents: 'none', zIndex: 4,
                  left: Math.max(2, Math.min(left, w - TW - 2)), top: Math.max(2, hover.y - 44),
                  width: TW, px: 1, py: 0.6, borderRadius: 1,
                  bgcolor: 'rgba(8,13,22,0.92)', border: `1px solid ${t.border.medium}`,
                  backdropFilter: 'blur(8px)', boxShadow: '0 6px 18px rgba(0,0,0,0.45)',
                }}>
                  <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.6)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    {new Date(hover.t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </Typography>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: hp ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                    {hp ? '+' : '−'}{formatUSDC(String(Math.round(Math.abs(hover.pnl))), { min: 2 })}
                  </Typography>
                </Box>
              );
            })()}
          </>
        )}
      </Box>
    </Box>
  );
}
