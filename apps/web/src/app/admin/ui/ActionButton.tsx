'use client';

/**
 * Single button primitive that locks severity → variant + color so
 * destructive actions always look the same, primary actions always look
 * the same, and "Cancel" is never the same colour as "Delete".
 *
 * - primary       → contained, gain (only one primary per surface)
 * - secondary     → outlined, border-medium
 * - destructive   → outlined in the row, contained ONLY inside a
 *                   ConfirmDialog (the dialog wraps this and flips kind)
 * - tertiary      → text, no chrome
 *
 * Loading: shows a 16px CircularProgress and an "…" suffix; disables
 * the button. Pass `loading` instead of toggling `disabled` so the
 * suffix shows.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 2 + Phase 2b §7.
 */
import { Button, type ButtonProps, CircularProgress } from '@mui/material';
import { darkTokens as t, withAlpha } from '@/lib/theme';
import type { ReactNode } from 'react';

export type ActionKind = 'primary' | 'secondary' | 'destructive' | 'tertiary';

export interface ActionButtonProps extends Omit<ButtonProps, 'variant' | 'color' | 'children'> {
  kind: ActionKind;
  label: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
}

export function ActionButton({ kind, label, icon, loading, disabled, sx, ...rest }: ActionButtonProps) {
  const isDisabled = disabled || loading;

  const variant: ButtonProps['variant'] =
    kind === 'primary' ? 'contained'
    : kind === 'tertiary' ? 'text'
    : 'outlined';

  // Visual rules per PLAN-ADMIN-REFACTOR.md Phase 2b §7. `t.success` (not
  // `t.gain`) for the primary CTA so the semantic and the swatch line up
  // with the public app's TransactionModal "Done" button. `t.successDark`
  // on hover instead of a brightness filter - single source of truth in
  // the theme. Secondary mirrors the public app's footer-cancel pattern.
  const baseSx =
    kind === 'primary' ? {
      bgcolor: t.success,
      color: '#fff',
      boxShadow: 'none',
      border: 'none',
      '&:hover': { bgcolor: t.successDark, boxShadow: 'none' },
      '&.Mui-disabled': { bgcolor: t.hover.default, color: t.text.dimmed },
    } : kind === 'secondary' ? {
      bgcolor: t.hover.medium,
      borderColor: t.border.medium,
      color: t.text.primary,
      '&:hover': { bgcolor: t.hover.strong, borderColor: t.border.emphasis },
    } : kind === 'destructive' ? {
      bgcolor: 'transparent',
      borderColor: withAlpha(t.error, 0.5),
      color: t.error,
      '&:hover': { bgcolor: withAlpha(t.error, 0.08), borderColor: t.error },
    } : {
      color: t.text.tertiary,
      '&:hover': { bgcolor: t.hover.subtle, color: t.text.primary },
    };

  return (
    <Button
      variant={variant}
      disabled={isDisabled}
      startIcon={loading ? <CircularProgress size={14} thickness={5} sx={{ color: 'inherit' }} /> : icon}
      {...rest}
      sx={{
        textTransform: 'none',
        // Sized to match TransactionModal's footer buttons: 0.85rem / 600,
        // px 2-2.5, radius 1 (8px). Same scale across every action surface.
        fontWeight: 600,
        fontSize: '0.85rem',
        borderRadius: 1,
        px: kind === 'tertiary' ? 1.25 : 2,
        py: 0.625,
        minWidth: 0,
        // No drop-shadow, no gradient - Phase 2b §1.
        boxShadow: 'none',
        ...baseSx,
        ...sx,
      }}
    >
      {label}{loading ? '…' : ''}
    </Button>
  );
}
