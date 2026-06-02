'use client';

/**
 * Loading indicator with three intent-specific variants. Replaces the
 * bare `<CircularProgress />` calls (and their assorted sizes) currently
 * spread across the admin tabs.
 *
 * - block  → centered, py=6, for "the whole page is loading"
 * - inline → small inline spinner, for a single row / cell
 * - button → 14px spinner sized to sit inside a Button startIcon
 *
 * Buttons should usually just pass `loading` to <ActionButton> instead.
 */
import { Box, CircularProgress, type CircularProgressProps } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';

export interface LoadingStateProps {
  variant?: 'block' | 'inline' | 'button';
  label?: string;
  color?: CircularProgressProps['sx'];
}

export function LoadingState({ variant = 'block', label }: LoadingStateProps) {
  if (variant === 'inline') {
    return <CircularProgress size={14} thickness={5} sx={{ color: t.text.tertiary }} />;
  }
  if (variant === 'button') {
    return <CircularProgress size={14} thickness={5} sx={{ color: 'inherit' }} />;
  }
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 6, gap: 1 }}>
      <CircularProgress size={28} thickness={4} sx={{ color: t.text.tertiary }} />
      {label ? <Box sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>{label}</Box> : null}
    </Box>
  );
}
