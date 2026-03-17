'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, Person, LocalFireDepartment, Star } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { Countdown } from './Countdown';

const INTERVAL_TAG_IMAGES: Record<string, string> = {
  '1m': '/assets/turbo-tag.png',
  '5m': '/assets/rapid-tag.png',
  '15m': '/assets/short-tag.png',
  '1h': '/assets/hourly-tag.png',
};

const INTERVAL_LABELS: Record<string, string> = {
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

// asset-interval specific boxes take priority, then asset-only fallback
const ASSET_INTERVAL_BOX_IMAGE: Record<string, string> = {
  'BTC-1m': '/boxes/Btc-1min.png',
  'BTC-5m': '/boxes/Btc-5min.png',
  'BTC-15m': '/boxes/Btc-15min.png',
  'BTC-1h': '/boxes/Btc-1h.png',
  'ETH-1m': '/boxes/Eth-1min.png',
  'ETH-5m': '/boxes/Eth-5min.png',
  'ETH-15m': '/boxes/Eth-15min.png',
  'ETH-1h': '/boxes/Eth-1h.png',
  'SOL-1m': '/boxes/Sol-1min.png',
  'SOL-5m': '/boxes/Sol-5min.png',
  'SOL-15m': '/boxes/Sol-15min.png',
  'SOL-1h': '/boxes/Sol-1h.png',
};

const ASSET_BOX_IMAGE: Record<string, string> = {
  BTC: '/boxes/Btc-box.png',
  ETH: '/boxes/Eth-box.png',
  SOL: '/boxes/Sol-box.png',
};

function getBoxImage(asset: string, interval: string): string | undefined {
  return ASSET_INTERVAL_BOX_IMAGE[`${asset}-${interval}`] ?? ASSET_BOX_IMAGE[asset];
}

interface PoolTableProps {
  pools: Pool[];
  userBetByPoolId: Map<string, { side: 'UP' | 'DOWN'; isWinner: boolean | null }>;
  getPrice: (asset: string) => string | null;
  isPlaceholderData?: boolean;
  popularPoolIds?: Set<string>;
}

function PriceCell({ asset, getPrice }: { asset: string; getPrice: (a: string) => string | null }) {
  const price = getPrice(asset);
  const prevPrice = useRef(price);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (price && prevPrice.current && price !== prevPrice.current) {
      setFlash(Number(price) > Number(prevPrice.current) ? 'up' : 'down');
      setPulseKey((k) => k + 1);
      const t = setTimeout(() => setFlash(null), 300);
      prevPrice.current = price;
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price]);

  if (!price) return <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>---</Typography>;

  return (
    <motion.span
      key={pulseKey}
      animate={{ scale: [1, 1.06, 1] }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      style={{ display: 'inline-block' }}
    >
      <Typography
        sx={{
          fontSize: '0.8rem',
          fontWeight: 500,
          fontVariantNumeric: 'tabular-nums',
          color: flash === 'up' ? UP_COLOR : flash === 'down' ? DOWN_COLOR : 'text.primary',
          transition: 'color 0.15s ease',
        }}
      >
        ${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </Typography>
    </motion.span>
  );
}

function PoolRow({
  pool,
  userBet,
  getPrice,
  index,
  isNew,
  isPopular,
}: {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN'; isWinner: boolean | null };
  getPrice: (a: string) => string | null;
  index: number;
  isNew?: boolean;
  isPopular?: boolean;
}) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;

  const totalUpUsd = totalUp / USDC_DIVISOR;
  const totalDownUsd = totalDown / USDC_DIVISOR;
  const totalUsd = totalUpUsd + totalDownUsd;
  const oddsUp = totalUpUsd > 0 && totalUsd > 0 ? (totalUsd / totalUpUsd).toFixed(1) : '';
  const oddsDown = totalDownUsd > 0 && totalUsd > 0 ? (totalUsd / totalDownUsd).toFixed(1) : '';

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
  const lockTimePassed = isJoining && new Date(pool.lockTime).getTime() <= Date.now();
  const endTimePassed = status === 'ACTIVE' && new Date(pool.endTime).getTime() <= Date.now();
  const canBet = isJoining && !lockTimePassed;
  const isHot = canBet && pool.betCount >= 5;

  const handleCountdownComplete = useCallback(() => {
    if (optimisticStatus === 'JOINING') {
      setOptimisticStatus('ACTIVE');
    } else if (optimisticStatus === 'ACTIVE') {
      setHidden(true);
    }
  }, [optimisticStatus]);

  // Hide immediately if endTime already passed on mount (e.g., page refresh)
  useEffect(() => {
    if (optimisticStatus === 'ACTIVE' && new Date(pool.endTime).getTime() <= Date.now()) {
      setHidden(true);
    }
  }, [optimisticStatus, pool.endTime]);

  const countdownTarget =
    status === 'JOINING' ? pool.lockTime :
    status === 'ACTIVE' ? pool.endTime :
    status === 'UPCOMING' ? pool.startTime :
    null;

  // If optimistically hidden, don't render
  if (hidden) return null;

  const boxImageUrl = getBoxImage(pool.asset, pool.interval);

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
        gridTemplateColumns: { md: '110px minmax(180px, 2fr) 110px 140px 100px 110px 60px 150px' },
        alignItems: 'stretch',
        pr: { xs: 0, md: 2 },
        pl: 0,
        py: 0,
        bgcolor: '#0D1219',
        transition: 'background 0.15s ease',
        '&:hover': {
          background: 'rgba(255,255,255,0.04)',
          '& .box-img': {
            transform: 'scale(1.08)',
            filter: 'brightness(1.15)',
          },
        },
      }}
    >
      {/* Box image  desktop only, first column */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 80,
          overflow: 'hidden',
        }}
      >
        {boxImageUrl ? (
          <Box
            component="img"
            className="box-img"
            src={boxImageUrl}
            alt={`${pool.asset} box`}
            sx={{
              position: 'absolute',
              top: '4px',
              left: '4px',
              width: 'calc(100% - 8px)',
              height: 'calc(100% - 8px)',
              objectFit: 'contain',
              transition: 'transform 0.2s ease, filter 0.2s ease',
            }}
          />
        ) : (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              bgcolor: 'rgba(255,255,255,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{pool.asset}</Typography>
          </Box>
        )}
      </Box>

      {/* Mobile card layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
        {/* Header: asset icon, name, interval, hot badge, status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {boxImageUrl ? (
              <Box
                component="img"
                src={boxImageUrl}
                alt={`${pool.asset} box`}
                sx={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
              />
            ) : (
              <Box sx={{ width: 40, height: 40, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', flexShrink: 0 }}>
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>{pool.asset}</Typography>
              </Box>
            )}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{pool.asset}/USD</Typography>
                </Link>
                <Box
                  component="img"
                  src={INTERVAL_TAG_IMAGES[pool.interval] || '/assets/hourly-tag.png'}
                  alt={INTERVAL_LABELS[pool.interval] || pool.interval}
                  sx={{ height: { xs: 36, md: 42 }, imageRendering: '-webkit-optimize-contrast' }}
                />
                {isHot && (
                  <Chip
                    icon={<LocalFireDepartment sx={{ fontSize: 12 }} />}
                    label="HOT"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: `${ACCENT_COLOR}20`,
                      color: ACCENT_COLOR,
                      borderRadius: '2px',
                      '& .MuiChip-icon': { color: ACCENT_COLOR },
                      animation: 'hotPulse 2s infinite',
                      '@keyframes hotPulse': {
                        '0%, 100%': { boxShadow: `0 0 4px ${ACCENT_COLOR}40` },
                        '50%': { boxShadow: `0 0 8px ${ACCENT_COLOR}60` },
                      },
                    }}
                  />
                )}
                {isPopular && (
                  <Chip
                    icon={<Star sx={{ fontSize: 12 }} />}
                    label="POPULAR"
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.6rem',
                      fontWeight: 700,
                      bgcolor: '#F59E0B20',
                      color: '#F59E0B',
                      borderRadius: '2px',
                      '& .MuiChip-icon': { color: '#F59E0B' },
                    }}
                  />
                )}
              </Box>
              <Chip label={status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.6rem', fontWeight: 600, borderRadius: '2px', mt: 0.5 }} />
            </Box>
          </Box>
        </Box>

        {/* Middle: countdown left, pool size right */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {lockTimePassed ? (
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Locking...</Typography>
            ) : endTimePassed ? (
              <Typography sx={{ fontSize: '0.8rem', color: '#FBBF24', fontStyle: 'italic' }}>Resolving...</Typography>
            ) : countdownTarget ? (
              <Countdown targetDate={countdownTarget} compact onComplete={handleCountdownComplete} />
            ) : (
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Ended</Typography>
            )}
          </Box>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR }}>
            Pool: {formatUSDC(pool.totalPool)}
          </Typography>
        </Box>

        {/* Distribution bar + player count */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
            <Typography sx={{ fontSize: '0.7rem', color: UP_COLOR, fontWeight: 500 }}>{upPct}%</Typography>
            <LinearProgress
              variant="determinate"
              value={upPct}
              sx={{
                flex: 1,
                height: 6,
                borderRadius: 1,
                bgcolor: `${DOWN_COLOR}40`,
                '& .MuiLinearProgress-bar': { bgcolor: UP_COLOR, borderRadius: 1 },
                ...(canBet && {
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.15) 50%, transparent 100%)',
                    animation: 'shimmer 2s infinite',
                    '@keyframes shimmer': {
                      from: { transform: 'translateX(-100%)' },
                      to: { transform: 'translateX(100%)' },
                    },
                  },
                }),
              }}
            />
            <Typography sx={{ fontSize: '0.7rem', color: DOWN_COLOR, fontWeight: 500 }}>{downPct}%</Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
            <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{pool.betCount}</Typography>
          </Box>
        </Box>

        {/* Action button */}
        <Box sx={{ pt: 1.5 }}>
          {canBet ? (
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 1,
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  bgcolor: UP_COLOR,
                  color: '#000',
                  borderRadius: '2px',
                  textTransform: 'none',
                  minHeight: 44,
                  '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                }}
              >
                Join Pool
              </Button>
            </Link>
          ) : status === 'ACTIVE' ? (
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 1,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderRadius: '2px',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  textTransform: 'none',
                  minHeight: 44,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
                }}
              >
                View
              </Button>
            </Link>
          ) : pool.winner ? (() => {
            const isRefund = Number(pool.totalUp) === 0 || Number(pool.totalDown) === 0;
            return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Chip
                icon={pool.winner === 'UP' ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
                label={isRefund ? 'REFUNDED' : `${pool.winner} WINS`}
                size="small"
                sx={{
                  bgcolor: isRefund ? `${ACCENT_COLOR}15` : pool.winner === 'UP' ? `${UP_COLOR}15` : `${DOWN_COLOR}15`,
                  color: isRefund ? ACCENT_COLOR : pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR,
                  fontWeight: 600,
                  fontSize: '0.7rem',
                  borderRadius: '2px',
                  '& .MuiChip-icon': { color: 'inherit' },
                }}
              />
              {userBet && (
                <Chip
                  label={userBet.isWinner === true ? 'WON' : userBet.isWinner === false ? 'LOST' : 'PENDING'}
                  size="small"
                  sx={{
                    bgcolor: userBet.isWinner === true ? `${GAIN_COLOR}15` : userBet.isWinner === false ? `${DOWN_COLOR}15` : 'rgba(255,255,255,0.06)',
                    color: userBet.isWinner === true ? GAIN_COLOR : userBet.isWinner === false ? DOWN_COLOR : 'text.secondary',
                    fontWeight: 600,
                    fontSize: '0.65rem',
                    borderRadius: '2px',
                  }}
                />
              )}
              <Link href={`/pool/${pool.id}`} style={{ marginLeft: 'auto', textDecoration: 'none' }}>
                <Button
                  size="small"
                  sx={{
                    py: 1,
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: 'text.secondary',
                    borderRadius: '2px',
                    bgcolor: 'rgba(255,255,255,0.06)',
                    textTransform: 'none',
                    minHeight: 44,
                    minWidth: 44,
                    px: 2,
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
                  }}
                >
                  View
                </Button>
              </Link>
            </Box>
            );
          })() : (
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 1,
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: 'text.secondary',
                  borderRadius: '2px',
                  bgcolor: 'rgba(255,255,255,0.06)',
                  textTransform: 'none',
                  minHeight: 44,
                  '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
                }}
              >
                View
              </Button>
            </Link>
          )}
        </Box>
      </Box>

      {/* Desktop layout */}
      {/* Asset */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', justifyContent: 'flex-start', gap: 0.75, flexWrap: 'nowrap', overflow: 'hidden', pl: 1.5, height: '100%' }}>
        <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}>
            {pool.asset}/USD
          </Typography>
        </Link>
        <Box
          component="img"
          src={INTERVAL_TAG_IMAGES[pool.interval] || '/assets/hourly-tag.png'}
          alt={INTERVAL_LABELS[pool.interval] || pool.interval}
          sx={{ height: { xs: 36, md: 42 }, imageRendering: '-webkit-optimize-contrast' }}
        />
        <Chip label={status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px' }} />
        {isHot && (
          <Chip
            icon={<LocalFireDepartment sx={{ fontSize: 11 }} />}
            label="HOT"
            size="small"
            sx={{
              height: 18,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: `${ACCENT_COLOR}20`,
              color: ACCENT_COLOR,
              borderRadius: '2px',
              '& .MuiChip-icon': { color: ACCENT_COLOR },
              animation: 'hotPulse 2s infinite',
            }}
          />
        )}
        {isPopular && (
          <Chip
            icon={<Star sx={{ fontSize: 11 }} />}
            label="POPULAR"
            size="small"
            sx={{
              height: 18,
              fontSize: '0.55rem',
              fontWeight: 700,
              bgcolor: '#F59E0B20',
              color: '#F59E0B',
              borderRadius: '2px',
              '& .MuiChip-icon': { color: '#F59E0B' },
            }}
          />
        )}
      </Box>

      {/* Countdown */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {lockTimePassed ? (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Locking...</Typography>
        ) : endTimePassed ? (
          <Typography sx={{ fontSize: '0.8rem', color: '#FBBF24', fontStyle: 'italic' }}>Resolving...</Typography>
        ) : countdownTarget ? (
          <Countdown targetDate={countdownTarget} compact onComplete={handleCountdownComplete} />
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Ended</Typography>
        )}
      </Box>

      {/* Distribution */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: '0.7rem', color: UP_COLOR, fontWeight: 500, minWidth: 28 }}>{upPct}%</Typography>
        <LinearProgress
          variant="determinate"
          value={upPct}
          sx={{
            width: 50,
            height: 6,
            borderRadius: 1,
            bgcolor: `${DOWN_COLOR}40`,
            '& .MuiLinearProgress-bar': { bgcolor: UP_COLOR, borderRadius: 1 },
            position: 'relative',
            overflow: 'hidden',
            ...(canBet && {
              '&::after': {
                content: '""',
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)',
                animation: 'shimmer 2s infinite',
              },
            }),
          }}
        />
        <Typography sx={{ fontSize: '0.7rem', color: DOWN_COLOR, fontWeight: 500, minWidth: 28 }}>{downPct}%</Typography>
      </Box>

      {/* Pool Size */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR }}>
          {formatUSDC(pool.totalPool)}
        </Typography>
      </Box>

      {/* Odds */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          <Box component="span" sx={{ color: UP_COLOR, fontWeight: 500 }}>{oddsUp}x</Box>
          {' / '}
          <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{oddsDown}x</Box>
        </Typography>
      </Box>

      {/* Players */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', gap: 0.5 }}>
        <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{pool.betCount}</Typography>
      </Box>

      {/* Action */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'center', gap: 0.75 }}>
        {canBet ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 80,
                px: 2.5,
                py: 0.75,
                fontSize: '0.75rem',
                fontWeight: 700,
                bgcolor: UP_COLOR,
                color: '#000',
                borderRadius: '2px',
                textTransform: 'none',
                '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
              }}
            >
              Join
            </Button>
          </Link>
        ) : status === 'ACTIVE' ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 80,
                px: 2.5,
                py: 0.75,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'text.secondary',
                borderRadius: '2px',
                bgcolor: 'rgba(255,255,255,0.06)',
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
              }}
            >
              View
            </Button>
          </Link>
        ) : pool.winner ? (() => {
          const isRefund = Number(pool.totalUp) === 0 || Number(pool.totalDown) === 0;
          return (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={isRefund ? 'REFUNDED' : `${pool.winner} WINS`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                borderRadius: '2px',
                bgcolor: isRefund ? `${ACCENT_COLOR}15` : pool.winner === 'UP' ? `${UP_COLOR}15` : `${DOWN_COLOR}15`,
                color: isRefund ? ACCENT_COLOR : pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR,
              }}
            />
            {userBet && !isRefund && (
              <Chip
                label={userBet.isWinner === true ? 'WON' : userBet.isWinner === false ? 'LOST' : '...'}
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.55rem',
                  fontWeight: 600,
                  borderRadius: '2px',
                  bgcolor: userBet.isWinner === true ? `${GAIN_COLOR}15` : userBet.isWinner === false ? `${DOWN_COLOR}15` : 'rgba(255,255,255,0.06)',
                  color: userBet.isWinner === true ? GAIN_COLOR : userBet.isWinner === false ? DOWN_COLOR : 'text.secondary',
                }}
              />
            )}
          </Box>
          );
        })() : (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 80,
                px: 2.5,
                py: 0.75,
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'text.secondary',
                borderRadius: '2px',
                bgcolor: 'rgba(255,255,255,0.06)',
                textTransform: 'none',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
              }}
            >
              View
            </Button>
          </Link>
        )}
      </Box>
    </Box>
    </motion.div>
  );
}

