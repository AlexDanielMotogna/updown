'use client';

/**
 * Empty state for tables, lists, and sidebars. Replaces five different
 * verbal templates that drifted in the wild ("No X — all caught up." /
 * silent tbody / centered <Typography> / instructional card).
 *
 * UX rule: when there is a next action, name it in `hint` and pass the
 * button as `action`. ("No upcoming matches cached. Try Refresh from SDB.")
 * See PLAN-ADMIN-REFACTOR.md Phase 2 §92–104.
 */
import { Box, type BoxProps } from '@mui/material';
import { darkTokens as t } from '@/lib/theme';
import type { ReactNode } from 'react';

export interface EmptyStateProps extends Omit<BoxProps, 'children' | 'title'> {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  variant?: 'success' | 'neutral';
}

export function EmptyState({ icon, title, hint, action, variant = 'neutral', sx, ...rest }: EmptyStateProps) {
  return (
    <Box
      {...rest}
      sx={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', py: 5, px: 3, gap: 1,
        color: variant === 'success' ? t.gain : t.text.tertiary,
        ...sx,
      }}
    >
      {icon ? <Box sx={{ fontSize: 32, lineHeight: 1, color: t.text.tertiary, mb: 0.5 }}>{icon}</Box> : null}
      <Box sx={{ fontSize: '0.9rem', fontWeight: 600, color: t.text.primary }}>{title}</Box>
      {hint ? <Box sx={{ fontSize: '0.8rem', color: t.text.tertiary, maxWidth: 480 }}>{hint}</Box> : null}
      {action ? <Box sx={{ mt: 1 }}>{action}</Box> : null}
    </Box>
  );
}
