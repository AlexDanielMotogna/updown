'use client';

import { useEffect, useState, useCallback, memo } from 'react';
import { Box, Typography, IconButton } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import CloseIcon from '@mui/icons-material/Close';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useRouter } from 'next/navigation';
import {
  useNotificationStore,
  MAX_VISIBLE,
  type Notification,
  type NotificationSeverity,
} from '@/stores/notificationStore';
import { AssetIcon } from './AssetIcon';
import { UserLevelBadge } from './UserLevelBadge';
import { GAIN_COLOR, ACCENT_COLOR, DOWN_COLOR } from '@/lib/constants';
import { fireWinConfetti, fireClaimConfetti } from '@/lib/confetti';

const BORDER_COLORS: Record<NotificationSeverity, string> = {
  success: GAIN_COLOR,
  info: ACCENT_COLOR,
  warning: ACCENT_COLOR,
  error: DOWN_COLOR,
};

function getSeverityIcon(severity: NotificationSeverity, type: string) {
  if (type === 'POOL_WON' || type === 'POOL_CLAIMABLE') return <EmojiEventsIcon sx={{ fontSize: 22, color: GAIN_COLOR }} />;
  if (type === 'CLAIM_SUCCESS' || type === 'REFUND_RECEIVED') return <Box component="img" src="/coins/usdc-coin.png" alt="USDC" sx={{ width: 22, height: 22 }} />;
  switch (severity) {
    case 'success':
      return <CheckCircleOutlineIcon sx={{ fontSize: 22, color: GAIN_COLOR }} />;
    case 'info':
      return <InfoOutlinedIcon sx={{ fontSize: 22, color: ACCENT_COLOR }} />;
    case 'warning':
      return <WarningAmberIcon sx={{ fontSize: 22, color: ACCENT_COLOR }} />;
    case 'error':
      return <ErrorOutlineIcon sx={{ fontSize: 22, color: DOWN_COLOR }} />;
  }
}

// ─── Single Toast ───────────────────────────────────────────────────────────

interface ToastItemProps {
  notification: Notification;
  onDismiss: (id: string) => void;
}

const ToastItem = memo(function ToastItem({ notification, onDismiss }: ToastItemProps) {
  const router = useRouter();
  const [progress, setProgress] = useState(100);

  // Fire confetti on win / claim / level-up toasts
  useEffect(() => {
    if (notification.type === 'POOL_WON') fireWinConfetti();
    else if (notification.type === 'CLAIM_SUCCESS') fireClaimConfetti();
    else if (notification.type === 'LEVEL_UP') fireWinConfetti();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Progress bar countdown
  useEffect(() => {
    const start = Date.now();
    const duration = notification.autoHideDuration;
    const tick = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      if (remaining > 0) {
        frame = requestAnimationFrame(tick);
      }
    };
    let frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [notification.autoHideDuration]);

  // Auto-dismiss
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(notification.id), notification.autoHideDuration);
    return () => clearTimeout(timer);
  }, [notification.id, notification.autoHideDuration, onDismiss]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDismiss(notification.id);
    },
    [notification.id, onDismiss],
  );

  const handleClick = useCallback(() => {
    if (notification.poolId) {
      router.push(`/pool/${notification.poolId}`);
      onDismiss(notification.id);
    }
  }, [notification.poolId, notification.id, onDismiss, router]);

  const borderColor = BORDER_COLORS[notification.severity];

  return (
    <motion.div
      layout
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <Box
        onClick={notification.poolId ? handleClick : undefined}
        sx={{
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
          p: 2,
          pr: 5,
          bgcolor: '#0D1219',
          borderLeft: `3px solid ${borderColor}`,
          borderRadius: '4px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          cursor: notification.poolId ? 'pointer' : 'default',
          overflow: 'hidden',
          minWidth: 320,
          maxWidth: 400,
          '&:hover': notification.poolId
            ? { bgcolor: '#111820' }
            : undefined,
          '@media (max-width: 600px)': {
            minWidth: 'unset',
            maxWidth: 'unset',
            width: '100%',
          },
        }}
      >
        {/* Icon */}
        <Box sx={{ pt: 0.25, flexShrink: 0 }}>
          {notification.type === 'LEVEL_UP' && notification.level ? (
            <UserLevelBadge level={notification.level} title="" size="sm" variant="icon-only" />
          ) : notification.type === 'COINS_EARNED' ? (
            <Box component="img" src="/token/Token_16px_Gold.png" alt="UP Coin" sx={{ width: 22, height: 22 }} />
          ) : notification.asset ? (
            <AssetIcon asset={notification.asset} size={22} />
          ) : (
            getSeverityIcon(notification.severity, notification.type)
          )}
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, color: '#fff', lineHeight: 1.3 }}
          >
            {notification.title}
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.4, display: 'block', mt: 0.25 }}
          >
            {notification.message}
          </Typography>
        </Box>

        {/* Close */}
        <IconButton
          onClick={handleClose}
          size="small"
          sx={{
            position: 'absolute',
            top: 6,
            right: 6,
            color: 'rgba(255,255,255,0.3)',
            '&:hover': { color: 'rgba(255,255,255,0.7)' },
          }}
        >
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>

        {/* Progress bar */}
        <Box
          sx={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            height: 2,
            width: `${progress}%`,
            bgcolor: borderColor,
            opacity: 0.5,
            transition: 'width 100ms linear',
          }}
        />
      </Box>
    </motion.div>
  );
});

// ─── Toast Stack ────────────────────────────────────────────────────────────

export function NotificationToasts() {
  const notifications = useNotificationStore((s) => s.notifications);
  const dismissToast = useNotificationStore((s) => s.dismissToast);

  // Show only toasts not yet hidden, up to MAX_VISIBLE
  const visible = notifications.filter((n) => !n.toastDismissed).slice(0, MAX_VISIBLE);

  if (visible.length === 0) return null;

  return (
    <Box
      sx={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 1300,
        display: 'flex',
        flexDirection: 'column-reverse',
        gap: 1,
        // Mobile: full width with padding
        '@media (max-width: 600px)': {
          left: 16,
          right: 16,
          bottom: 16,
        },
      }}
    >
      <AnimatePresence>
        {visible.map((n) => (
          <ToastItem key={n.id} notification={n} onDismiss={dismissToast} />
        ))}
      </AnimatePresence>
    </Box>
  );
}
