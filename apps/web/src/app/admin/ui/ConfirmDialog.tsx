'use client';

/**
 * One confirm-dialog primitive that swallows the four patterns in the
 * wild: red dialog, orange dialog, raw window.confirm(), and "no
 * confirmation at all". Built on AdminDialog so spacing + close
 * affordance stay aligned with non-confirm dialogs.
 *
 * - severity='warning'     → secondary border, gain confirm
 * - severity='destructive' → error border, error confirm (only place
 *                            ActionButton renders contained-error)
 *
 * The confirm button stays disabled while `loading`, and the cancel
 * button + close X both block when loading too.
 */
import { Box } from '@mui/material';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { darkTokens as t } from '@/lib/theme';
import { AdminDialog } from './AdminDialog';
import { ActionButton } from './ActionButton';
import { ErrorAlert } from './ErrorState';
import { Body } from './typography';
import type { ReactNode } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  consequences?: ReactNode;
  actionLabel: string;
  cancelLabel?: string;
  severity?: 'warning' | 'destructive';
  loading?: boolean;
  error?: { message: ReactNode; details?: unknown } | null;
}

export function ConfirmDialog({
  open, onClose, onConfirm, title, consequences,
  actionLabel, cancelLabel = 'Cancel',
  severity = 'warning', loading, error,
}: ConfirmDialogProps) {
  const Icon = severity === 'destructive' ? DeleteOutlineRoundedIcon : WarningAmberRoundedIcon;
  const iconColor = severity === 'destructive' ? t.error : t.warning;

  // Both severities render the contained "primary" shape; destructive
  // swaps the background to t.error via confirmSx. This is the only
  // place in the admin where a contained-error button is allowed - every
  // other destructive action surfaces as a row-level outlined button
  // wrapping a confirm dialog.
  const confirmSx = severity === 'destructive' ? {
    bgcolor: t.error, '&:hover': { bgcolor: t.error, filter: 'brightness(1.08)' },
  } : undefined;

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      loading={loading}
      maxWidth="sm"
      icon={<Icon sx={{ color: iconColor, fontSize: 20 }} />}
      title={title}
      footer={
        <>
          <ActionButton kind="tertiary" label={cancelLabel} onClick={onClose} disabled={loading} />
          <ActionButton
            kind="primary"
            label={actionLabel}
            loading={loading}
            onClick={onConfirm}
            sx={confirmSx}
          />
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {consequences ? <Body sx={{ color: t.text.secondary }}>{consequences}</Body> : null}
        {error ? <ErrorAlert message={error.message} details={error.details} /> : null}
      </Box>
    </AdminDialog>
  );
}
