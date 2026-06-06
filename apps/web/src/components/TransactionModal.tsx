'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Button, Box, Typography, Link, IconButton, Collapse } from '@mui/material';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import { motion, AnimatePresence } from 'framer-motion';
import type { TransactionStatus } from '@/hooks/useTransactions';
import { getExplorerTxUrl } from '@/lib/format';
import { fireWinConfetti } from '@/lib/confetti';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { mapTxError } from '@/lib/txErrors';

interface TransactionModalProps {
  open: boolean;
  status: TransactionStatus;
  title?: string;
  txSignature?: string;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}

// Stages used by the stepper. `idle` collapses to "preparing" visually so the
// modal never shows an empty state if the parent opens it pre-state.
type Stage = 'preparing' | 'signing' | 'confirming' | 'done';
const STAGES: Stage[] = ['preparing', 'signing', 'confirming', 'done'];
const STAGE_LABEL: Record<Stage, string> = {
  preparing: 'Prepare',
  signing: 'Sign',
  confirming: 'Confirm',
  done: 'Done',
};

function statusToStageIndex(s: TransactionStatus): number {
  switch (s) {
    case 'idle':
    case 'preparing':
      return 0;
    case 'signing':
      return 1;
    case 'confirming':
      return 2;
    case 'success':
    case 'error':
      return 3;
  }
}

const SUB_LABEL: Record<TransactionStatus, string> = {
  idle: '',
  preparing: 'Setting up the transaction',
  signing: 'Approve in your wallet',
  confirming: 'Waiting for the network to confirm',
  success: 'Transaction confirmed',
  error: '',
};

export function TransactionModal({
  open,
  status,
  title = 'Transaction',
  txSignature,
  error,
  onClose,
  onRetry,
}: TransactionModalProps) {
  const t = useThemeTokens();
  const isPending = status === 'preparing' || status === 'signing' || status === 'confirming';
  const isComplete = status === 'success' || status === 'error';
  const activeStageIdx = statusToStageIndex(status);

  // Confetti on success - single fire per cycle (resets on status change).
  const firedRef = useRef(false);
  useEffect(() => {
    if (status === 'success' && !firedRef.current) {
      firedRef.current = true;
      fireWinConfetti();
    }
    if (status !== 'success') firedRef.current = false;
  }, [status]);

  // Friendly error breakdown - falls back to the raw text if we don't recognise it.
  const friendly = useMemo(() => (error ? mapTxError(error) : null), [error]);
  const [showDetail, setShowDetail] = useState(false);
  useEffect(() => {
    if (status !== 'error') setShowDetail(false);
  }, [status]);

  return (
    <Dialog
      open={open}
      onClose={isComplete ? onClose : undefined}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          bgcolor: t.bg.surface,
          border: `1px solid ${t.border.medium}`,
          borderRadius: 2,
          maxWidth: { xs: '95vw', sm: 400 },
          overflow: 'hidden',
          boxShadow: t.surfaceShadow,
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.75,
          borderBottom: `1px solid ${t.border.subtle}`,
        }}
      >
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 600, color: t.text.primary }}>
          {title}
        </Typography>
        <IconButton
          size="small"
          aria-label="Close"
          onClick={onClose}
          disabled={isPending}
          sx={{
            color: t.text.tertiary,
            '&:hover': { color: t.text.primary, bgcolor: t.hover.default },
          }}
        >
          <CloseRoundedIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Body */}
      <Box sx={{ px: 3, pt: 3, pb: 2 }}>
        {/* Stepper - hidden on error so it doesn't compete with the error card */}
        {status !== 'error' && (
          <Stepper
            stages={STAGES}
            activeIdx={activeStageIdx}
            status={status}
            t={t}
          />
        )}

        {/* Status block */}
        <AnimatePresence mode="wait">
          {status === 'success' ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 3 }}>
                <CheckCircleRoundedIcon sx={{ fontSize: 44, color: t.success }} />
                <Typography sx={{ mt: 1.5, fontSize: '1.0rem', fontWeight: 600, color: t.text.primary }}>
                  {SUB_LABEL.success}
                </Typography>
                {txSignature && (
                  <Link
                    href={getExplorerTxUrl(txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{
                      mt: 1.5,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      color: t.text.secondary,
                      fontSize: '0.8rem',
                      fontWeight: 500,
                      textDecoration: 'none',
                      '&:hover': { color: t.text.primary, textDecoration: 'underline' },
                    }}
                  >
                    View on explorer
                    <OpenInNewRoundedIcon sx={{ fontSize: 14 }} />
                  </Link>
                )}
              </Box>
            </motion.div>
          ) : status === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
            >
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mt: 1 }}>
                <ErrorOutlineRoundedIcon sx={{ fontSize: 40, color: t.error }} />
                <Typography sx={{ mt: 1.5, fontSize: '0.98rem', fontWeight: 600, color: t.text.primary }}>
                  {friendly?.headline ?? 'Transaction failed'}
                </Typography>
                {friendly?.hint && (
                  <Typography sx={{ mt: 0.5, fontSize: '0.8rem', color: t.text.tertiary }}>
                    {friendly.hint}
                  </Typography>
                )}
                {friendly?.detail && friendly.detail !== friendly.headline && (
                  <>
                    <Button
                      size="small"
                      onClick={() => setShowDetail(v => !v)}
                      endIcon={
                        <ExpandMoreRoundedIcon
                          sx={{
                            transform: showDetail ? 'rotate(180deg)' : 'rotate(0deg)',
                            transition: 'transform 0.2s',
                            fontSize: 16,
                          }}
                        />
                      }
                      sx={{
                        mt: 1.5,
                        color: t.text.tertiary,
                        fontSize: '0.72rem',
                        fontWeight: 500,
                        textTransform: 'none',
                        minHeight: 'auto',
                        py: 0.25,
                        '&:hover': { bgcolor: 'transparent', color: t.text.secondary },
                      }}
                    >
                      {showDetail ? 'Hide details' : 'Show details'}
                    </Button>
                    <Collapse in={showDetail} sx={{ width: '100%' }}>
                      <Box
                        sx={{
                          mt: 1,
                          p: 1.25,
                          bgcolor: t.bg.surfaceAlt,
                          border: `1px solid ${t.border.subtle}`,
                          borderRadius: 1,
                          textAlign: 'left',
                        }}
                      >
                        <Typography
                          component="pre"
                          sx={{
                            m: 0,
                            fontSize: '0.7rem',
                            fontFamily: 'ui-monospace, Menlo, monospace',
                            color: t.text.secondary,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                          }}
                        >
                          {friendly.detail}
                        </Typography>
                      </Box>
                    </Collapse>
                  </>
                )}
              </Box>
            </motion.div>
          ) : (
            <motion.div
              key="pending"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2 }}
            >
              <Typography
                sx={{
                  mt: 2.5,
                  fontSize: '0.85rem',
                  fontWeight: 500,
                  color: t.text.secondary,
                  textAlign: 'center',
                }}
              >
                {SUB_LABEL[status]}
              </Typography>
              <Typography
                sx={{
                  mt: 0.5,
                  fontSize: '0.7rem',
                  color: t.text.dimmed,
                  textAlign: 'center',
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                Do not close this window
              </Typography>
            </motion.div>
          )}
        </AnimatePresence>
      </Box>

      {/* Footer */}
      <Box
        sx={{
          px: 2.5,
          py: 2,
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          borderTop: `1px solid ${t.border.subtle}`,
          bgcolor: t.bg.surfaceAlt,
        }}
      >
        {status === 'error' && onRetry && (
          <Button
            onClick={onRetry}
            startIcon={<RefreshRoundedIcon sx={{ fontSize: 16 }} />}
            sx={{
              px: 2,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: t.text.primary,
              bgcolor: t.hover.medium,
              border: `1px solid ${t.border.medium}`,
              borderRadius: 1,
              textTransform: 'none',
              '&:hover': { bgcolor: t.hover.strong, borderColor: t.border.emphasis },
            }}
          >
            Try again
          </Button>
        )}
        {isComplete ? (
          <Button
            onClick={onClose}
            sx={{
              px: 2.5,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: status === 'success' ? '#fff' : t.text.primary,
              bgcolor: status === 'success' ? t.success : t.hover.medium,
              border: status === 'success' ? 'none' : `1px solid ${t.border.medium}`,
              borderRadius: 1,
              textTransform: 'none',
              '&:hover': {
                bgcolor: status === 'success' ? t.successDark : t.hover.strong,
                borderColor: t.border.emphasis,
              },
            }}
          >
            {status === 'success' ? 'Done' : 'Close'}
          </Button>
        ) : (
          <Button
            disabled
            sx={{
              px: 2.5,
              fontSize: '0.85rem',
              fontWeight: 600,
              color: t.text.dimmed,
              bgcolor: t.hover.default,
              borderRadius: 1,
              textTransform: 'none',
              '&.Mui-disabled': { color: t.text.dimmed },
            }}
          >
            Processing…
          </Button>
        )}
      </Box>
    </Dialog>
  );
}

