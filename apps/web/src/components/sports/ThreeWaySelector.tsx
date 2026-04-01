'use client';

import { Box, Typography } from '@mui/material';
import { AnimatedValue } from '@/components/AnimatedValue';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  side: 'UP' | 'DOWN' | 'DRAW' | null;
  onSideChange: (side: 'UP' | 'DOWN' | 'DRAW') => void;
  totalUp: number;
  totalDown: number;
  totalDraw: number;
  homeTeam?: string;
  awayTeam?: string;
  disabled?: boolean;
  numSides?: number;
}

export function ThreeWaySelector({ side, onSideChange, totalUp, totalDown, totalDraw, homeTeam, awayTeam, disabled, numSides = 3 }: Props) {
  const t = useThemeTokens();
  const total = totalUp + totalDown + totalDraw;
  const isTwoWay = numSides === 2;
  const allSides = [
    { key: 'UP' as const, label: isTwoWay ? (homeTeam || 'Yes') : (homeTeam || 'Home'), total: totalUp, color: t.up },
    ...(!isTwoWay ? [{ key: 'DRAW' as const, label: 'Draw', total: totalDraw, color: t.draw }] : []),
    { key: 'DOWN' as const, label: isTwoWay ? (awayTeam || 'No') : (awayTeam || 'Away'), total: totalDown, color: t.down },
  ];
  const sides = allSides;

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
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              overflow: 'hidden',
              gap: 0.5,
              py: 1.5,
              cursor: disabled ? 'default' : 'pointer',
              bgcolor: active ? withAlpha(s.color, 0.09) : t.hover.light,
              borderRadius: '5px',
              transition: 'all 0.15s ease',
              opacity: disabled ? 0.5 : 1,
              '&:hover': disabled ? {} : { bgcolor: withAlpha(s.color, 0.07) },
            }}
          >
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: active ? s.color : t.text.bright, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%', px: 0.5, textAlign: 'center' }}>
              {s.label}
            </Typography>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: active ? s.color : t.text.primary }}>
              {pct}%
            </Typography>
            <Typography component="span" sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.soft, fontVariantNumeric: 'tabular-nums' }}>
              <AnimatedValue value={s.total / USDC_DIVISOR} prefix="$" duration={0.6} />
            </Typography>
          </Box>
        );
      })}
    </Box>
  );
}