export function PoolTable({ pools, userBetByPoolId, getPrice, isPlaceholderData, popularPoolIds }: PoolTableProps) {
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const freshIds = new Set<string>();
    for (const pool of pools) {
      if (!knownIdsRef.current.has(pool.id)) {
        freshIds.add(pool.id);
        knownIdsRef.current.add(pool.id);
      }
    }
    // Only animate if 1-3 new pools trickle in (WebSocket),
    // not bulk loads (page load, tab switch)
    if (freshIds.size > 0 && freshIds.size <= 3) {
      setNewIds(freshIds);
      const t = setTimeout(() => setNewIds(new Set()), 2800);
      return () => clearTimeout(t);
    }
  }, [pools]);

  return (
    <Box
      sx={{
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        opacity: isPlaceholderData ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Table header (desktop only) */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '110px minmax(180px, 2fr) 110px 140px 100px 110px 60px 150px',
          pr: 2,
          pl: 0,
          py: 1,
          bgcolor: '#0D1219',
        }}
      >
        {['', 'Asset', 'Countdown', 'Distribution', 'Pool Size', 'Odds', 'Players', 'Action'].map((h, i) => (
          <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h}
          </Typography>
        ))}
      </Box>

      {/* Rows */}
      <AnimatePresence mode="popLayout">
        {pools.map((pool, i) => (
          <PoolRow
            key={pool.id}
            pool={pool}
            userBet={userBetByPoolId.get(pool.id)}
            getPrice={getPrice}
            index={i}
            isNew={newIds.has(pool.id)}
            isPopular={popularPoolIds?.has(pool.id)}
          />
        ))}
      </AnimatePresence>

      {pools.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
          <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
            No pools found with current filters
          </Typography>
        </Box>
      )}
    </Box>
  );
}
