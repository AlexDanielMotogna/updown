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
import { Box, Collapse, Link } from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { useState, type ReactNode } from 'react';
import { darkTokens as t, withAlpha } from '@/lib/theme';
import { ActionButton } from './ActionButton';
import { Body } from './typography';

export interface ErrorAlertProps {
  title?: ReactNode;
  message: ReactNode;
  details?: unknown;
  onClose?: () => void;
}

export function ErrorAlert({ title, message, details, onClose }: ErrorAlertProps) {
  const [open, setOpen] = useState(false);
  const hasDetails = details != null;
  // We render our own surface (rather than MUI's default red-filled Alert)
  // so colors come from the design tokens, not MUI's palette. Matches the
  // TransactionModal error pattern: tinted background + 1px tinted border,
  // rounded ErrorOutline icon, "Show details" expander for the raw text.
  return (
    <Box
      role="alert"
      sx={{
        position: 'relative',
        display: 'flex', gap: 1.25,
        p: 1.25,
        borderRadius: 1.5,
        bgcolor: withAlpha(t.error, 0.08),
        border: `1px solid ${withAlpha(t.error, 0.32)}`,
        color: t.text.primary,
      }}
    >
      <ErrorOutlineRoundedIcon sx={{ fontSize: 20, color: t.error, flexShrink: 0, mt: '1px' }} />
      <Box sx={{ minWidth: 0, flex: 1 }}>
        {title ? <Box sx={{ fontWeight: 600, fontSize: '0.85rem', mb: 0.25, color: t.text.primary }}>{title}</Box> : null}
        <Body sx={{ fontSize: '0.8rem', color: t.text.secondary }}>{message}</Body>
        {hasDetails ? (
          <>
            <Link
              component="button"
              type="button"
              onClick={() => setOpen(v => !v)}
              underline="none"
              sx={{
                mt: 0.75, display: 'inline-flex', alignItems: 'center', gap: 0.25,
                fontSize: '0.7rem', fontWeight: 500,
                color: t.text.tertiary,
                '&:hover': { color: t.text.primary },
              }}
            >
              {open ? 'Hide details' : 'Show details'}
              <ExpandMoreRoundedIcon sx={{
                fontSize: 14,
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }} />
            </Link>
            <Collapse in={open}>
              <Box
                component="pre"
                sx={{
                  mt: 0.5, p: 1, fontSize: '0.7rem',
                  bgcolor: t.bg.surfaceAlt, borderRadius: 1,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  color: t.text.tertiary, maxHeight: 220, overflow: 'auto',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >
                {typeof details === 'string' ? details : JSON.stringify(details, null, 2)}
              </Box>
            </Collapse>
          </>
        ) : null}
      </Box>
      {onClose ? (
        <Link
          component="button"
          type="button"
          onClick={onClose}
          underline="none"
          aria-label="Dismiss"
          sx={{
            alignSelf: 'flex-start', color: t.text.tertiary, fontSize: '0.7rem',
            '&:hover': { color: t.text.primary },
          }}
        >
          Close
        </Link>
      ) : null}
    </Box>
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
