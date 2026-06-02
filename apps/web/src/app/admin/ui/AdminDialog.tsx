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
  useMediaQuery, useTheme,
  type DialogProps,
} from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
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
  // Phase 6 polish: take the full viewport on xs so cramped dialogs (Edit
  // tournament, Assign matchday, Resolve knockout) stay usable on the
  // <600px breakpoint. Desktop layout is unchanged.
  const theme = useTheme();
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'));

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
      fullScreen={fullScreen}
      {...rest}
      PaperProps={{
        sx: {
          bgcolor: t.bg.surface,
          border: fullScreen ? 'none' : `1px solid ${t.border.medium}`,
          borderRadius: fullScreen ? 0 : 2,
          backgroundImage: 'none',
          // Match TransactionModal: subtle elevation (single shadow token,
          // no glow). overflow:hidden so the footer's tinted background
          // doesn't peek past the rounded corner.
          boxShadow: fullScreen ? 'none' : (t.surfaceShadow !== 'none' ? t.surfaceShadow : undefined),
          overflow: 'hidden',
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
            aria-label="Close"
            onClick={onClose}
            disabled={blocked}
            sx={{ color: t.text.tertiary, '&:hover': { color: t.text.primary, bgcolor: t.hover.default } }}
          >
            <CloseRoundedIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>

      <DialogContent sx={{ px: 3, pt: 3, pb: 2 }}>
        {children}
      </DialogContent>

      {footer ? (
        <DialogActions sx={{
          px: 2.5, py: 2,
          borderTop: `1px solid ${t.border.subtle}`,
          bgcolor: t.bg.surfaceAlt,
          gap: 1,
          justifyContent: 'flex-end',
        }}>
          {footer}
        </DialogActions>
      ) : null}
    </Dialog>
  );
}
