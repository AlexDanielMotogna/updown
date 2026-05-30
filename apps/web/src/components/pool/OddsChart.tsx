'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Popover } from '@mui/material';
import { Settings } from '@mui/icons-material';
import { getSocket, connectSocket } from '@/lib/socket';
import { useThemeTokens } from '@/app/providers';

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
  /** Inline labels next to each outcome (Kalshi-style "Real Madrid 58%"). When
   *  omitted the chart just shows the percentage. */
  labels?: { up?: string; down?: string; draw?: string };
}

/**
 * Step path — each point holds its value until the next x, then jumps vertically
 * (the typical "stairs" shape Kalshi/Polymarket use for prediction market lines).
 *   M x0,y0  L x1,y0  L x1,y1  L x2,y1  L x2,y2  …
 */
function stepPath(pts: Array<[number, number]>): string {
  if (pts.length < 2) return '';
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const [x, y] = pts[i];
    const prevY = pts[i - 1][1];
    d += ` L${x.toFixed(1)},${prevY.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

// Right padding leaves room for the inline "65% Up" outcome badges at the end
// of each line + the (right-anchored) y-axis tick text on the far edge.
const PADDING = { top: 28, right: 110, bottom: 26, left: 12 };
const CHART_H = 300;
const MAX_UPDOWN_POINTS = 100;
const FONT = 'var(--font-satoshi), Satoshi, sans-serif';
const DOT_R = 3.5;
const LABEL_GAP = 8;          // px between end-point dot and inline label
const HOVER_LABEL_OFFSET = 10;
const LABEL_MIN_GAP = 14;     // vertical breathing room between stacked labels
const LABEL_OFFSET_Y = 6;     // text drawn this many px above the dot

/**
 * Stack labels vertically so close-share outcomes don't write on top of each
 * other. Sorts by line Y, lays out top-down with min-gap, then clamps from the
 * bottom up so labels never escape the plot area.
 */
function placeLabels<T extends { color: string; value: number; label?: string }>(
  items: T[],
  toY: (v: number) => number,
  minY: number,
  maxY: number,
): Array<T & { lineY: number; textY: number }> {
  const sorted = items
    .map(it => ({ ...it, lineY: toY(it.value), textY: 0 }))
    .sort((a, b) => a.lineY - b.lineY);
  let prev = minY - LABEL_MIN_GAP;
  for (const s of sorted) {
    s.textY = Math.max(s.lineY - LABEL_OFFSET_Y, prev + LABEL_MIN_GAP);
    prev = s.textY;
  }
  let next = maxY;
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].textY > next) sorted[i].textY = next;
    next = sorted[i].textY - LABEL_MIN_GAP;
  }
  return sorted;
}

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

/** Top-of-chart hover label, Kalshi style: "MAY 16, 2 PM" / "2:30 PM". */
function formatHoverHeader(ts: number, source: Source): string {
  const d = new Date(ts * 1000);
  if (source === 'polymarket') {
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', hour12: true }).toUpperCase();
  }
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

export function OddsChart({ poolId, totalUp, totalDown, totalDraw, lockSource, hideControls, seedDefault, threeWay, labels }: OddsChartProps) {
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

  const yesPath = useMemo(() => stepPath(history.map((h, i) => [toX(i), toY(h.p)])), [history, toX, toY]);

  // 3-way pools: "no" line uses the actual down share, not 1 - up (which would
  // incorrectly include the draw share). 2-way pools fall back to 1 - up.
  const noPath = useMemo(
    () => stepPath(history.map((h, i) => [toX(i), toY(h.down ?? (1 - h.p))])),
    [history, toX, toY],
  );

  const drawPath = useMemo(() => {
    if (!threeWay) return '';
    return stepPath(history.map((h, i) => [toX(i), toY(h.draw ?? 0)]));
  }, [history, toX, toY, threeWay]);

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
            {/* Grid — subtle horizontals + percentage labels anchored to the
                far right edge so outcome badges have the whole padding-area
                between line-end and tick to themselves (Kalshi layout). */}
            {yTicks.map((yt, i) => (
              <g key={i}>
                <line x1={PADDING.left} y1={yt.y} x2={PADDING.left + chartW} y2={yt.y} stroke={t.border.subtle} strokeWidth={0.6} opacity={0.55} />
                <text x={width - 4} y={yt.y + 3} fill={t.text.muted} fontSize={10} fontFamily={FONT} opacity={0.6} textAnchor="end">
                  {formatPct(yt.p)}
                </text>
              </g>
            ))}
            {xTicks.map((xt, i) => (
              <text key={i} x={xt.x} y={CHART_H - 6} fill={t.text.muted} fontSize={10} textAnchor="middle" fontFamily={FONT} opacity={0.7}>
                {xt.label}
              </text>
            ))}

            {/* Lines — flat solid strokes. No glow, no area fill, no gradients.
                Stacking: secondary first (no, draw) then primary (yes) on top. */}
            {showNo && <path d={noPath} fill="none" stroke={t.down} strokeWidth={1.6} strokeLinejoin="round" />}
            {threeWay && drawPath && <path d={drawPath} fill="none" stroke={t.draw} strokeWidth={1.6} strokeLinejoin="round" />}
            {showYes && <path d={yesPath} fill="none" stroke={t.up} strokeWidth={1.8} strokeLinejoin="round" />}

            {/* End-point badges — when not hovering, show "{pct} {label}" next
                to a small dot at each line's last point. Labels are stacked
                vertically (above the dots) with min spacing so close-share
                outcomes don't overwrite each other, and each label gets a
                paint-order halo so it reads cleanly against the background. */}
            {lastPoint && hoverIndex == null && (() => {
              const endX = toX(history.length - 1);
              const items: Array<{ color: string; value: number; label?: string }> = [];
              if (showYes) items.push({ color: t.up, value: lastPoint.p, label: labels?.up });
              if (showNo) items.push({ color: t.down, value: lastPoint.down ?? (1 - lastPoint.p), label: labels?.down });
              if (threeWay && lastPoint.draw != null) items.push({ color: t.draw, value: lastPoint.draw, label: labels?.draw });
              const placed = placeLabels(items, toY, PADDING.top + 8, PADDING.top + chartH - 4);
              return (
                <>
                  {placed.map((it, i) => (
                    <g key={i}>
                      <circle cx={endX} cy={it.lineY} r={DOT_R} fill={it.color} />
                      {/* Faint leader line when the label is offset from the
                          dot, so the reader can still tie label ↔ line. */}
                      {Math.abs(it.textY - it.lineY) > 4 && (
                        <line
                          x1={endX + 2}
                          y1={it.lineY}
                          x2={endX + LABEL_GAP - 1}
                          y2={it.textY - 3}
                          stroke={it.color}
                          strokeWidth={0.8}
                          opacity={0.45}
                        />
                      )}
                      <text
                        x={endX + LABEL_GAP}
                        y={it.textY}
                        fill={it.color}
                        stroke={t.bg.app}
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={11}
                        fontWeight={700}
                        fontFamily={FONT}
                      >
                        {formatPct(it.value)}{it.label ? ` ${it.label}` : ''}
                      </text>
                    </g>
                  ))}
                </>
              );
            })()}

            {/* Hover — thin solid vertical guide, top-of-chart date pill, and
                inline "{pct} {label}" badges stacked vertically next to each
                line at the cursor X. Label flips left when too close to the
                right edge; paint-order halo keeps text readable over lines. */}
            {hoverIndex != null && hoverPoint && (() => {
              const cx = toX(hoverIndex);
              const items: Array<{ color: string; value: number; label?: string }> = [];
              if (showYes) items.push({ color: t.up, value: hoverPoint.p, label: labels?.up });
              if (showNo) items.push({ color: t.down, value: hoverPoint.down ?? (1 - hoverPoint.p), label: labels?.down });
              if (threeWay && hoverPoint.draw != null) items.push({ color: t.draw, value: hoverPoint.draw, label: labels?.draw });
              const labelOnRight = cx + 90 < PADDING.left + chartW;
              const labelX = labelOnRight ? cx + HOVER_LABEL_OFFSET : cx - HOVER_LABEL_OFFSET;
              const labelAnchor: 'start' | 'end' = labelOnRight ? 'start' : 'end';
              const headerX = Math.min(
                Math.max(cx, PADDING.left + 40),
                PADDING.left + chartW - 40,
              );
              const placed = placeLabels(items, toY, PADDING.top + 8, PADDING.top + chartH - 4);
              return (
                <>
                  <line x1={cx} y1={PADDING.top} x2={cx} y2={PADDING.top + chartH} stroke={t.border.strong} strokeWidth={1} />
                  <text
                    x={headerX}
                    y={PADDING.top - 10}
                    fill={t.text.secondary}
                    fontSize={10}
                    fontWeight={800}
                    textAnchor="middle"
                    fontFamily={FONT}
                    letterSpacing="0.06em"
                  >
                    {formatHoverHeader(hoverPoint.t, source)}
                  </text>
                  {placed.map((it, i) => (
                    <g key={i}>
                      <circle cx={cx} cy={it.lineY} r={DOT_R} fill={it.color} stroke={t.bg.app} strokeWidth={1.5} />
                      {Math.abs(it.textY - it.lineY) > 4 && (
                        <line
                          x1={labelOnRight ? cx + 2 : cx - 2}
                          y1={it.lineY}
                          x2={labelOnRight ? labelX - 1 : labelX + 1}
                          y2={it.textY - 3}
                          stroke={it.color}
                          strokeWidth={0.8}
                          opacity={0.45}
                        />
                      )}
                      <text
                        x={labelX}
                        y={it.textY}
                        fill={it.color}
                        stroke={t.bg.app}
                        strokeWidth={3}
                        paintOrder="stroke"
                        fontSize={11}
                        fontWeight={700}
                        fontFamily={FONT}
                        textAnchor={labelAnchor}
                      >
                        {formatPct(it.value)}{it.label ? ` ${it.label}` : ''}
                      </text>
                    </g>
                  ))}
                </>
              );
            })()}
          </svg>
        )}
      </Box>
    </Box>
  );
}
