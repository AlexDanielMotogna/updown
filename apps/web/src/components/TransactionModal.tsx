'use client';

import { useEffect, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Link,
} from '@mui/material';
import { motion, AnimatePresence, type Easing } from 'framer-motion';
import type { TransactionStatus } from '@/hooks/useTransactions';
import { getExplorerTxUrl } from '@/lib/format';
import { fireWinConfetti } from '@/lib/confetti';

interface TransactionModalProps {
  open: boolean;
  status: TransactionStatus;
  title?: string;
  txSignature?: string;
  error?: string;
  onClose: () => void;
  onRetry?: () => void;
}

/* ─── CSS-only Loot Box ─── */

const particleVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: (i: number) => {
    const angle = (i / 10) * 360;
    const rad = (angle * Math.PI) / 180;
    const tx = Math.cos(rad) * 60;
    const ty = Math.sin(rad) * 60;
    return {
      scale: [0, 1.2, 0.5],
      opacity: [0, 1, 0],
      x: [0, tx],
      y: [0, ty],
      transition: { duration: 0.8, ease: 'easeOut' as Easing, delay: i * 0.04 },
    };
  },
};

function LootBox({ status }: { status: TransactionStatus }) {
  const isShaking = status === 'confirming';
  const isOpen = status === 'success';
  const isCracked = status === 'error';

  return (
    <motion.div
      animate={
        isShaking
          ? {
              x: [0, -3, 3, -4, 4, -5, 5, -3, 3, -1, 0],
              rotate: [0, -1, 1, -1.5, 1.5, -2, 2, -1, 1, 0, 0],
            }
          : { x: 0, rotate: 0 }
      }
      transition={isShaking ? { duration: 0.4, repeat: Infinity } : { type: 'spring' }}
      style={{ position: 'relative', width: 100, height: 100, margin: '0 auto' }}
    >
      {/* Golden glow behind (visible on success) */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0.6, 1, 0.6], scale: [1, 1.15, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: 120,
              height: 120,
              marginLeft: -60,
              marginTop: -60,
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,215,0,0.4) 0%, rgba(255,215,0,0) 70%)',
            }}
          />
        )}
      </AnimatePresence>

      {/* Red glow behind (visible on error) */}
      {isCracked && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 120,
            height: 120,
            marginLeft: -60,
            marginTop: -60,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(248,113,113,0.3) 0%, rgba(248,113,113,0) 70%)',
          }}
        />
      )}

      {/* Box lid */}
      <motion.div
        animate={
          isOpen
            ? { y: -22, rotate: -8, opacity: 0.8 }
            : isCracked
            ? { y: -2, rotate: 2, skewX: 5 }
            : { y: 0, rotate: 0, opacity: 1, skewX: 0 }
        }
        transition={
          isOpen
            ? { type: 'spring', stiffness: 200, damping: 15 }
            : isCracked
            ? { duration: 0.3, ease: 'easeOut' }
            : { type: 'spring' }
        }
        style={{ position: 'absolute', top: 0, left: 5, right: 5, transformOrigin: 'top center' }}
      >
        <Box
          sx={{
            height: 35,
            background: isCracked
              ? 'linear-gradient(180deg, #8B3A3A, #6B2A2A)'
              : 'linear-gradient(180deg, #D4A843, #B8922E)',
            borderRadius: '4px 4px 0 0',
            border: isCracked ? '1px solid #F8717140' : '1px solid #E8C55280',
            borderBottom: 'none',
            '&::after': {
              content: '""',
              position: 'absolute',
              top: 4,
              left: '20%',
              right: '20%',
              height: 3,
              borderRadius: 2,
              background: isCracked ? 'rgba(255,100,100,0.3)' : 'rgba(255,255,255,0.25)',
            },
          }}
        />
      </motion.div>

      {/* Box body */}
      <Box
        sx={{
          position: 'absolute',
          bottom: 5,
          left: 10,
          right: 10,
          height: 55,
          background: isCracked
            ? 'linear-gradient(180deg, #7A3030, #5A2020)'
            : 'linear-gradient(180deg, #C49A38, #A07D25)',
          borderRadius: '0 0 4px 4px',
          border: isCracked ? '1px solid #F8717130' : '1px solid #D4AA4080',
          borderTop: 'none',
          '&::before': {
            content: '""',
            position: 'absolute',
            top: -4,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 16,
            height: 8,
            borderRadius: '8px 8px 0 0',
            background: isCracked ? '#F8717150' : 'rgba(255,255,255,0.2)',
            border: isCracked ? '1px solid #F8717140' : '1px solid rgba(255,255,255,0.15)',
            borderBottom: 'none',
          },
          '&::after': {
            content: '""',
            position: 'absolute',
            top: '45%',
            left: 0,
            right: 0,
            height: 3,
            background: isCracked ? 'rgba(255,100,100,0.15)' : 'rgba(255,255,255,0.1)',
          },
        }}
      />

      {/* Success particles */}
      <AnimatePresence>
        {isOpen &&
          Array.from({ length: 10 }).map((_, i) => {
            const colors = ['#FFD700', '#FFA500', '#22C55E', '#FFFFFF', '#FFD700'];
            const color = colors[i % colors.length];
            const size = 4 + (i % 3) * 2;
            return (
              <motion.div
                key={i}
                custom={i}
                variants={particleVariants}
                initial="hidden"
                animate="visible"
                style={{
                  position: 'absolute',
                  top: '40%',
                  left: '50%',
                  width: size,
                  height: size,
                  borderRadius: i % 2 === 0 ? '50%' : '1px',
                  background: color,
                  marginLeft: -size / 2,
                  marginTop: -size / 2,
                }}
              />
            );
          })}
      </AnimatePresence>
    </motion.div>
  );
}

