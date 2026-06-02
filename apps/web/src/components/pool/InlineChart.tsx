'use client';

/**
 * Pool detail-page chart wrapper. Fetches the candle stream from Pacifica
 * and lets the user flip between the line (Robinhood-style area) and the
 * candlestick (Binance-style OHLC) view. Rendering is delegated to a
 * single TradingView Lightweight Charts component that handles both modes
 * — see components/pool/chart/PriceChart.tsx.
 *
 * The toggle, loader, and error pane stay here so the live-price + strike
 * props can flow through without coupling the chart implementation to the
 * data-fetching hook.
 */

import { useState } from 'react';
import { Box, Typography, ToggleButtonGroup, ToggleButton, CircularProgress } from '@mui/material';
import { ShowChart, CandlestickChart as CandlestickIcon } from '@mui/icons-material';
import { usePacificaCandles } from '@/hooks';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { CHART_INTERVALS } from './chart/constants';
import { PriceChart, type PriceChartMode } from './chart/PriceChart';

type ChartType = PriceChartMode;

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
      {/* Controls - line / candles toggle (no interval picker on the snake). */}
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
          <PriceChart
            candles={candles}
            mode={chartType}
            livePrice={livePriceNum}
            strikePrice={strikePriceNum}
          />
        )}
        {!loading && !error && candles.length === 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>No data available</Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}
