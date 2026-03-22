'use client';

import { useState } from 'react';
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
import { usePacificaCandles } from '@/hooks';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';
import { LineChart } from './chart/LineChart';
import { CandlesChart } from './chart/CandlesChart';
import { type ChartType, INTERVALS, formatChartPrice } from './chart/chart-utils';

interface PriceChartDialogProps {
  open: boolean;
  onClose: () => void;
  asset: string;
  livePrice?: string | null;
  strikePrice?: string | null;
}

export function PriceChartDialog({ open, onClose, asset, livePrice: livePriceStr, strikePrice: strikePriceStr }: PriceChartDialogProps) {
  const livePriceNum = livePriceStr ? Number(livePriceStr) : null;
  const strikePriceNum = strikePriceStr ? Number(strikePriceStr) / USDC_DIVISOR : null;
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
      sx={{
        '& .MuiDialog-container': {
          alignItems: { xs: 'stretch', sm: 'center' },
        },
      }}
      PaperProps={{
        sx: {
          bgcolor: '#111820',
          border: 'none',
          borderRadius: 0,
          p: { xs: 0, sm: 1 },
          m: { xs: 0, sm: 4 },
          maxHeight: { xs: '100%', sm: 'calc(100% - 64px)' },
          width: { xs: '100%', sm: undefined },
          maxWidth: { xs: '100%', sm: undefined },
          height: { xs: '100%', sm: 'auto' },
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          py: 1.5,
          px: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: { xs: 1, sm: 2 }, flexWrap: 'wrap' }}>
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

      <Box sx={{ px: { xs: 1, sm: 3 }, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
        {/* Time interval selector */}
        <Box sx={{ overflow: 'auto', flexShrink: 1, minWidth: 0 }}>
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
                px: { xs: 1, sm: 1.5 },
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
        </Box>

        {/* Chart type toggle */}
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={(_, val) => { if (val !== null) setChartType(val); }}
          size="small"
          sx={{
            flexShrink: 0,
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

      <DialogContent sx={{ p: 0, height: { xs: '100%', sm: 380 }, flex: { xs: 1, sm: 'unset' }, position: 'relative' }}>
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
      </DialogContent>

      <Box sx={{ px: { xs: 2, sm: 3 }, py: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
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
