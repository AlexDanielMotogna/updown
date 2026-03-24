'use client';

import { Box, Typography } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';
import { AnimatedValue } from '@/components/AnimatedValue';
import { USDC_DIVISOR } from '@/lib/format';

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
              bgcolor: active ? `${s.color}18` : 'rgba(255,255,255,0.03)',
              borderRadius: '5px',
              transition: 'all 0.15s ease',
              opacity: disabled ? 0.5 : 1,
              '&:hover': disabled ? {} : { bgcolor: `${s.color}12` },
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: active ? s.color : 'rgba(255,255,255,0.7)' }}>
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: active ? s.color : '#fff' }}>
              {pct}%
            </Typography>
            <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 500, color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums' }}>
              <AnimatedValue value={s.total / USDC_DIVISOR} prefix="$" duration={0.6} />
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
