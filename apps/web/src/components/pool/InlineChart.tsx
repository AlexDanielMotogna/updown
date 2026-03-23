'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from '@mui/material';
import { ShowChart, CandlestickChart } from '@mui/icons-material';
import { usePacificaCandles, type Candle } from '@/hooks';
import { UP_COLOR, DOWN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';

type ChartType = 'line' | 'candles';

interface InlineChartProps {
  asset: string;
  livePrice?: string | null;
  strikePrice?: string | null;
}

const INTERVALS = [
  { label: '1m', value: '1m', duration: 60 * 60 * 1000 },
  { label: '3m', value: '3m', duration: 3 * 60 * 60 * 1000 },
  { label: '5m', value: '5m', duration: 5 * 60 * 60 * 1000 },
  { label: '15m', value: '15m', duration: 12 * 60 * 60 * 1000 },
  { label: '30m', value: '30m', duration: 24 * 60 * 60 * 1000 },
  { label: '1H', value: '1h', duration: 2 * 24 * 60 * 60 * 1000 },
  { label: '4H', value: '4h', duration: 7 * 24 * 60 * 60 * 1000 },
  { label: '1D', value: '1d', duration: 30 * 24 * 60 * 60 * 1000 },
] as const;

function formatChartPrice(price: number): string {
  if (price >= 10000) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (price >= 100) return price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

function formatTime(ts: number, duration: number): string {
  const d = new Date(ts);
  if (duration <= 24 * 60 * 60 * 1000) {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const PADDING = { top: 20, right: 70, bottom: 30, left: 16 };

function useChartLayout(candles: Candle[], chartType: ChartType) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 340 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(
    () =>
      candles.map((c) => ({
        o: parseFloat(c.o),
        h: parseFloat(c.h),
        l: parseFloat(c.l),
        c: parseFloat(c.c),
        t: c.t,
      })),
    [candles],
  );

  const { maxPrice, priceRange } = useMemo(() => {
    if (parsed.length === 0) return { maxPrice: 0, priceRange: 1 };
    let min: number, max: number;
    if (chartType === 'candles') {
      min = Math.min(...parsed.map((p) => p.l));
      max = Math.max(...parsed.map((p) => p.h));
    } else {
      min = Math.min(...parsed.map((p) => p.c));
      max = Math.max(...parsed.map((p) => p.c));
    }
    const pad = (max - min) * 0.08 || max * 0.01;
    return { maxPrice: max + pad, priceRange: max - min + pad * 2 };
  }, [parsed, chartType]);

  const chartW = dims.width - PADDING.left - PADDING.right;
  const chartH = dims.height - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (i: number) => PADDING.left + (i / Math.max(parsed.length - 1, 1)) * chartW,
    [parsed.length, chartW],
  );
  const toY = useCallback(
    (price: number) => PADDING.top + ((maxPrice - price) / priceRange) * chartH,
    [maxPrice, priceRange, chartH],
  );

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i < 5; i++) {
      const price = maxPrice - (i / 4) * priceRange;
      ticks.push({ price, y: toY(price) });
    }
    return ticks;
  }, [maxPrice, priceRange, toY]);

  const xTicks = useMemo(() => {
    if (parsed.length === 0) return [];
    const count = Math.min(5, parsed.length);
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (parsed.length - 1));
      ticks.push({ time: parsed[idx].t, x: toX(idx) });
    }
    return ticks;
  }, [parsed, toX]);

  const hoverPrice = useMemo(() => {
    if (hoverY === null) return null;
    return maxPrice - ((hoverY - PADDING.top) / chartH) * priceRange;
  }, [hoverY, maxPrice, priceRange, chartH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (parsed.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const y = e.clientY - rect.top;
      const idx = Math.round((x / chartW) * (parsed.length - 1));
      if (idx >= 0 && idx < parsed.length) setHoverIndex(idx);
      if (y >= PADDING.top && y <= PADDING.top + chartH) setHoverY(y);
    },
    [parsed.length, chartW, chartH],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    setHoverY(null);
  }, []);

  return { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, setHoverIndex, handleMouseMove, handleMouseLeave };
}

interface AxesProps {
  dims: { width: number; height: number };
  yTicks: { price: number; y: number }[];
  xTicks: { time: number; x: number }[];
  duration: number;
}

