'use client';

/**
 * Pool detail-page chart wrapper. Fetches the candle stream from Pacifica
 * and lets the user flip between the real-time snake line view and the
 * classic OHLC candlestick view. All actual rendering lives in:
 *
 *   components/pool/chart/SnakeLineChart.tsx   — Polymarket / Kalshi-style
 *   components/pool/chart/CandlesChart.tsx     — OHLC candles
 *
 * The snake locks to 1-minute candles + a 3-min visible window (see
 * SNAKE_WINDOW_MS) because larger intervals make per-frame motion
 * invisible. The user can't tune that here — Polymarket / Kalshi likewise
 * hide the interval choice on their real-time line views.
 */

import { useState } from 'react';
import { Box, Typography, ToggleButtonGroup, ToggleButton, CircularProgress } from '@mui/material';
import { ShowChart, CandlestickChart as CandlestickIcon } from '@mui/icons-material';
import { usePacificaCandles } from '@/hooks';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { CHART_INTERVALS } from './chart/constants';
import { SnakeLineChart } from './chart/SnakeLineChart';
import { CandlesChart } from './chart/CandlesChart';

type ChartType = 'line' | 'candles';

interface InlineChartProps {
  asset: string;
  livePrice?: string | null;
  strikePrice?: string | null;
}

export function InlineChart({ asset, livePrice: livePriceStr, strikePrice: strikePriceStr }: InlineChartProps) {
  const t = useThemeTokens();
  const livePriceNum = livePriceStr ? Number(livePriceStr) : null;
  const strikePriceNum = strikePriceStr ? Number(strikePriceStr) / USDC_DIVISOR : null;
  const [chartType, setChartType] = useState<ChartType>('line');
  const interval = CHART_INTERVALS[0]; // locked to 1m (see file header)

  const { candles, loading, error } = usePacificaCandles({
    symbol: asset,
    interval: interval.value,
    durationMs: interval.duration,
    enabled: true,
  });

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        height: { xs: 280, md: 460 },
        bgcolor: t.bg.app,
        borderRadius: { xs: 0, md: 2 },
        overflow: 'hidden',
      }}
    >
      {/* Controls — line / candles toggle (no interval picker on the snake). */}
      <Box sx={{ px: { xs: 1, md: 2 }, pb: 0.5, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
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
                color: t.text.primary,
                bgcolor: t.hover.strong,
              },
            },
          }}
        >
          <ToggleButton value="line" aria-label="Line chart">
            <ShowChart sx={{ fontSize: 16 }} />
          </ToggleButton>
          <ToggleButton value="candles" aria-label="Candlestick chart">
            <CandlestickIcon sx={{ fontSize: 16 }} />
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Chart area */}
      <Box sx={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <CircularProgress size={28} sx={{ color: t.text.dimmed }} />
          </Box>
        )}
        {error && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography variant="body2" sx={{ color: t.down }}>{error}</Typography>
          </Box>
        )}
        {!loading && !error && candles.length > 0 && (
          chartType === 'line'
            ? <SnakeLineChart candles={candles} asset={asset} duration={interval.duration} livePrice={livePriceNum} strikePrice={strikePriceNum} />
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