function StatusMessage({ status }: { status: TransactionStatus }) {
  switch (status) {
    case 'preparing':
      return 'Preparing your prediction...';
    case 'signing':
      return 'Sign to open...';
    case 'confirming':
      return 'Opening...';
    case 'success':
      return 'Prediction placed!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
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
          background: '#0D1219',
          border: 'none',
          borderRadius: 0,
          maxWidth: { xs: '95vw', sm: 440 },
          overflow: 'hidden',
        },
      }}
    >
      <DialogTitle
        sx={{
          textAlign: 'center',
          fontWeight: 500,
          pt: 4,
          pb: 0,
        }}
      >
        {title}
      </DialogTitle>
      <DialogContent>
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            py: 5,
          }}
        >
          <LootBox status={status} />

          <AnimatePresence mode="wait">
            <motion.div
              key={status}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <Typography
                variant="h6"
                sx={{
                  mt: 4,
                  textAlign: 'center',
                  fontWeight: 400,
                  color: status === 'error' ? 'error.main' : status === 'success' ? '#FFD700' : 'text.primary',
                }}
              >
                <StatusMessage status={status} />
              </Typography>
            </motion.div>
          </AnimatePresence>

          {error && (
            <Box
              sx={{
                mt: 2,
                p: 2,
                borderRadius: 0,
                background: 'rgba(255, 82, 82, 0.1)',
                border: 'none',
                maxWidth: '100%',
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: 'error.main', textAlign: 'center', wordBreak: 'break-word' }}
              >
                {error}
              </Typography>
            </Box>
          )}

          {txSignature && (
            <Link
              href={getExplorerTxUrl(txSignature)}
              target="_blank"
              rel="noopener noreferrer"
              sx={{
                mt: 3,
                color: '#FFFFFF',
                textDecoration: 'none',
                fontSize: '0.9rem',
                '&:hover': {
                  textDecoration: 'underline',
                },
              }}
            >
              View on Solana Explorer
            </Link>
          )}
        </Box>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 0, justifyContent: 'center', gap: 2 }}>
        {status === 'error' && onRetry && (
          <Button
            onClick={onRetry}
            variant="outlined"
            sx={{
              borderColor: 'rgba(255, 255, 255, 0.2)',
              color: 'text.primary',
              px: 4,
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.4)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
              },
            }}
          >
            Try Again
          </Button>
        )}
        {isComplete && (
          <Button
            onClick={onClose}
            variant="contained"
            sx={{
              px: 4,
              background: status === 'success'
                ? 'linear-gradient(135deg, #22C55E, #16A34A)'
                : 'rgba(255, 255, 255, 0.1)',
              color: status === 'success' ? '#000' : 'text.primary',
              '&:hover': {
                background: status === 'success'
                  ? 'linear-gradient(135deg, #22C55EDD, #16A34ADD)'
                  : 'rgba(255, 255, 255, 0.15)',
              },
            }}
          >
            {status === 'success' ? 'Done' : 'Close'}
          </Button>
        )}
        {isPending && (
          <Typography
            variant="caption"
            sx={{ color: 'text.secondary', fontWeight: 400 }}
          >
            Please don&apos;t close this window
          </Typography>
        )}
      </DialogActions>
    </Dialog>
  );
}
