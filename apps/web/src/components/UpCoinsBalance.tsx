'use client';

import { Box, Typography } from '@mui/material';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';

interface UpCoinsBalanceProps {
  balance: string;
}

export function UpCoinsBalance({ balance }: UpCoinsBalanceProps) {
  const t = useThemeTokens();
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
        bgcolor: t.border.subtle,
        borderRadius: '4px',
        px: 1.5,
        height: 36,
      }}
    >
      <Box
        component="img"
        src="/token/Token_16px_Gold.png"
        alt="UP Coin"
        sx={{ width: 16, height: 16 }}
      />
      <Typography
        sx={{
          fontSize: '0.85rem',
          fontWeight: 600,
          color: t.text.primary,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {formatted}
      </Typography>
    </Box>
  );
}
