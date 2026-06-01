'use client';

/**
 * Standard dialog shell. Header with optional icon + close X, body slot,
 * optional sticky footer. Auto-blocks backdrop dismiss + escape when
 * `loading` is true — the previous pattern was every component
 * remembering to write `onClose={busy ? undefined : onClose}` (and
 * forgetting half the time). Width and padding match the public app's
 * TransactionModal redesign (commit 27be579).
 *
 * Visual polish (precise spacing) lands in Phase 2b.
 * See PLAN-ADMIN-REFACTOR.md Phase 2b §8.
 */
import {
  Dialog, DialogContent, DialogActions, Box, IconButton,
  type DialogProps,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { darkTokens as t } from '@/lib/theme';
import { H3 } from './typography';
import type { ReactNode } from 'react';

export interface AdminDialogProps extends Omit<DialogProps, 'onClose' | 'title' | 'open' | 'maxWidth'> {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  icon?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  showClose?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

export function AdminDialog({
  open, onClose, title, icon, maxWidth = 'sm', loading, showClose = true,
  footer, children, ...rest
}: AdminDialogProps) {
  const blocked = !!loading;
  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (blocked) return;
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') {
          onClose();
        } else {
          onClose();
        }
      }}
      maxWidth={maxWidth}
      fullWidth
      {...rest}
      PaperProps={{
        sx: {
          bgcolor: t.bg.surface,
          border: `1px solid ${t.border.medium}`,
          borderRadius: 2,
          backgroundImage: 'none',
        },
        ...rest.PaperProps,
      }}
    >
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        px: 2.5, py: 1.75, borderBottom: `1px solid ${t.border.subtle}`,
        gap: 1,
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          {icon ? <Box sx={{ display: 'flex', color: t.text.tertiary }}>{icon}</Box> : null}
          <H3 sx={{ fontSize: '0.95rem' }}>{title}</H3>
        </Box>
        {showClose ? (
          <IconButton
            size="small"
            onClick={onClose}
            disabled={blocked}
            sx={{ color: t.text.tertiary, '&:hover': { color: t.text.primary } }}
          >
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        ) : null}
      </Box>

      <DialogContent sx={{ px: 3, pt: 3, pb: 2 }}>
        {children}
      </DialogContent>

      {footer ? (
        <DialogActions sx={{
          px: 2.5, py: 1.5,
          borderTop: `1px solid ${t.border.subtle}`,
          bgcolor: t.bg.surfaceAlt,
          gap: 1,
        }}>
          {footer}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}
