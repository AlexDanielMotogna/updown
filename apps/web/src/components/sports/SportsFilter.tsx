'use client';

import { Box, Typography } from '@mui/material';
import { ShowChart, SportsSoccer } from '@mui/icons-material';
import { UP_COLOR, DRAW_COLOR } from '@/lib/constants';

interface Props {
  value: 'ALL' | 'CRYPTO' | 'SPORTS';
  onChange: (value: 'ALL' | 'CRYPTO' | 'SPORTS') => void;
}

const TABS = [
  { key: 'ALL' as const, label: 'All' },
  { key: 'CRYPTO' as const, label: 'Crypto', icon: <ShowChart sx={{ fontSize: 14 }} /> },
  { key: 'SPORTS' as const, label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 14 }} /> },
] as const;

export function SportsFilter({ value, onChange }: Props) {
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {TABS.map((tab) => {
        const active = value === tab.key;
        const color = tab.key === 'SPORTS' ? DRAW_COLOR : tab.key === 'CRYPTO' ? UP_COLOR : '#fff';
        return (
          <Box
            key={tab.key}
            onClick={() => onChange(tab.key)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 1.5,
              py: 0.5,
              cursor: 'pointer',
              bgcolor: active ? `${color}15` : 'transparent',
              border: active ? `1px solid ${color}25` : '1px solid transparent',
              color: active ? color : 'rgba(255,255,255,0.4)',
              transition: 'all 0.15s ease',
              '&:hover': { color, bgcolor: `${color}08` },
            }}
          >
            {'icon' in tab && tab.icon}
            <Typography sx={{ fontSize: '0.75rem', fontWeight: active ? 700 : 500 }}>
              {tab.label}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
