'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { AccessTime } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

/** Live mm:ss countdown to when the pool round ends (bets close). */
export function PoolCountdown({ endTime, big = false }: { endTime: string; big?: boolean }) {
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
  const label = closed ? 'Locked' : `${mm.toString().padStart(2, '0')}:${ss.toString().padStart(2, '0')}`;

  if (big) {
    return (
      <Typography sx={{ fontWeight: 600, fontSize: { xs: '1.5rem', md: '1.8rem' }, lineHeight: 1, letterSpacing: '0.01em', color: closed ? t.text.tertiary : CYAN, fontVariantNumeric: 'tabular-nums' }}>
        {label}
      </Typography>
    );
  }

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, color: closed ? t.text.tertiary : ms < 30_000 ? t.error : t.text.secondary }}>
      <AccessTime sx={{ fontSize: 15 }} />
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{label}</Typography>
    </Box>
  );
}
