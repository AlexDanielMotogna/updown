'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, Person, LocalFireDepartment, Star, Share } from '@mui/icons-material';
import { motion } from 'framer-motion';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR, INTERVAL_TAG_IMAGES, INTERVAL_LABELS, getBoxImage } from '@/lib/constants';
import { Countdown } from '../Countdown';

interface PoolRowProps {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN'; isWinner: boolean | null };
  getPrice: (a: string) => string | null;
  index: number;
  isNew?: boolean;
  isPopular?: boolean;
  alwaysShowView?: boolean;
}

export function PoolRow({
  pool,
  userBet,
  getPrice,
  index,
  isNew,
  isPopular,
  alwaysShowView,
}: PoolRowProps) {
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
              <Chip label={status === 'JOINING' ? 'LIVE' : status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.6rem', fontWeight: 600, borderRadius: '2px', mt: 0.5 }} />
            </Box>
          </Box>
        </Box>

        {/* Middle: countdown left, pool size right */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {endTimePassed ? (
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
          ) : (alwaysShowView || !pool.winner) ? (
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
          ) : (() => {
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
          })()}
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
        <Chip label={status === 'JOINING' ? 'LIVE' : status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px' }} />
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
        {endTimePassed ? (
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
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'center', justifyContent: 'flex-start', alignItems: 'center' }}>
        {canBet ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 70,
                px: 2,
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
        ) : (alwaysShowView || status === 'ACTIVE' || !pool.winner) ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 70,
                px: 2,
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
        ) : (() => {
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
        })()}
      </Box>

      {/* Share */}
      <Box
        component="button"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation();
          const url = `${window.location.origin}/pool/${pool.id}`;
          if (navigator.share) {
            navigator.share({ title: `${pool.asset} ${pool.interval} Pool`, url });
          } else {
            navigator.clipboard.writeText(url);
          }
        }}
        sx={{
          display: { xs: 'none', md: 'flex' },
          alignSelf: 'center', justifyContent: 'flex-start', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer', p: 0.5,
          borderRadius: '4px',
          color: 'rgba(255,255,255,0.25)',
          '&:hover': { color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(255,255,255,0.06)' },
          transition: 'all 0.15s ease',
        }}
      >
        <Share sx={{ fontSize: 15 }} />
      </Box>
    </Box>
    </motion.div>
  );
}
