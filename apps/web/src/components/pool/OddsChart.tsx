'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Popover } from '@mui/material';
import { Settings } from '@mui/icons-material';
import { getSocket, connectSocket } from '@/lib/socket';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface OddsPoint {
  t: number;
  p: number;          // up share (legacy single-value — also used by polymarket data)
  down?: number;      // down share — set on 3-way pools so the "no" line isn't 1 - up
  draw?: number;      // draw share — only set on 3-way pools
}

type Source = 'polymarket' | 'updown';

interface OddsChartProps {
  poolId: string;
  question?: string | null;
  currentOdds?: number | null;
  totalUp?: string;
  totalDown?: string;
  /** 3-way pools (sports home/draw/away): pass the draw stake so the chart's
   *  up% uses the FULL pool as denominator and matches the card's outcomes. */
  totalDraw?: string;
  /** Lock the data source (hides the source toggle). */
  lockSource?: Source;
  /** Hide the header controls (source toggle, settings, value readout). */
  hideControls?: boolean;
  /** When the pool has no bets yet, seed a gentle baseline curve so the chart
   *  still renders instead of an empty-state placeholder. */
  seedDefault?: boolean;
  /** 3-way pool (sports home/draw/away) — render a third line for draw. */
  threeWay?: boolean;
}

/** Smooth (Catmull-Rom → cubic bezier) path through points for a flowing line. */
function smoothPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

const PADDING = { top: 20, right: 56, bottom: 30, left: 12 };
const CHART_H = 300;
const MAX_UPDOWN_POINTS = 100;
const FONT = 'var(--font-satoshi), Satoshi, sans-serif';

// End-point indicator (current value pulse).
const DOT_R = 4;
const HALO_MIN = 6;
const HALO_MAX = 12;
const PULSE_DUR = '2.2s';

