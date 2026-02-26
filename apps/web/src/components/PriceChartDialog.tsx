'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  CircularProgress,
} from '@mui/material';
import { Close, ShowChart, CandlestickChart } from '@mui/icons-material';
import { usePacificaCandles, type Candle } from '@/hooks';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

type ChartType = 'line' | 'candles';

interface PriceChartDialogProps {
  open: boolean;
  onClose: () => void;
  asset: string;
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
  if (price >= 10000) return price.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (price >= 100) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
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

// --- Shared hook for chart dimensions & hover ---

function useChartLayout(candles: Candle[], chartType: ChartType) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 340 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (parsed.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const idx = Math.round((x / chartW) * (parsed.length - 1));
      if (idx >= 0 && idx < parsed.length) setHoverIndex(idx);
    },
    [parsed.length, chartW],
  );

  return { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, setHoverIndex, handleMouseMove };
}

// --- Shared axes & grid ---

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

// --- Line chart ---

interface ChartProps {
  candles: Candle[];
  duration: number;
}

function LineChart({ candles, duration }: ChartProps) {
  const layout = useChartLayout(candles, 'line');
  const { containerRef, dims, parsed, chartH, toX, toY, yTicks, xTicks, hoverIndex, setHoverIndex, handleMouseMove } = layout;

  const closes = useMemo(() => parsed.map((p) => p.c), [parsed]);
  const times = useMemo(() => parsed.map((p) => p.t), [parsed]);

  const linePath = useMemo(() => {
    if (closes.length === 0) return '';
    return closes.map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(p).toFixed(1)}`).join(' ');
  }, [closes, toX, toY]);

  const areaPath = useMemo(() => {
    if (closes.length === 0) return '';
    const bottom = PADDING.top + chartH;
    return `${linePath} L${toX(closes.length - 1).toFixed(1)},${bottom} L${toX(0).toFixed(1)},${bottom} Z`;
  }, [linePath, closes.length, toX, chartH]);

  const isUp = closes.length > 1 ? closes[closes.length - 1] >= closes[0] : true;
  const lineColor = isUp ? UP_COLOR : DOWN_COLOR;

  const hoverData = hoverIndex !== null && hoverIndex < closes.length
    ? { price: closes[hoverIndex], time: times[hoverIndex], x: toX(hoverIndex), y: toY(closes[hoverIndex]) }
    : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="line-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.2} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>

        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

        {areaPath && <path d={areaPath} fill="url(#line-area-grad)" />}
        {linePath && <path d={linePath} fill="none" stroke={lineColor} strokeWidth={1.5} />}

        {hoverData && (
          <>
            <line x1={hoverData.x} x2={hoverData.x} y1={PADDING.top} y2={PADDING.top + chartH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
            <circle cx={hoverData.x} cy={hoverData.y} r={4} fill={lineColor} stroke="#141414" strokeWidth={2} />
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

// --- Candlestick chart ---

function CandlesChart({ candles, duration }: ChartProps) {
  const layout = useChartLayout(candles, 'candles');
  const { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, setHoverIndex, handleMouseMove } = layout;

  const candleWidth = useMemo(() => {
    if (parsed.length <= 1) return 6;
    return Math.max(1, Math.min(12, (chartW / parsed.length) * 0.7));
  }, [parsed.length, chartW]);

  const hoverCandle = hoverIndex !== null && hoverIndex < parsed.length ? parsed[hoverIndex] : null;

  return (
    <Box ref={containerRef} sx={{ width: '100%', height: '100%', position: 'relative' }}>
      <svg width={dims.width} height={dims.height} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverIndex(null)} style={{ display: 'block' }}>
        <ChartAxes dims={dims} yTicks={yTicks} xTicks={xTicks} duration={duration} />

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
            <g key={i}>
              {/* Wick */}
              <line x1={x} x2={x} y1={wickTop} y2={wickBottom} stroke={color} strokeWidth={1} />
              {/* Body */}
              <rect
                x={x - half}
                y={bodyTop}
                width={candleWidth}
                height={bodyHeight}
                fill={isUp ? color : color}
                fillOpacity={isUp ? 0.25 : 0.8}
                stroke={color}
                strokeWidth={1}
              />
            </g>
          );
        })}

        {/* Hover crosshair */}
        {hoverCandle && hoverIndex !== null && (
          <>
            <line x1={toX(hoverIndex)} x2={toX(hoverIndex)} y1={PADDING.top} y2={PADDING.top + chartH} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3,3" />
            <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={toY(hoverCandle.c)} y2={toY(hoverCandle.c)} stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="3,3" />
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

// --- Dialog ---

export function PriceChartDialog({ open, onClose, asset }: PriceChartDialogProps) {
  const [intervalIdx, setIntervalIdx] = useState(3); // default 15m
  const [chartType, setChartType] = useState<ChartType>('line');

  const interval = INTERVALS[intervalIdx];

  const { candles, loading, error } = usePacificaCandles({
    symbol: asset,
    interval: interval.value,
    durationMs: interval.duration,
    enabled: open,
  });

  const lastPrice = candles.length > 0 ? parseFloat(candles[candles.length - 1].c) : null;
  const firstPrice = candles.length > 0 ? parseFloat(candles[0].c) : null;
  const pctChange = lastPrice && firstPrice ? ((lastPrice - firstPrice) / firstPrice) * 100 : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      PaperProps={{
        sx: {
          bgcolor: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: 1,
          p: 1,
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.5,
          px: 3,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
          <Typography variant="h6" sx={{ fontWeight: 500 }}>{asset}/USD</Typography>
          {lastPrice && (
            <Typography variant="body1" sx={{ fontWeight: 400, fontVariantNumeric: 'tabular-nums' }}>
              ${formatChartPrice(lastPrice)}
            </Typography>
          )}
          {pctChange !== null && (
            <Typography
              variant="body2"
              sx={{
                color: pctChange >= 0 ? UP_COLOR : DOWN_COLOR,
                fontWeight: 500,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {pctChange >= 0 ? '+' : ''}{pctChange.toFixed(2)}%
            </Typography>
          )}
        </Box>
        <IconButton onClick={onClose} size="small" aria-label="Close chart" sx={{ color: 'text.secondary' }}>
          <Close fontSize="small" />
        </IconButton>
      </DialogTitle>

      <Box sx={{ px: 3, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {/* Time interval selector */}
        <ToggleButtonGroup
          value={intervalIdx}
          exclusive
          onChange={(_, val) => { if (val !== null) setIntervalIdx(val); }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: 'text.secondary',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              textTransform: 'none',
              fontSize: '0.75rem',
              px: 1.5,
              py: 0.25,
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

        {/* Chart type toggle */}
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, val) => { if (val !== null) setChartType(val); }}
          size="small"
          sx={{
            '& .MuiToggleButton-root': {
              color: 'text.secondary',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              px: 1,
              py: 0.25,
              '&.Mui-selected': {
                color: '#FFFFFF',
                bgcolor: 'rgba(255, 255, 255, 0.08)',
              },
            },
          }}
        >
          <ToggleButton value="line" aria-label="Line chart">
            <ShowChart sx={{ fontSize: 18 }} />
          </ToggleButton>
          <ToggleButton value="candles" aria-label="Candlestick chart">
            <CandlestickChart sx={{ fontSize: 18 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <DialogContent sx={{ p: 0, height: 380, position: 'relative' }}>
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
            ? <LineChart candles={candles} duration={interval.duration} />
            : <CandlesChart candles={candles} duration={interval.duration} />
        )}
        {!loading && !error && candles.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>No data available</Typography>
          </Box>
        )}
      </DialogContent>

      <Box sx={{ px: 3, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
        <Box
          sx={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            bgcolor: UP_COLOR,
            flexShrink: 0,
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': { opacity: 1 },
              '50%': { opacity: 0.4 },
              '100%': { opacity: 1 },
            },
          }}
        />
        <Box
          component="img"
          src="/Pacifica-logos/White_Text_White.png"
          alt="Pacifica"
          sx={{ height: 14, opacity: 0.25 }}
        />
      </Box>
    </Dialog>
  );
}
