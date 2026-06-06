'use client';

/**
 * Typography atoms. Six-step scale taken straight from the public-app's
 * design language so admin pages don't drift into MUI defaults. Locked
 * sizes / weights - components should never inline `<Typography sx={{
 * fontSize: ... }}>` once these are available.
 *
 * Phase 2b will revisit weights / letter-spacing; sizes won't change.
 * See PLAN-ADMIN-REFACTOR.md Phase 2b §5.
 */
import { Typography, type TypographyProps } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';
import type { ReactNode } from 'react';

type Props = Omit<TypographyProps, 'children'> & { children?: ReactNode };

export function H1(props: Props) {
  return <Typography component="h1" {...props} sx={{ fontSize: '1.25rem', fontWeight: 600, color: t.text.primary, ...props.sx }} />;
}

export function H2(props: Props) {
  return (
    <Typography component="h2" {...props} sx={{
      fontSize: '0.9rem', fontWeight: 600, color: t.text.primary,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      ...props.sx,
    }} />
  );
}

export function H3(props: Props) {
  return <Typography component="h3" {...props} sx={{ fontSize: '0.95rem', fontWeight: 600, color: t.text.primary, ...props.sx }} />;
}

export function Body(props: Props) {
  return <Typography {...props} sx={{ fontSize: '0.85rem', fontWeight: 400, color: t.text.secondary, ...props.sx }} />;
}

export function Meta(props: Props) {
  return <Typography {...props} sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.tertiary, ...props.sx }} />;
}

export function Label(props: Props) {
  return (
    <Typography {...props} sx={{
      fontSize: '0.62rem', fontWeight: 700, color: t.text.tertiary,
      textTransform: 'uppercase', letterSpacing: '0.05em',
      ...props.sx,
    }} />
  );
}
