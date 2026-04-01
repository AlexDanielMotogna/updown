'use client';

import { useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

export function Countdown({ target, label, critical }: { target: string; label: string; critical?: boolean }) {
  const t = useThemeTokens();
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Resolving...'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [target]);

  const diff = new Date(target).getTime() - Date.now();
  const isCritical = critical !== false && diff > 0 && diff < 60000;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.5rem', fontWeight: 600, color: t.text.muted, textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.65rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: diff <= 0 ? t.accent : isCritical ? t.down : t.text.secondary,
          ...(isCritical && { animation: 'criticalBlink 1s infinite', '@keyframes criticalBlink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }),
        }}
      >
        {remaining}
      </Typography>
    </Box>
  );
}