// Hover tooltip dimensions (per-outcome line).
const TIP_PAD = 8;
const TIP_LINE_H = 16;

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function OddsChart({ poolId, totalUp, totalDown, totalDraw, lockSource, hideControls, seedDefault, threeWay }: OddsChartProps) {
  const t = useThemeTokens();
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [pmHistory, setPmHistory] = useState<OddsPoint[]>([]);
  const [udHistory, setUdHistory] = useState<OddsPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [source, setSource] = useState<Source>(lockSource ?? 'polymarket');
  const [showYes, setShowYes] = useState(true);
  const [showNo, setShowNo] = useState(true);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);

  // ── Polymarket data: fetch + 30s refresh ──
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const fetchHistory = () => {
      fetch(`${API}/api/pools/${poolId}/odds-history?interval=max&fidelity=60`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data?.history) setPmHistory(data.data.history);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchHistory();
    const iv = setInterval(fetchHistory, 30_000);
    return () => clearInterval(iv);
  }, [poolId]);

  // ── UpDown data: seed with simulated history showing odds evolution ──
  useEffect(() => {
    const up = Number(totalUp || 0);
    const down = Number(totalDown || 0);
    const draw = Number(totalDraw || 0);
    const total = up + down + draw;
    const now = Date.now() / 1000;
    const defShare = threeWay ? 1 / 3 : 0.5;
    const clamp = (x: number) => Math.max(0.01, Math.min(0.99, x));
    if (total > 0) {
      // Share of the FULL pool per outcome (matches the card percentages exactly).
      const tgtUp = up / total;
      const tgtDown = down / total;
      const tgtDraw = draw / total;
      const points: OddsPoint[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = now - (steps - i) * 300; // 5 min intervals
        const progress = i / steps;
        const noise = (Math.sin(i * 2.7) * 0.03);
        const interp = (target: number) => clamp(defShare + (target - defShare) * progress * progress + noise);
        points.push({
          t,
          p: interp(tgtUp),
          ...(threeWay && { down: interp(tgtDown), draw: interp(tgtDraw) }),
        });
      }
      const last = points[points.length - 1];
      last.p = tgtUp;
      if (threeWay) { last.down = tgtDown; last.draw = tgtDraw; }
      setUdHistory(points);
    } else if (seedDefault) {
      // No bets yet — seed a gentle baseline at the default share so the chart
      // still renders (used by the trending hero so every featured market
      // shows a chart).
      const points: OddsPoint[] = [];
      const steps = 12;
      for (let i = 0; i <= steps; i++) {
        const t = now - (steps - i) * 300;
        const noise = (Math.sin(i * 1.3) * 0.02);
        points.push({
          t,
          p: defShare + noise,
          ...(threeWay && { down: defShare + noise * 0.7, draw: defShare + noise * 0.4 }),
        });
      }
      setUdHistory(points);
    }
  }, []);

  // ── UpDown data: WebSocket live updates ──
  const addUdPoint = useCallback((up: number, down: number, draw: number = 0) => {
    const total = up + down + draw;
    if (total === 0) return;
    setUdHistory(prev => {
      const pUp = up / total;
      const last = prev[prev.length - 1];
      if (last && Math.abs(last.p - pUp) < 0.001) return prev; // no meaningful change
      const point: OddsPoint = { t: Date.now() / 1000, p: pUp };
      if (threeWay) {
        point.down = down / total;
        point.draw = draw / total;
      }
      const next = [...prev, point];
      return next.length > MAX_UPDOWN_POINTS ? next.slice(-MAX_UPDOWN_POINTS) : next;
    });
  }, [threeWay]);

  useEffect(() => {
    if (!poolId) return;
    const socket = getSocket();
    connectSocket();
    const onUpdate = (data: { id: string; totalUp: string; totalDown: string; totalDraw?: string }) => {
      if (data.id !== poolId) return;
      addUdPoint(Number(data.totalUp), Number(data.totalDown), Number(data.totalDraw || 0));
    };
    socket.on('pool:updated', onUpdate);
    return () => { socket.off('pool:updated', onUpdate); };
  }, [poolId, addUdPoint]);

  useEffect(() => {
    addUdPoint(Number(totalUp || 0), Number(totalDown || 0), Number(totalDraw || 0));
  }, [totalUp, totalDown, totalDraw, addUdPoint]);

  // ── Pick active dataset ──
  const history = source === 'polymarket' ? pmHistory : udHistory;
  const isLive = source === 'updown';
  const formatHoverTime = source === 'polymarket'
    ? (t: number) => formatDateFull(t)
    : (t: number) => formatTime(t * 1000);
  const formatTickTime = source === 'polymarket'
    ? (t: number) => formatDate(t)
    : (t: number) => formatTime(t * 1000);

  // Track container width
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      if (w > 0) setWidth(w);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const chartW = width - PADDING.left - PADDING.right;
  const chartH = CHART_H - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (i: number) => PADDING.left + (i / Math.max(history.length - 1, 1)) * chartW,
    [history.length, chartW],
  );
  const toY = useCallback(
    (p: number) => PADDING.top + ((1 - p) / 1) * chartH,
    [chartH],
  );

  const yesPath = useMemo(() => smoothPath(history.map((h, i) => [toX(i), toY(h.p)])), [history, toX, toY]);

  // 3-way pools: "no" line uses the actual down share, not 1 - up (which would
  // incorrectly include the draw share). 2-way pools fall back to 1 - up.
  const noPath = useMemo(
    () => smoothPath(history.map((h, i) => [toX(i), toY(h.down ?? (1 - h.p))])),
    [history, toX, toY],
  );

  const drawPath = useMemo(() => {
    if (!threeWay) return '';
    return smoothPath(history.map((h, i) => [toX(i), toY(h.draw ?? 0)]));
  }, [history, toX, toY, threeWay]);

  const yesAreaPath = useMemo(() => {
    if (history.length < 2) return '';
    const bottom = PADDING.top + chartH;
    return yesPath + ` L${toX(history.length - 1).toFixed(1)},${bottom} L${toX(0).toFixed(1)},${bottom} Z`;
  }, [yesPath, history.length, toX, chartH]);

  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map(p => ({ p, y: toY(p) })), [toY]);

  const xTicks = useMemo(() => {
    if (history.length < 2) return [];
    return Array.from({ length: 5 }, (_, i) => {
      const idx = Math.floor((i / 4) * (history.length - 1));
      return { label: formatTickTime(history[idx].t), x: toX(idx) };
    });
  }, [history, toX, formatTickTime]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (history.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - PADDING.left;
    const idx = Math.round((mouseX / chartW) * (history.length - 1));
    setHoverIndex(Math.max(0, Math.min(idx, history.length - 1)));
  }, [history.length, chartW]);

  const hoverPoint = hoverIndex != null ? history[hoverIndex] : null;
  const lastPoint = history.length > 0 ? history[history.length - 1] : null;

  if (loading && source === 'polymarket') {
    return (
      <Box ref={containerRef} sx={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} sx={{ color: t.text.muted }} />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      {!hideControls && (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        {/* Left: source toggle + legend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {/* Source toggle */}
          <Box sx={{ display: 'flex', bgcolor: t.border.subtle, borderRadius: '6px', overflow: 'hidden' }}>
            {([
              { key: 'polymarket' as Source, label: 'Polymarket' },
              { key: 'updown' as Source, label: 'UpDown' },
            ]).map(s => (
              <Box
                key={s.key}
                onClick={() => { setSource(s.key); setHoverIndex(null); }}
                sx={{
                  px: 1.5, py: 0.5, cursor: 'pointer',
                  fontSize: '0.65rem', fontWeight: 700,
                  color: source === s.key ? t.text.primary : t.text.dimmed,
                  bgcolor: source === s.key ? t.border.strong : 'transparent',
                  transition: 'all 0.15s',
                  '&:hover': { bgcolor: t.border.default },
                }}
              >
                {s.label}
              </Box>
            ))}
          </Box>
          {isLive && (
            <>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.up, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
              <Typography sx={{ fontSize: '0.55rem', fontWeight: 700, color: t.text.muted }}>LIVE</Typography>
            </>
          )}
        </Box>

        {/* Right: values + settings */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {(hoverPoint || lastPoint) && (
            <>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: t.up, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct((hoverPoint || lastPoint)!.p)}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.down, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct(1 - (hoverPoint || lastPoint)!.p)}
              </Typography>
            </>
          )}
          {hoverPoint && (
            <Typography sx={{ fontSize: '0.65rem', color: t.text.muted, ml: 0.5 }}>
              {formatHoverTime(hoverPoint.t)}
            </Typography>
          )}
          <IconButton
            size="small"
            onClick={(e) => setSettingsAnchor(settingsAnchor ? null : e.currentTarget)}
            sx={{ color: t.text.muted, p: 0.5, '&:hover': { color: t.text.secondary } }}
          >
            <Settings sx={{ fontSize: 16 }} />
          </IconButton>
          <Popover
            open={!!settingsAnchor}
            anchorEl={settingsAnchor}
            onClose={() => setSettingsAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { bgcolor: t.bg.chart, border: `1px solid ${t.border.medium}`, borderRadius: '8px', p: 1.5, minWidth: 140 } }}
          >
            {[
              { label: 'Yes', color: t.up, active: showYes, toggle: () => setShowYes(!showYes) },
              { label: 'No', color: t.down, active: showNo, toggle: () => setShowNo(!showNo) },
            ].map(opt => (
              <Box
                key={opt.label}
                onClick={opt.toggle}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 0.5, cursor: 'pointer',
                  borderRadius: '4px', '&:hover': { bgcolor: t.border.subtle },
                }}
              >
                <Box sx={{
                  width: 14, height: 14, borderRadius: '3px',
                  border: `2px solid ${opt.color}`,
                  bgcolor: opt.active ? opt.color : 'transparent',
                  opacity: opt.active ? 1 : 0.3,
                  transition: 'all 0.15s',
                }} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: opt.active ? t.text.primary : t.text.dimmed }}>
                  {opt.label}
                </Typography>
              </Box>
            ))}
          </Popover>
        </Box>
      </Box>
      )}

      {/* Chart */}
      <Box ref={containerRef} sx={{ width: '100%', height: CHART_H }}>
        {history.length === 0 ? (
          <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.muted }}>
              {source === 'updown' ? 'No predictions yet — be the first!' : 'No market data available'}
            </Typography>
          </Box>
        ) : (
          <svg width={width} height={CHART_H} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)} style={{ cursor: 'crosshair', display: 'block' }}>
            <defs>
              <linearGradient id={`og-${poolId}-${source}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={t.up} stopOpacity={0.1} />
                <stop offset="100%" stopColor={t.up} stopOpacity={0} />
              </linearGradient>
            </defs>

            {/* Grid */}
            {yTicks.map((yt, i) => (
              <g key={i}>
                <line x1={PADDING.left} y1={yt.y} x2={PADDING.left + chartW} y2={yt.y} stroke={t.border.subtle} />
                <text x={PADDING.left + chartW + 8} y={yt.y + 4} fill={t.text.muted} fontSize={10} fontFamily={FONT}>{formatPct(yt.p)}</text>
              </g>
            ))}
            {xTicks.map((xt, i) => (
              <text key={i} x={xt.x} y={CHART_H - 6} fill={t.text.muted} fontSize={10} textAnchor="middle" fontFamily={FONT}>{xt.label}</text>
            ))}

            {/* 50% ref */}
            <line x1={PADDING.left} y1={toY(0.5)} x2={PADDING.left + chartW} y2={toY(0.5)} stroke={t.border.default} strokeDasharray="6,4" />

            {/* Lines — yes line gets a subtle drop-shadow glow for presence. */}
            {showYes && <path d={yesAreaPath} fill={`url(#og-${poolId}-${source})`} />}
            {showNo && <path d={noPath} fill="none" stroke={t.down} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />}
            {threeWay && drawPath && <path d={drawPath} fill="none" stroke={t.draw} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.75} />}
            {showYes && <path d={yesPath} fill="none" stroke={t.up} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 4px ${withAlpha(t.up, 0.45)})` }} />}

            {/* Hover — vertical guide, focus dots, and a floating tooltip with
                the historical % for each outcome at the cursor position. */}
            {hoverIndex != null && hoverPoint && (() => {
              const cx = toX(hoverIndex);
              const lines: Array<{ color: string; value: number }> = [];
              if (showYes) lines.push({ color: t.up, value: hoverPoint.p });
              if (showNo) lines.push({ color: t.down, value: hoverPoint.down ?? (1 - hoverPoint.p) });
              if (threeWay && hoverPoint.draw != null) lines.push({ color: t.draw, value: hoverPoint.draw });
              const tipW = 92;
              const tipH = TIP_PAD * 2 + TIP_LINE_H + TIP_LINE_H * lines.length;
              const tipX = cx + tipW + 16 > PADDING.left + chartW
                ? cx - tipW - 14
                : cx + 14;
              const tipY = Math.max(
                PADDING.top,
                Math.min(PADDING.top + chartH - tipH, toY(hoverPoint.p) - tipH / 2),
              );
              return (
                <>
                  <line x1={cx} y1={PADDING.top} x2={cx} y2={PADDING.top + chartH} stroke={t.border.strong} strokeDasharray="3,3" />
                  {showYes && <circle cx={cx} cy={toY(hoverPoint.p)} r={4} fill={t.up} stroke={t.bg.app} strokeWidth={2} />}
                  {showNo && <circle cx={cx} cy={toY(hoverPoint.down ?? (1 - hoverPoint.p))} r={3.5} fill={t.down} stroke={t.bg.app} strokeWidth={2} opacity={0.85} />}
                  {threeWay && hoverPoint.draw != null && <circle cx={cx} cy={toY(hoverPoint.draw)} r={3.5} fill={t.draw} stroke={t.bg.app} strokeWidth={2} opacity={0.9} />}

                  <g transform={`translate(${tipX},${tipY})`} pointerEvents="none">
                    <rect x={0} y={0} width={tipW} height={tipH} rx={6} ry={6} fill={t.bg.surfaceAlt} stroke={t.border.strong} strokeWidth={1} opacity={0.97} />
                    <text x={TIP_PAD} y={TIP_PAD + 10} fill={t.text.muted} fontSize={9} fontFamily={FONT}>
                      {formatHoverTime(hoverPoint.t)}
                    </text>
                    {lines.map((ln, i) => {
                      const y = TIP_PAD + TIP_LINE_H + (i + 1) * TIP_LINE_H - 4;
                      return (
                        <g key={i}>
                          <circle cx={TIP_PAD + 4} cy={y - 3} r={3} fill={ln.color} />
                          <text x={tipW - TIP_PAD} y={y} fill={ln.color} fontSize={11} fontWeight={700} fontFamily={FONT} textAnchor="end">
                            {formatPct(ln.value)}
                          </text>
                        </g>
                      );
                    })}
                  </g>
                </>
              );
            })()}

            {/* End-point indicators — current value with a pulsing halo for
                "alive" feel (Kalshi/Polymarket-style live tick). */}
            {lastPoint && hoverIndex == null && (() => {
              const endX = toX(history.length - 1);
              const endpoint = (color: string, value: number, opts?: { primary?: boolean }) => {
                const primary = opts?.primary !== false;
                const dotR = primary ? DOT_R : DOT_R - 1;
                const haloMin = primary ? HALO_MIN : HALO_MIN - 1;
                const haloMax = primary ? HALO_MAX : HALO_MAX - 2;
                return (
                  <g>
                    <circle cx={endX} cy={toY(value)} r={haloMin} fill={color} opacity={0.32}>
                      <animate attributeName="r" values={`${haloMin};${haloMax};${haloMin}`} dur={PULSE_DUR} repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.35;0;0.35" dur={PULSE_DUR} repeatCount="indefinite" />
                    </circle>
                    <circle cx={endX} cy={toY(value)} r={dotR} fill={color} stroke={t.bg.app} strokeWidth={2} />
                    <text x={endX + 10} y={toY(value) + 4} fill={color} fontSize={primary ? 11 : 10} fontWeight={primary ? 800 : 600} fontFamily={FONT}>
                      {formatPct(value)}
                    </text>
                  </g>
                );
              };
              return (
                <>
                  {showYes && endpoint(t.up, lastPoint.p, { primary: true })}
                  {showNo && endpoint(t.down, lastPoint.down ?? (1 - lastPoint.p), { primary: false })}
                  {threeWay && lastPoint.draw != null && endpoint(t.draw, lastPoint.draw, { primary: false })}
                </>
              );
            })()}
          </svg>
        )}
      </Box>
    </Box>
  );
}
