'use client';

import { useEffect, useRef } from 'react';
import {
  Dialog,
  Button,
  Box,
  Typography,
  Link,
} from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import type { TransactionStatus } from '@/hooks/useTransactions';
import { getExplorerTxUrl } from '@/lib/format';
import { fireWinConfetti } from '@/lib/confetti';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface TransactionModalProps {
  open: boolean;
  status: TransactionStatus;
  title?: string;
  txSignature?: string;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}

/* ─── Progress mapping ─── */
const PROGRESS: Record<TransactionStatus, number> = {
  idle: 0,
  preparing: 20,
  signing: 45,
  confirming: 75,
  success: 100,
  error: 100,
};

const STATUS_LABELS: Record<TransactionStatus, string> = {
  idle: '',
  preparing: 'PREPARING',
  signing: 'AWAITING SIGNATURE',
  confirming: 'CONFIRMING ON-CHAIN',
  success: 'CONFIRMED',
  error: 'FAILED',
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

  const NEON_GREEN = t.gain;
  const NEON_RED = t.error;

  function getGlowColor(s: TransactionStatus) {
    if (s === 'success') return NEON_GREEN;
    if (s === 'error') return NEON_RED;
    return t.info; // blue for in-progress
  }

  const isComplete = status === 'success' || status === 'error';
  const isPending = status === 'preparing' || status === 'signing' || status === 'confirming';
  const glowColor = getGlowColor(status);
  const progress = PROGRESS[status];

  const firedRef = useRef(false);
  useEffect(() => {
    if (status === 'success' && !firedRef.current) {
      firedRef.current = true;
      fireWinConfetti();
    }
    if (status !== 'success') {
      firedRef.current = false;
    }
  }, [status]);

  return (
    <Dialog
      open={open}
      onClose={isComplete ? onClose : undefined}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          background: t.bg.dialog,
          border: `1px solid ${withAlpha(glowColor, 0.19)}`,
          borderRadius: '4px',
          maxWidth: { xs: '95vw', sm: 420 },
          overflow: 'hidden',
          boxShadow: `0 0 40px ${withAlpha(glowColor, 0.08)}, 0 0 80px ${withAlpha(glowColor, 0.03)}`,
          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        },
      }}
    >
      {/* Neon progress bar */}
      <Box sx={{ position: 'relative', height: 4, bgcolor: t.hover.medium }}>
        <motion.div
          animate={{ width: `${progress}%` }}
          transition={
            status === 'confirming'
              ? { duration: 20, ease: 'linear' }
              : { duration: 0.6, ease: 'easeOut' }
          }
          style={{
            height: '100%',
            background: status === 'error'
              ? `linear-gradient(90deg, ${withAlpha(NEON_RED, 0.50)}, ${NEON_RED})`
              : `linear-gradient(90deg, ${withAlpha(glowColor, 0.50)}, ${glowColor})`,
            boxShadow: `0 0 12px ${withAlpha(glowColor, 0.38)}, 0 2px 8px ${withAlpha(glowColor, 0.25)}`,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Shimmer on the bar while pending */}
          {isPending && (
            <Box
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.4), transparent)',
                backgroundSize: '200% 100%',
                animation: 'barShimmer 1.5s infinite linear',
                '@keyframes barShimmer': {
                  from: { backgroundPosition: '-200% 0' },
                  to: { backgroundPosition: '200% 0' },
                },
              }}
            />
          )}
        </motion.div>
      </Box>

      {/* Content */}
      <Box sx={{ px: { xs: 3, sm: 4 }, pt: 4, pb: 1.5 }}>
        {/* Title */}
        <Typography
          sx={{
            textAlign: 'center',
            fontWeight: 700,
            fontSize: { xs: '0.75rem', sm: '0.8rem' },
            letterSpacing: '0.15em',
            color: t.text.tertiary,
            textTransform: 'uppercase',
          }}
        >
          {title}
        </Typography>

        {/* Status icon + text */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}
            >
              {/* Central icon */}
              <Box
                sx={{
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: withAlpha(glowColor, 0.07),
                  border: `2px solid ${withAlpha(glowColor, 0.25)}`,
                  boxShadow: `0 0 30px ${withAlpha(glowColor, 0.13)}`,
                  mb: 3,
                  position: 'relative',
                  transition: 'all 0.4s ease',
                }}
              >
                {isPending && (
                  <Box
                    sx={{
                      position: 'absolute',
                      inset: -3,
                      borderRadius: '50%',
                      border: `2px solid transparent`,
                      borderTopColor: glowColor,
                      animation: 'spinRing 1s linear infinite',
                      '@keyframes spinRing': {
                        from: { transform: 'rotate(0deg)' },
                        to: { transform: 'rotate(360deg)' },
                      },
                    }}
                  />
                )}
                <Typography sx={{ fontSize: '1.8rem', lineHeight: 1, filter: `drop-shadow(0 0 8px ${withAlpha(glowColor, 0.38)})` }}>
                  {status === 'success' ? '\u2714' : status === 'error' ? '\u2716' : '\u26A1'}
                </Typography>
              </Box>

              {/* Status label */}
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1.1rem', sm: '1.25rem' },
                  letterSpacing: '0.08em',
                  color: status === 'error' ? NEON_RED : status === 'success' ? NEON_GREEN : t.text.primary,
                  textShadow: `0 0 20px ${withAlpha(glowColor, 0.31)}`,
                  textAlign: 'center',
                }}
              >
                {STATUS_LABELS[status]}
              </Typography>

              {/* Sub-label */}
              {isPending && (
                <Typography
                  sx={{
                    mt: 1,
                    fontSize: '0.8rem',
                    color: t.text.tertiary,
                    fontWeight: 500,
                    textAlign: 'center',
                  }}
                >
                  {status === 'preparing' && 'Setting up your transaction...'}
                  {status === 'signing' && 'Approve in your wallet'}
                  {status === 'confirming' && 'Waiting for blockchain confirmation...'}
                </Typography>
              )}
              {status === 'success' && (
                <Typography
                  sx={{
                    mt: 1,
                    fontSize: '0.8rem',
                    color: t.text.secondary,
                    fontWeight: 500,
                    textAlign: 'center',
                  }}
                >
                  Your prediction is locked in
                </Typography>
              )}
            </motion.div>
          </AnimatePresence>

          {/* Error details */}
          {error && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                width: '100%',
                background: withAlpha(NEON_RED, 0.06),
                border: `1px solid ${withAlpha(NEON_RED, 0.15)}`,
                borderRadius: '4px',
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: NEON_RED, textAlign: 'center', wordBreak: 'break-word', fontSize: '0.8rem' }}
              >
                {error}
              </Typography>
            </Box>
          )}

          {/* Explorer link */}
          {txSignature && (
            <Link
              href={getExplorerTxUrl(txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                mt: 3,
                px: 2.5,
                py: 1,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                color: t.text.strong,
                textDecoration: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
                bgcolor: t.hover.default,
                border: `1px solid ${t.border.medium}`,
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                '&:hover': {
                  color: t.text.primary,
                  bgcolor: t.hover.strong,
                  borderColor: t.border.emphasis,
                },
              }}
            >
              View on Explorer &rarr;
            </Link>
          )}
        </Box>
      </Box>

      {/* Actions */}
      <Box sx={{ px: { xs: 3, sm: 4 }, pb: 3, display: 'flex', justifyContent: 'center', gap: 1.5 }}>
        {status === 'error' && onRetry && (
          <Button
            onClick={onRetry}
            sx={{
              px: 4,
              py: 1,
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              color: t.text.primary,
              bgcolor: t.hover.medium,
              border: `1px solid ${t.border.emphasis}`,
              borderRadius: '4px',
              textTransform: 'uppercase',
              '&:hover': {
                bgcolor: t.hover.emphasis,
                borderColor: t.border.hover,
              },
            }}
          >
            Try Again
          </Button>
        )}
        {isComplete && (
          <Button
            onClick={onClose}
            sx={{
              px: 4,
              py: 1,
              fontWeight: 700,
              fontSize: '0.8rem',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              borderRadius: '4px',
              color: status === 'success' ? t.text.contrast : t.text.primary,
              background: status === 'success'
                ? `linear-gradient(135deg, ${NEON_GREEN}, ${withAlpha(NEON_GREEN, 0.80)})`
                : t.hover.strong,
              boxShadow: status === 'success' ? `0 0 20px ${withAlpha(NEON_GREEN, 0.19)}` : 'none',
              border: status === 'success' ? 'none' : `1px solid ${t.border.emphasis}`,
              '&:hover': {
                background: status === 'success'
                  ? `linear-gradient(135deg, ${withAlpha(NEON_GREEN, 0.87)}, ${withAlpha(NEON_GREEN, 0.67)})`
                  : t.hover.emphasis,
              },
            }}
          >
            {status === 'success' ? 'Done' : 'Close'}
          </Button>
        )}
        {isPending && (
          <Typography
            sx={{
              fontSize: '0.7rem',
              color: t.text.dimmed,
              fontWeight: 500,
              letterSpacing: '0.05em',
            }}
          >
            Do not close this window
          </Typography>
        )}
      </Box>
    </Dialog>
  );
}
