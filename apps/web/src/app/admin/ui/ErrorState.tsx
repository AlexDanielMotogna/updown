'use client';

/**
 * Two error primitives.
 *
 * - <ErrorAlert>: a sticky Alert at the top of a section. For inline
 *   form / mutation feedback. Use when the user can act on the error
 *   inside the current surface.
 *
 * - <ErrorState>:  a centered fill-the-area state with a retry CTA. For
 *   query failures that wipe the whole content area.
 *
 * Both hide the raw payload behind "Show details" so the human message
 * stays readable. Replaces six different error patterns in the wild.
 * See PLAN-ADMIN-REFACTOR.md Phase 2b §9.
 */
import { Alert, Box, Collapse, Link } from '@mui/material';
import { useState, type ReactNode } from 'react';
import { darkTokens as t } from '@/lib/theme';
import { ActionButton } from './ActionButton';

export interface ErrorAlertProps {
  title?: ReactNode;
  message: ReactNode;
  details?: unknown;
  onClose?: () => void;
}

export function ErrorAlert({ title, message, details, onClose }: ErrorAlertProps) {
  const [open, setOpen] = useState(false);
  const hasDetails = details != null;
  return (
    <Alert
      severity="error"
      onClose={onClose}
      sx={{ borderRadius: 1.5, alignItems: 'flex-start', '& .MuiAlert-message': { width: '100%' } }}
    >
      {title ? <Box sx={{ fontWeight: 600, mb: 0.25 }}>{title}</Box> : null}
      <Box sx={{ fontSize: '0.85rem' }}>{message}</Box>
      {hasDetails ? (
        <>
          <Link
            component="button"
            type="button"
            onClick={() => setOpen(v => !v)}
            sx={{ mt: 0.5, fontSize: '0.7rem', color: t.text.tertiary }}
          >
            {open ? 'Hide details' : 'Show details'}
          </Link>
          <Collapse in={open}>
            <Box
              component="pre"
              sx={{
                mt: 0.5, p: 1, fontSize: '0.7rem',
                bgcolor: t.bg.surfaceAlt, borderRadius: 1,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                color: t.text.tertiary, maxHeight: 220, overflow: 'auto',
              }}
            >
              {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
            </Box>
          </Collapse>
        </>
      ) : null}
    </Alert>
  );
}

export interface ErrorStateProps {
  title?: ReactNode;
  message: ReactNode;
  details?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title = 'Something went wrong', message, details, onRetry, retryLabel = 'Retry' }: ErrorStateProps) {
  return (
    <Box sx={{ py: 5, px: 3, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ width: '100%', maxWidth: 520 }}>
        <ErrorAlert title={title} message={message} details={details} />
      </Box>
      {onRetry ? <ActionButton kind="secondary" label={retryLabel} onClick={onRetry} /> : null}
    </Box>
  );
}
