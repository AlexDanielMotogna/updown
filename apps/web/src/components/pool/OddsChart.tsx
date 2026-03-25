'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Popover } from '@mui/material';
import { Settings } from '@mui/icons-material';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

interface OddsPoint {
  t: number;
  p: number;
}

interface OddsChartProps {
  poolId: string;
  question?: string | null;
  currentOdds?: number | null;
}

const PADDING = { top: 20, right: 56, bottom: 30, left: 12 };
const CHART_H = 300;
const FONT = 'var(--font-satoshi), Satoshi, sans-serif';

function formatPct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function formatDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDateFull(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function OddsChart({ poolId }: OddsChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [history, setHistory] = useState<OddsPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showYes, setShowYes] = useState(true);
  const [showNo, setShowNo] = useState(true);
  const [settingsAnchor, setSettingsAnchor] = useState<HTMLElement | null>(null);

  // Fetch + auto-refresh
  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const fetchHistory = () => {
      fetch(`${API}/api/pools/${poolId}/odds-history?interval=max&fidelity=60`)
        .then(r => r.json())
        .then(data => {
          if (data.success && data.data?.history) setHistory(data.data.history);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    fetchHistory();
    const iv = setInterval(fetchHistory, 30_000);
    return () => clearInterval(iv);
  }, [poolId]);

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

  const yesPath = useMemo(() => {
    if (history.length < 2) return '';
    return history.map((h, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(h.p).toFixed(1)}`).join(' ');
  }, [history, toX, toY]);

  const noPath = useMemo(() => {
    if (history.length < 2) return '';
    return history.map((h, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(1 - h.p).toFixed(1)}`).join(' ');
  }, [history, toX, toY]);

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
      return { label: formatDate(history[idx].t), x: toX(idx) };
    });
  }, [history, toX]);

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (history.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseX = e.clientX - rect.left - PADDING.left;
    const idx = Math.round((mouseX / chartW) * (history.length - 1));
    setHoverIndex(Math.max(0, Math.min(idx, history.length - 1)));
  }, [history.length, chartW]);

  const hoverPoint = hoverIndex != null ? history[hoverIndex] : null;
  const lastPoint = history.length > 0 ? history[history.length - 1] : null;

  if (loading) {
    return (
      <Box ref={containerRef} sx={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress size={24} sx={{ color: 'rgba(255,255,255,0.2)' }} />
      </Box>
    );
  }

  if (history.length < 2) {
    return (
      <Box ref={containerRef} sx={{ height: CHART_H, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.25)' }}>
          No market data available yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        {/* Left: source + legend */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Polymarket
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 2.5, bgcolor: UP_COLOR, borderRadius: 1 }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Yes</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box sx={{ width: 12, height: 2.5, bgcolor: DOWN_COLOR, borderRadius: 1, opacity: 0.5 }} />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>No</Typography>
          </Box>
        </Box>

        {/* Right: values + settings */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {hoverPoint ? (
            <>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: UP_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct(hoverPoint.p)}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: DOWN_COLOR, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct(1 - hoverPoint.p)}
              </Typography>
              <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)', ml: 0.5 }}>
                {formatDateFull(hoverPoint.t)}
              </Typography>
            </>
          ) : lastPoint ? (
            <>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: UP_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct(lastPoint.p)}
              </Typography>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: DOWN_COLOR, opacity: 0.6, fontVariantNumeric: 'tabular-nums' }}>
                {formatPct(1 - lastPoint.p)}
              </Typography>
            </>
          ) : null}
          <IconButton
            size="small"
            onClick={(e) => setSettingsAnchor(settingsAnchor ? null : e.currentTarget)}
            sx={{ color: 'rgba(255,255,255,0.25)', p: 0.5, '&:hover': { color: 'rgba(255,255,255,0.5)' } }}
          >
            <Settings sx={{ fontSize: 16 }} />
          </IconButton>
          <Popover
            open={!!settingsAnchor}
            anchorEl={settingsAnchor}
            onClose={() => setSettingsAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{ sx: { bgcolor: '#1a2030', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', p: 1.5, minWidth: 140 } }}
          >
            {[
              { label: 'Yes', color: UP_COLOR, active: showYes, toggle: () => setShowYes(!showYes) },
              { label: 'No', color: DOWN_COLOR, active: showNo, toggle: () => setShowNo(!showNo) },
            ].map(opt => (
              <Box
                key={opt.label}
                onClick={opt.toggle}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 1, py: 0.75, px: 0.5, cursor: 'pointer',
                  borderRadius: '4px', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' },
                }}
              >
                <Box sx={{
                  width: 14, height: 14, borderRadius: '3px',
                  border: `2px solid ${opt.color}`,
                  bgcolor: opt.active ? opt.color : 'transparent',
                  opacity: opt.active ? 1 : 0.3,
                  transition: 'all 0.15s',
                }} />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: opt.active ? '#fff' : 'rgba(255,255,255,0.3)' }}>
                  {opt.label}
                </Typography>
              </Box>
            ))}
          </Popover>
        </Box>
      </Box>

      {/* Chart */}
      <Box ref={containerRef} sx={{ width: '100%', height: CHART_H }}>
        <svg width={width} height={CHART_H} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)} style={{ cursor: 'crosshair', display: 'block' }}>
          <defs>
            <linearGradient id={`og-${poolId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={UP_COLOR} stopOpacity={0.1} />
              <stop offset="100%" stopColor={UP_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Grid */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line x1={PADDING.left} y1={t.y} x2={PADDING.left + chartW} y2={t.y} stroke="rgba(255,255,255,0.04)" />
              <text x={PADDING.left + chartW + 8} y={t.y + 4} fill="rgba(255,255,255,0.2)" fontSize={10} fontFamily={FONT}>{formatPct(t.p)}</text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={i} x={t.x} y={CHART_H - 6} fill="rgba(255,255,255,0.2)" fontSize={10} textAnchor="middle" fontFamily={FONT}>{t.label}</text>
          ))}

          {/* 50% ref */}
          <line x1={PADDING.left} y1={toY(0.5)} x2={PADDING.left + chartW} y2={toY(0.5)} stroke="rgba(255,255,255,0.06)" strokeDasharray="6,4" />

          {/* Area + lines */}
          {showYes && <path d={yesAreaPath} fill={`url(#og-${poolId})`} />}
          {showNo && <path d={noPath} fill="none" stroke={DOWN_COLOR} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.4} />}
          {showYes && <path d={yesPath} fill="none" stroke={UP_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}

          {/* Hover */}
          {hoverIndex != null && hoverPoint && (
            <>
              <line x1={toX(hoverIndex)} y1={PADDING.top} x2={toX(hoverIndex)} y2={PADDING.top + chartH} stroke="rgba(255,255,255,0.1)" strokeDasharray="3,3" />
              {showYes && <circle cx={toX(hoverIndex)} cy={toY(hoverPoint.p)} r={4} fill={UP_COLOR} stroke="#0D1219" strokeWidth={2} />}
              {showNo && <circle cx={toX(hoverIndex)} cy={toY(1 - hoverPoint.p)} r={3.5} fill={DOWN_COLOR} stroke="#0D1219" strokeWidth={2} opacity={0.7} />}
            </>
          )}

          {/* Live dots + end labels */}
          {lastPoint && hoverIndex == null && (
            <>
              {showYes && (
                <>
                  <circle cx={toX(history.length - 1)} cy={toY(lastPoint.p)} r={4} fill={UP_COLOR}>
                    <animate attributeName="r" values="3;5;3" dur="2s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
                  </circle>
                  <text x={toX(history.length - 1) + 8} y={toY(lastPoint.p) + 4} fill={UP_COLOR} fontSize={11} fontWeight={700} fontFamily={FONT}>
                    {formatPct(lastPoint.p)}
                  </text>
                </>
              )}
              {showNo && (
                <>
                  <circle cx={toX(history.length - 1)} cy={toY(1 - lastPoint.p)} r={3} fill={DOWN_COLOR} opacity={0.5} />
                  <text x={toX(history.length - 1) + 8} y={toY(1 - lastPoint.p) + 4} fill={DOWN_COLOR} fontSize={10} fontWeight={600} fontFamily={FONT} opacity={0.5}>
                    {formatPct(1 - lastPoint.p)}
                  </text>
                </>
              )}
            </>
          )}
        </svg>
      </Box>
    </Box>
  );
}
