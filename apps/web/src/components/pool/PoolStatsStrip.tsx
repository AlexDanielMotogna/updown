'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { formatUSDC } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';

interface PoolStatsStripProps {
  betCount: number;
  totalPool: string;
  upOdds: string;
  downOdds: string;
}

const STRIP_TOOLTIPS: Record<string, string> = {
  'PLAYERS': 'Total participants in this pool',
  'POOL': 'Total USDC staked across both sides',
  'UP ODDS': 'Payout multiplier if UP wins. Changes as new bets come in',
  'DOWN ODDS': 'Payout multiplier if DOWN wins. Changes as new bets come in',
};

export function PoolStatsStrip({ betCount, totalPool, upOdds, downOdds }: PoolStatsStripProps) {
  const t = useThemeTokens();

  const stats = [
    { icon: '/assets/players-icon-500.png', value: betCount, label: 'PLAYERS', color: t.text.primary },
    { icon: '/assets/pool-icon-500.png', value: formatUSDC(totalPool), label: 'POOL', color: t.gain },
    { icon: '/assets/up-icon-64x64.png', value: `${Number.isFinite(Number(upOdds)) ? Number(upOdds).toFixed(2) : upOdds}x`, label: 'UP ODDS', color: t.up },
    { icon: '/assets/down-icon-64x64.png', value: `${Number.isFinite(Number(downOdds)) ? Number(downOdds).toFixed(2) : downOdds}x`, label: 'DOWN ODDS', color: t.down },
  ];

  return (
    <Box sx={{ bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        {stats.map((s, i) => (
          <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderLeft: i > 0 ? `1px solid ${t.border.default}` : 'none', pl: i > 0 ? { xs: 1.5, md: 2.5 } : 0 }}>
            <Box component="img" src={s.icon} alt="" sx={{ width: { xs: 14, md: 20 }, height: { xs: 14, md: 20 } }} />
            <Box>
              <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.6rem' }, fontWeight: 600, color: t.text.dimmed, lineHeight: 1 }}>{s.label}</Typography>
                <Tooltip title={STRIP_TOOLTIPS[s.label]} arrow placement="bottom" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                  <InfoOutlined sx={{ fontSize: 9, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
