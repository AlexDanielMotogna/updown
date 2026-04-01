'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { motion } from 'framer-motion';
import type { Pool } from '@/lib/api';
import { statusStyles } from '@/lib/format';
import { getBoxImage } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { PoolRowMobile } from './PoolRowMobile';
import { PoolRowDesktop } from './PoolRowDesktop';

interface PoolRowProps {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null };
  getPrice: (a: string) => string | null;
  index: number;
  isNew?: boolean;
  isPopular?: boolean;
  alwaysShowView?: boolean;
  onClick?: () => void;
}

export function PoolRow({
  pool,
  userBet,
  getPrice,
  index,
  isNew,
  isPopular,
  alwaysShowView,
  onClick,
}: PoolRowProps) {
  const t = useThemeTokens();

  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;

  // --- Optimistic status transitions ---
  const [optimisticStatus, setOptimisticStatus] = useState<string>(pool.status);
  const [hidden, setHidden] = useState(false);

  // Sync optimistic state with server, but never un-hide a resolved pool
  useEffect(() => {
    setOptimisticStatus(pool.status);
    // Only un-hide if pool moved to a genuinely new state (e.g., new JOINING pool reusing slot)
    if (pool.status === 'JOINING' || pool.status === 'UPCOMING') {
      setHidden(false);
    }
  }, [pool.status]);

  // Use optimistic status for all rendering decisions
  const status = optimisticStatus;
  const statusStyle = statusStyles[status] || statusStyles.UPCOMING;
  const isJoining = status === 'JOINING';
  const endTimePassed = isJoining && new Date(pool.endTime).getTime() <= Date.now();
  const canBet = isJoining && !endTimePassed;
  const isHot = canBet && pool.betCount >= 5;

  const handleCountdownComplete = useCallback(() => {
    // Pool ended — hide from list (will be resolved server-side)
    setHidden(true);
  }, []);

  // Hide immediately if endTime already passed on mount (e.g., page refresh)
  useEffect(() => {
    if (isJoining && new Date(pool.endTime).getTime() <= Date.now()) {
      setHidden(true);
    }
  }, [isJoining, pool.endTime]);

  const countdownTarget =
    status === 'JOINING' ? pool.endTime :
    status === 'ACTIVE' ? pool.endTime :
    status === 'UPCOMING' ? pool.startTime :
    null;

  // If optimistically hidden, don't render
  if (hidden) return null;

  const boxImageUrl = getBoxImage(pool.asset, pool.interval);

  const sharedProps = {
    pool,
    userBet,
    status,
    statusStyle,
    isJoining,
    endTimePassed,
    canBet,
    isHot,
    isPopular,
    alwaysShowView,
    onClick,
    upPct,
    downPct,
    countdownTarget,
    handleCountdownComplete,
    boxImageUrl,
  };

  return (
    <motion.div
      initial={isNew ? { opacity: 0, y: 10 } : false}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isNew ? index * 0.05 : 0 }}
      layout
    >
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: { xs: 'block', md: 'grid' },
        gridTemplateColumns: { md: '100px 2fr 1fr 1fr 1fr 1fr 0.7fr 1fr 0.4fr' },
        alignItems: 'stretch',
        pr: { xs: 0, md: 2 },
        pl: 0,
        py: 0,
        bgcolor: t.bg.surfaceAlt,
        border: t.surfaceBorder,
        boxShadow: t.surfaceShadow,
        borderRadius: 1.5,
        transition: 'background 0.15s ease',
        '&:hover': {
          background: t.hover.default,
          '& .box-img': {
            transform: 'scale(1.08)',
            filter: 'brightness(1.15)',
          },
        },
      }}
    >
      {/* Mobile card layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <PoolRowMobile {...sharedProps} />
      </Box>

      {/* Desktop grid cells */}
      <PoolRowDesktop {...sharedProps} />
    </Box>
    </motion.div>
  );
}
