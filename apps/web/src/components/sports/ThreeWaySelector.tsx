'use client';

import { Box, Typography } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';
import { formatUSDC } from '@/lib/format';

interface Props {
  side: 'UP' | 'DOWN' | 'DRAW' | null;
  onSideChange: (side: 'UP' | 'DOWN' | 'DRAW') => void;
  totalUp: number;
  totalDown: number;
  totalDraw: number;
  homeTeam?: string;
  awayTeam?: string;
  disabled?: boolean;
}

export function ThreeWaySelector({ side, onSideChange, totalUp, totalDown, totalDraw, homeTeam, awayTeam, disabled }: Props) {
  const total = totalUp + totalDown + totalDraw;
  const sides = [
    { key: 'UP' as const, label: homeTeam || 'Home', total: totalUp, color: UP_COLOR },
    { key: 'DRAW' as const, label: 'Draw', total: totalDraw, color: DRAW_COLOR },
    { key: 'DOWN' as const, label: awayTeam || 'Away', total: totalDown, color: DOWN_COLOR },
  ];

  return (
    <Box sx={{ display: 'flex', gap: '3px' }}>
      {sides.map((s) => {
        const active = side === s.key;
        const pct = total > 0 ? Math.round((s.total / total) * 100) : 33;
        return (
          <Box
            key={s.key}
            onClick={() => !disabled && onSideChange(s.key)}
            sx={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 0.5,
              py: 1.5,
              cursor: disabled ? 'default' : 'pointer',
              bgcolor: active ? `${s.color}18` : '#0D1219',
              border: active ? `1px solid ${s.color}40` : '1px solid rgba(255,255,255,0.04)',
              transition: 'all 0.15s ease',
              opacity: disabled ? 0.5 : 1,
              '&:hover': disabled ? {} : { bgcolor: `${s.color}10`, borderColor: `${s.color}25` },
            }}
          >
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: active ? s.color : 'rgba(255,255,255,0.6)' }}>
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: active ? s.color : '#fff' }}>
              {pct}%
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', fontVariantNumeric: 'tabular-nums' }}>
              {formatUSDC(String(Math.round(s.total)), { min: 0 })}
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
