'use client';

import { Box, Typography } from '@mui/material';
import { ACCENT_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';

interface UpCoinsBalanceProps {
  balance: string;
}

export function UpCoinsBalance({ balance }: UpCoinsBalanceProps) {
  const num = Number(balance) / UP_COINS_DIVISOR;
  const formatted =
    num >= 1_000_000 ? `${(num / 1_000_000).toFixed(1)}M`
    : num >= 1_000 ? `${(num / 1_000).toFixed(1)}K`
    : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        bgcolor: 'rgba(255,255,255,0.04)',
        borderRadius: '4px',
        px: 1.5,
        height: 36,
      }}
    >
      <Box
        sx={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          bgcolor: `${ACCENT_COLOR}30`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Typography sx={{ fontSize: '0.55rem', fontWeight: 800, color: ACCENT_COLOR, lineHeight: 1 }}>
          UP
        </Typography>
      </Box>
      <Typography
        sx={{
          fontSize: '0.85rem',
          fontWeight: 600,
          color: '#fff',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatted}
      </Typography>
    </Box>
  );
}
