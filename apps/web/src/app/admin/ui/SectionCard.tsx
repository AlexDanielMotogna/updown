'use client';

/**
 * Standard section wrapper. Title + optional subtitle + optional right-
 * aligned action slot, body below. Replaces the 10+ ad-hoc <Card> shells
 * across the admin tabs (each with slightly different padding, header
 * size, and divider behaviour).
 *
 * Visual polish (border alpha, radius, hover) gets locked in Phase 2b.
 */
import { Card, Box, type CardProps } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';
import { LAYOUT_TOKENS } from './tokens';
import { H2, Body } from './typography';
import type { ReactNode } from 'react';

export interface SectionCardProps extends Omit<CardProps, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  accentColor?: string;
  dense?: boolean;
  children: ReactNode;
}

export function SectionCard({ title, subtitle, actions, accentColor, dense, children, sx, ...rest }: SectionCardProps) {
  const padding = dense ? LAYOUT_TOKENS.cardPaddingDense : LAYOUT_TOKENS.cardPaddingDefault;
  return (
    <Card
      elevation={0}
      {...rest}
      sx={{
        bgcolor: t.bg.surface,
        border: `1px solid ${t.border.medium}`,
        borderRadius: LAYOUT_TOKENS.radiusCard,
        borderLeft: accentColor ? `3px solid ${accentColor}` : undefined,
        p: padding,
        ...sx,
      }}
    >
      {title || actions ? (
        <Box sx={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 1, mb: LAYOUT_TOKENS.cardSectionGap,
        }}>
          <Box sx={{ minWidth: 0 }}>
            {title ? <H2>{title}</H2> : null}
            {subtitle ? <Body sx={{ mt: 0.25 }}>{subtitle}</Body> : null}
          </Box>
          {actions ? <Box sx={{ display: 'flex', gap: LAYOUT_TOKENS.inlineButtonGap, flexShrink: 0 }}>{actions}</Box> : null}
        </Box>
      ) : null}
      {children}
    </Card>
  );
}
