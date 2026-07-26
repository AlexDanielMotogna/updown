'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

/** Live mm:ss countdown to when the pool ends (bets close). Turns red in the last 30s. */
export function PoolCountdown({ endTime }: { endTime: string }) {
  const t = useThemeTokens();
  const target = new Date(endTime).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const ms = Math.max(0, target - now);
  const s = Math.floor(ms / 1000);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  const closed = ms <= 0;
  const color = closed ? t.text.tertiary : ms < 30_000 ? t.error : t.text.secondary;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color }}>
      <AccessTime sx={{ fontSize: 15 }} />
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
        {closed ? 'Locked' : `${mm}:${ss.toString().padStart(2, '0')}`}
      </Typography>
    </Box>
  );
}
