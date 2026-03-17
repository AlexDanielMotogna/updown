'use client';

import { Box, Typography } from '@mui/material';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR } from '@/lib/constants';

interface PoolStatsStripProps {
  betCount: number;
  totalPool: string;
  upOdds: string;
  downOdds: string;
}

export function PoolStatsStrip({ betCount, totalPool, upOdds, downOdds }: PoolStatsStripProps) {
  const stats = [
    { icon: '/assets/players-icon-500.png', value: betCount, label: 'PLAYERS', color: '#fff' },
    { icon: '/assets/pool-icon-500.png', value: formatUSDC(totalPool), label: 'POOL', color: GAIN_COLOR },
    { icon: '/assets/up-icon-64x64.png', value: `${Number.isFinite(Number(upOdds)) ? Number(upOdds).toFixed(2) : upOdds}x`, label: 'UP ODDS', color: UP_COLOR },
    { icon: '/assets/down-icon-64x64.png', value: `${Number.isFinite(Number(downOdds)) ? Number(downOdds).toFixed(2) : downOdds}x`, label: 'DOWN ODDS', color: DOWN_COLOR },
  ];

  return (
    <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        {stats.map((s, i) => (
          <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', pl: i > 0 ? { xs: 1.5, md: 2.5 } : 0 }}>
            <Box component="img" src={s.icon} alt="" sx={{ width: { xs: 14, md: 20 }, height: { xs: 14, md: 20 } }} />
            <Box>
              <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</Typography>
              <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.6rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{s.label}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
