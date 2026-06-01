'use client';

/**
 * Single stat tile — label, big number, optional unit + trend + hint.
 * Replaces three incompatible versions (Finance, Payouts, Health).
 */
import { Box, type BoxProps } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';
import { Label, Meta } from './typography';
import type { ReactNode } from 'react';

export type StatTrend = 'up' | 'down' | 'flat';

export interface StatCardProps extends Omit<BoxProps, 'children'> {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  color?: string;
  trend?: StatTrend;
  hint?: ReactNode;
}

const TREND_GLYPH: Record<StatTrend, string> = { up: '▲', down: '▼', flat: '–' };

export function StatCard({ label, value, unit, color, trend, hint, sx, ...rest }: StatCardProps) {
  const valueColor = color ?? t.text.primary;
  const trendColor = trend === 'up' ? t.gain : trend === 'down' ? t.error : t.text.tertiary;
  return (
    <Box
      {...rest}
      sx={{
        p: 2,
        borderRadius: 2,
        bgcolor: t.bg.surface,
        border: t.surfaceBorder !== 'none' ? t.surfaceBorder : `1px solid ${t.border.medium}`,
        boxShadow: 'none',
        backgroundImage: 'none',
        display: 'flex', flexDirection: 'column', gap: 0.75,
        minWidth: 0,
        ...sx,
      }}
    >
      <Label>{label}</Label>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
        <Box sx={{ fontSize: '1.4rem', fontWeight: 700, color: valueColor, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Box>
        {unit ? <Box sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>{unit}</Box> : null}
        {trend ? <Box sx={{ fontSize: '0.7rem', color: trendColor, ml: 'auto' }}>{TREND_GLYPH[trend]}</Box> : null}
      </Box>
      {hint ? <Meta>{hint}</Meta> : null}
    </Box>
  );
}