function ChartAxes({ dims, yTicks, xTicks, duration }: AxesProps) {
  return (
    <>
      {yTicks.map((tick, i) => (
        <g key={`y-${i}`}>
          <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={tick.y} y2={tick.y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
          <text x={dims.width - PADDING.right + 8} y={tick.y + 4} fill="rgba(255,255,255,0.4)" fontSize={11} fontFamily="var(--font-satoshi), Satoshi, sans-serif">
            {formatChartPrice(tick.price)}
          </text>
        </g>
      ))}
      {xTicks.map((tick, i) => (
        <text key={`x-${i}`} x={tick.x} y={dims.height - 6} fill="rgba(255,255,255,0.4)" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" textAnchor="middle">
          {formatTime(tick.time, duration)}
        </text>
      ))}
    </>
  );
}

interface ChartProps {
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

function LineChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
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
  const lineColor = isUp ? UP_COLOR : DOWN_COLOR;

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  const hoverData = hoverIndex !== null && hoverIndex < closes.length
    ? { price: closes[hoverIndex], time: times[hoverIndex], x: toX(hoverIndex), y: toY(closes[hoverIndex]) }
    : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block', willChange: 'contents' }}>
        <defs>
          <linearGradient id="inline-line-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy >= PADDING.top && sy <= PADDING.top + chartH) {
            return (
              <g style={{ transition: 'transform 0.4s ease' }}>
                <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={sy} y2={sy} stroke={ACCENT_COLOR} strokeWidth={1} strokeDasharray="6,4" strokeOpacity={0.5} />
                <rect x={0} y={sy - 11} width={PADDING.left + 72} height={22} rx={3} fill={ACCENT_COLOR} />
                <text x={6} y={sy + 4} fill="#000" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
                  Strike {formatChartPrice(strikePrice)}
                </text>
              </g>
            );
          }
          return null;
        })()}

        {areaPath && <path d={areaPath} fill="url(#inline-line-area-grad)" style={{ transition: 'd 0.5s ease, opacity 0.3s' }} />}
        {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'd 0.5s ease' }} />}

        {livePrice != null && lastPoint && (() => {
          const ly = toY(livePrice);
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                <line x1={lastPoint.x} x2={dims.width - PADDING.right} y1={ly} y2={ly} stroke={lineColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
                <circle cx={lastPoint.x} cy={lastPoint.y} r={3.5} fill={lineColor} stroke="#111820" strokeWidth={2} style={{ transition: 'cx 0.5s ease, cy 0.5s ease' }}>
                  <animate attributeName="r" values="3.5;5;3.5" dur="2s" repeatCount="indefinite" />
                </circle>
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lineColor} style={{ transition: 'y 0.4s ease' }} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill="#000" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700} style={{ transition: 'y 0.4s ease' }}>
                  {formatChartPrice(livePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {hoverData && (
          <>
            <line x1={hoverData.x} x2={hoverData.x} y1={PADDING.top} y2={PADDING.top + chartH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hoverData.x} cy={hoverData.y} r={4} fill={lineColor} stroke="#111820" strokeWidth={2} />
          </>
        )}

        {hoverY !== null && hoverPrice !== null && (
          <>
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={hoverY} y2={hoverY} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - PADDING.right + 1} y={hoverY - 10} width={PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - PADDING.right + 8} y={hoverY + 4} fill="#FFFFFF" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={500}>
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

function CandlesChart({ candles, duration, livePrice, strikePrice }: ChartProps) {
  const layout = useChartLayout(candles, 'candles');
  const { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, handleMouseMove, handleMouseLeave } = layout;

  const candleWidth = useMemo(() => {
    if (parsed.length <= 1) return 6;
    return Math.max(1, Math.min(12, (chartW / parsed.length) * 0.7));
  }, [parsed.length, chartW]);

  const hoverCandle = hoverIndex !== null && hoverIndex < parsed.length ? parsed[hoverIndex] : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} style={{ display: 'block', willChange: 'contents' }}>
        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {strikePrice != null && (() => {
          const sy = toY(strikePrice);
          if (sy >= PADDING.top && sy <= PADDING.top + chartH) {
            return (
              <g style={{ transition: 'transform 0.4s ease' }}>
                <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={sy} y2={sy} stroke={ACCENT_COLOR} strokeWidth={1} strokeDasharray="6,4" strokeOpacity={0.5} />
                <rect x={0} y={sy - 11} width={PADDING.left + 72} height={22} rx={3} fill={ACCENT_COLOR} />
                <text x={6} y={sy + 4} fill="#000" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700}>
                  Strike {formatChartPrice(strikePrice)}
                </text>
              </g>
            );
          }
          return null;
        })()}

        {parsed.map((c, i) => {
          const x = toX(i);
          const isUp = c.c >= c.o;
          const color = isUp ? UP_COLOR : DOWN_COLOR;
          const bodyTop = toY(Math.max(c.o, c.c));
          const bodyBottom = toY(Math.min(c.o, c.c));
          const bodyHeight = Math.max(1, bodyBottom - bodyTop);
          const wickTop = toY(c.h);
          const wickBottom = toY(c.l);
          const half = candleWidth / 2;

          return (
            <g key={i} style={{ transition: 'opacity 0.3s' }}>
              <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
              <rect x={x - half} y={bodyTop} width={candleWidth} height={bodyHeight} fill={color} fillOpacity={isUp ? 0.25 : 0.8} stroke={color} strokeWidth={1} style={{ transition: 'y 0.4s ease, height 0.4s ease' }} />
            </g>
          );
        })}

        {livePrice != null && (() => {
          const ly = toY(livePrice);
          const lastX = parsed.length > 0 ? toX(parsed.length - 1) : PADDING.left;
          const lvColor = parsed.length > 1 ? (parsed[parsed.length - 1].c >= parsed[0].c ? UP_COLOR : DOWN_COLOR) : UP_COLOR;
          if (ly >= PADDING.top && ly <= PADDING.top + chartH) {
            return (
              <>
                <line x1={lastX} x2={dims.width - PADDING.right} y1={ly} y2={ly} stroke={lvColor} strokeWidth={1} strokeDasharray="3,3" strokeOpacity={0.6} style={{ transition: 'y1 0.4s ease, y2 0.4s ease' }} />
                <rect x={dims.width - PADDING.right + 1} y={ly - 10} width={PADDING.right - 4} height={20} rx={3} fill={lvColor} style={{ transition: 'y 0.4s ease' }} />
                <text x={dims.width - PADDING.right + 8} y={ly + 4} fill="#000" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={700} style={{ transition: 'y 0.4s ease' }}>
                  {formatChartPrice(livePrice)}
                </text>
              </>
            );
          }
          return null;
        })()}

        {hoverCandle && hoverIndex !== null && (
          <line x1={toX(hoverIndex)} x2={toX(hoverIndex)} y1={PADDING.top} y2={PADDING.top + chartH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
        )}

        {hoverY !== null && hoverPrice !== null && (
          <>
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={hoverY} y2={hoverY} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3,3" />
            <rect x={dims.width - PADDING.right + 1} y={hoverY - 10} width={PADDING.right - 4} height={20} rx={3} fill="rgba(255,255,255,0.12)" />
            <text x={dims.width - PADDING.right + 8} y={hoverY + 4} fill="#FFFFFF" fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" fontWeight={500}>
              {formatChartPrice(hoverPrice)}
            </text>
          </>
        )}
      </svg>

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
          <Typography variant="caption" sx={{ fontWeight: 600, color: hoverCandle.c >= hoverCandle.o ? UP_COLOR : DOWN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {formatChartPrice(hoverCandle.c)}
          </Typography>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.3)', ml: 0.5 }}>
            {new Date(hoverCandle.t).toLocaleString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
}

export function InlineChart({ asset, livePrice: livePriceStr, strikePrice: strikePriceStr }: InlineChartProps) {
  const livePriceNum = livePriceStr ? Number(livePriceStr) : null;
  const strikePriceNum = strikePriceStr ? Number(strikePriceStr) / USDC_DIVISOR : null;
  const [intervalIdx, setIntervalIdx] = useState(0); // default 1m
  const [chartType, setChartType] = useState<ChartType>('line');

  const interval = INTERVALS[intervalIdx];

  const { candles, loading, error } = usePacificaCandles({
    symbol: asset,
    interval: interval.value,
    durationMs: interval.duration,
    enabled: true,
  });

  const lastPrice = candles.length > 0 ? parseFloat(candles[candles.length - 1].c) : null;
  const firstPrice = candles.length > 0 ? parseFloat(candles[0].c) : null;
  const pctChange = lastPrice && firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 280, md: 460 },
        bgcolor: '#0B0F14',
        borderRadius: { xs: 0, md: 2 },
        overflow: 'hidden',
      }}
    >
      {/* Controls: interval pills + chart type toggle */}
      <Box sx={{ px: { xs: 1, md: 2 }, pb: 0.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        <Box sx={{ overflow: 'auto', flexShrink: 1, minWidth: 0 }}>
          <ToggleButtonGroup
            value={intervalIdx}
            exclusive
            onChange={(_, val) => { if (val !== null) setIntervalIdx(val); }}
            size="small"
            sx={{
              '& .MuiToggleButton-root': {
                color: 'text.secondary',
                border: 'none',
                borderRadius: '3px !important',
                textTransform: 'none',
                fontSize: '0.7rem',
                px: { xs: 0.75, md: 1.25 },
                py: 0.15,
                '&.Mui-selected': {
                  color: '#FFFFFF',
                  bgcolor: 'rgba(255, 255, 255, 0.08)',
                },
              },
            }}
          >
            {INTERVALS.map((iv, i) => (
              <ToggleButton key={iv.label} value={i}>{iv.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>

        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, val) => { if (val !== null) setChartType(val); }}
          size="small"
          sx={{
            flexShrink: 0,
            '& .MuiToggleButton-root': {
              color: 'text.secondary',
              border: 'none',
              borderRadius: '3px !important',
              px: 0.75,
              py: 0.15,
              '&.Mui-selected': {
                color: '#FFFFFF',
                bgcolor: 'rgba(255, 255, 255, 0.08)',
              },
            },
          }}
        >
          <ToggleButton value="line" aria-label="Line chart">
            <ShowChart sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="candles" aria-label="Candlestick chart">
            <CandlestickChart sx={{ fontSize: 16 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Chart area */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={28} sx={{ color: 'rgba(255,255,255,0.3)' }} />
          </Box>
        )}
        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: DOWN_COLOR }}>{error}</Typography>
          </Box>
        )}
        {!loading && !error && candles.length > 0 && (
          chartType === 'line'
            ? <LineChart candles={candles} duration={interval.duration} livePrice={livePriceNum} strikePrice={strikePriceNum} />
            : <CandlesChart candles={candles} duration={interval.duration} livePrice={livePriceNum} strikePrice={strikePriceNum} />
        )}
        {!loading && !error && candles.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No data available</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
