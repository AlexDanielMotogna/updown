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
import { GAIN_COLOR } from '@/lib/constants';

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

const NEON_GREEN = GAIN_COLOR;
const NEON_RED = '#F87171';

function getGlowColor(status: TransactionStatus) {
  if (status === 'success') return NEON_GREEN;
  if (status === 'error') return NEON_RED;
  return '#60A5FA'; // blue for in-progress
}

export function TransactionModal({
  open,
  status,
  title = 'Transaction',
  txSignature,
  error,
  onClose,
  onRetry,
}: TransactionModalProps) {
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
          background: '#0A0E14',
          border: `1px solid ${glowColor}30`,
          borderRadius: '4px',
          maxWidth: { xs: '95vw', sm: 420 },
          overflow: 'hidden',
          boxShadow: `0 0 40px ${glowColor}15, 0 0 80px ${glowColor}08`,
          transition: 'border-color 0.4s ease, box-shadow 0.4s ease',
        },
      }}
    >
      {/* ═══ Neon progress bar ═══ */}
      <Box sx={{ position: 'relative', height: 4, bgcolor: 'rgba(255,255,255,0.06)' }}>
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
              ? `linear-gradient(90deg, ${NEON_RED}80, ${NEON_RED})`
              : `linear-gradient(90deg, ${glowColor}80, ${glowColor})`,
            boxShadow: `0 0 12px ${glowColor}60, 0 2px 8px ${glowColor}40`,
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

      {/* ═══ Content ═══ */}
      <Box sx={{ px: { xs: 3, sm: 4 }, pt: 4, pb: 1.5 }}>
        {/* Title */}
        <Typography
          sx={{
            textAlign: 'center',
            fontWeight: 700,
            fontSize: { xs: '0.75rem', sm: '0.8rem' },
            letterSpacing: '0.15em',
            color: 'rgba(255,255,255,0.4)',
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
                  background: `${glowColor}12`,
                  border: `2px solid ${glowColor}40`,
                  boxShadow: `0 0 30px ${glowColor}20`,
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
                <Typography sx={{ fontSize: '1.8rem', lineHeight: 1, filter: `drop-shadow(0 0 8px ${glowColor}60)` }}>
                  {status === 'success' ? '\u2714' : status === 'error' ? '\u2716' : '\u26A1'}
                </Typography>
              </Box>

              {/* Status label */}
              <Typography
                sx={{
                  fontWeight: 700,
                  fontSize: { xs: '1.1rem', sm: '1.25rem' },
                  letterSpacing: '0.08em',
                  color: status === 'error' ? NEON_RED : status === 'success' ? NEON_GREEN : '#fff',
                  textShadow: `0 0 20px ${glowColor}50`,
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
                    color: 'rgba(255,255,255,0.4)',
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
                    color: 'rgba(255,255,255,0.5)',
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
                background: `${NEON_RED}10`,
                border: `1px solid ${NEON_RED}25`,
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
                color: 'rgba(255,255,255,0.6)',
                textDecoration: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
                bgcolor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                transition: 'all 0.2s ease',
                '&:hover': {
                  color: '#fff',
                  bgcolor: 'rgba(255,255,255,0.08)',
                  borderColor: 'rgba(255,255,255,0.15)',
                },
              }}
            >
              View on Explorer &rarr;
            </Link>
          )}
        </Box>
      </Box>

      {/* ═══ Actions ═══ */}
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
              color: '#fff',
              bgcolor: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '4px',
              textTransform: 'uppercase',
              '&:hover': {
                bgcolor: 'rgba(255,255,255,0.10)',
                borderColor: 'rgba(255,255,255,0.2)',
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
              color: status === 'success' ? '#000' : '#fff',
              background: status === 'success'
                ? `linear-gradient(135deg, ${NEON_GREEN}, ${NEON_GREEN}CC)`
                : 'rgba(255,255,255,0.08)',
              boxShadow: status === 'success' ? `0 0 20px ${NEON_GREEN}30` : 'none',
              border: status === 'success' ? 'none' : '1px solid rgba(255,255,255,0.12)',
              '&:hover': {
                background: status === 'success'
                  ? `linear-gradient(135deg, ${NEON_GREEN}DD, ${NEON_GREEN}AA)`
                  : 'rgba(255,255,255,0.12)',
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
              color: 'rgba(255,255,255,0.3)',
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