// ── Stepper ───────────────────────────────────────────────────────────────────

function Stepper({
  stages,
  activeIdx,
  status,
  t,
}: {
  stages: Stage[];
  activeIdx: number;
  status: TransactionStatus;
  t: ReturnType<typeof useThemeTokens>;
}) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 0.5 }}>
      {stages.map((stage, idx) => {
        const isLast = idx === stages.length - 1;
        const isActive = idx === activeIdx && status !== 'success';
        const isComplete = idx < activeIdx || (idx === stages.length - 1 && status === 'success');
        const dotColor = isComplete ? t.success : isActive ? t.info : t.border.medium;
        const labelColor = isComplete || isActive ? t.text.primary : t.text.dimmed;

        return (
          <Box
            key={stage}
            sx={{
              display: 'flex',
              alignItems: 'center',
              flex: isLast ? '0 0 auto' : 1,
              minWidth: 0,
            }}
          >
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isComplete ? t.success : isActive ? withAlpha(t.info, 0.15) : 'transparent',
                  border: `1.5px solid ${dotColor}`,
                  transition: 'all 0.25s ease',
                  position: 'relative',
                }}
              >
                {isComplete ? (
                  <CheckRoundedIcon sx={{ fontSize: 13, color: '#fff' }} />
                ) : isActive ? (
                  <Box
                    sx={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      bgcolor: t.info,
                      animation: 'txPulse 1.2s ease-in-out infinite',
                      '@keyframes txPulse': {
                        '0%, 100%': { opacity: 0.55, transform: 'scale(0.85)' },
                        '50%': { opacity: 1, transform: 'scale(1)' },
                      },
                    }}
                  />
                ) : null}
              </Box>
              <Typography
                sx={{
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  color: labelColor,
                  letterSpacing: '0.02em',
                  transition: 'color 0.25s ease',
                }}
              >
                {STAGE_LABEL[stage]}
              </Typography>
            </Box>
            {!isLast && (
              <Box
                sx={{
                  flex: 1,
                  height: 1.5,
                  mx: 1,
                  mt: '-14px', // vertical-center the bar against the dot midline
                  bgcolor: idx < activeIdx ? t.success : t.border.medium,
                  transition: 'background-color 0.25s ease',
                }}
              />
            )}
          </Box>
        );
      })}
    </Box>
  );
}
