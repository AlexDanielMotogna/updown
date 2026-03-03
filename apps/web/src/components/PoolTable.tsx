'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, Person, LocalFireDepartment } from '@mui/icons-material';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { Countdown } from './Countdown';

const INTERVAL_LABELS: Record<string, string> = {
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

const ASSET_BOX_IMAGE: Record<string, string> = {
  BTC: '/boxes/Btc-box.png',
  ETH: '/boxes/Eth-box.png',
  SOL: '/boxes/Sol-box.png',
};

interface PoolTableProps {
  pools: Pool[];
  userBetByPoolId: Map<string, { side: 'UP' | 'DOWN'; isWinner: boolean | null }>;
  getPrice: (asset: string) => string | null;
  isPlaceholderData?: boolean;
}

function PriceCell({ asset, getPrice }: { asset: string; getPrice: (a: string) => string | null }) {
  const price = getPrice(asset);
  const prevPrice = useRef(price);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (price && prevPrice.current && price !== prevPrice.current) {
      setFlash(Number(price) > Number(prevPrice.current) ? 'up' : 'down');
      const t = setTimeout(() => setFlash(null), 300);
      prevPrice.current = price;
      return () => clearTimeout(t);
    }
    prevPrice.current = price;
  }, [price]);

  if (!price) return <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>---</Typography>;

  return (
    <Typography
      sx={{
        fontSize: '0.8rem',
        fontWeight: 500,
        fontVariantNumeric: 'tabular-nums',
        transition: 'color 0.15s ease',
        color: flash === 'up' ? UP_COLOR : flash === 'down' ? DOWN_COLOR : 'text.primary',
      }}
    >
      ${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </Typography>
  );
}

function PoolRow({
  pool,
  userBet,
  getPrice,
  index,
}: {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN'; isWinner: boolean | null };
  getPrice: (a: string) => string | null;
  index: number;
}) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;

  const totalUpUsd = totalUp / USDC_DIVISOR;
  const totalDownUsd = totalDown / USDC_DIVISOR;
  const totalUsd = totalUpUsd + totalDownUsd;
  const oddsUp = totalUpUsd > 0 && totalUsd > 0 ? (totalUsd / totalUpUsd).toFixed(1) : '—';
  const oddsDown = totalDownUsd > 0 && totalUsd > 0 ? (totalUsd / totalDownUsd).toFixed(1) : '—';

  const queryClient = useQueryClient();

  // --- Optimistic status transitions ---
  const [optimisticStatus, setOptimisticStatus] = useState<string>(pool.status);
  const [hidden, setHidden] = useState(false);

  // Reset optimistic state when real server data arrives
  useEffect(() => {
    setOptimisticStatus(pool.status);
    setHidden(false);
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
      // Instantly show as ACTIVE — countdown switches to endTime
      setOptimisticStatus('ACTIVE');
    } else if (optimisticStatus === 'ACTIVE') {
      // Instantly hide the row — pool is resolving
      setHidden(true);
    }
    // Safety net: still refetch after delay so cache stays consistent
    setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: ['infinitePools'] });
    }, 3000);
  }, [queryClient, optimisticStatus]);

  const countdownTarget =
    status === 'JOINING' ? pool.lockTime :
    status === 'ACTIVE' ? pool.endTime :
    status === 'UPCOMING' ? pool.startTime :
    null;

  // If optimistically hidden, don't render
  if (hidden) return null;

  const boxImageUrl = ASSET_BOX_IMAGE[pool.asset];

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: { xs: '80px 1fr', md: '110px minmax(180px, 2fr) 110px 140px 100px 110px 60px 150px' },
        gap: { xs: 0, md: 0 },
        alignItems: 'stretch',
        pr: 2,
        pl: 0,
        py: 0,
        bgcolor: '#0D1219',
        transition: 'background 0.15s ease',
        animation: 'fadeSlideUp 2.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        '@keyframes fadeSlideUp': {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '&:hover': {
          background: 'rgba(255,255,255,0.04)',
          '& .box-img': {
            transform: 'scale(1.08)',
            filter: 'brightness(1.15)',
          },
        },
      }}
    >
      {/* Box image — first column, fills entire cell */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: { xs: 70, md: 80 },
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

      {/* Mobile layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, py: 1.5, pl: 1 }}>
        {/* Row 1: Asset, interval, status, countdown */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{pool.asset}/USD</Typography>
            </Link>
            <Chip
              label={INTERVAL_LABELS[pool.interval] || pool.interval}
              size="small"
              sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary', borderRadius: '2px' }}
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
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {lockTimePassed ? (
              <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Locking...</Typography>
            ) : endTimePassed ? (
              <Typography sx={{ fontSize: '0.8rem', color: '#FBBF24', fontStyle: 'italic' }}>Resolving...</Typography>
            ) : countdownTarget ? (
              <Countdown targetDate={countdownTarget} compact onComplete={handleCountdownComplete} />
            ) : null}
            <Chip label={status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.6rem', fontWeight: 600, borderRadius: '2px' }} />
          </Box>
        </Box>

        {/* Row 2: Distribution bar, pool size, players */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
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
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: GAIN_COLOR }}>
            {formatUSDC(pool.totalPool)}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
            <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{pool.betCount}</Typography>
          </Box>
        </Box>

        {/* Row 3: Action buttons */}
        {canBet ? (
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Link href={`/pool/${pool.id}`} style={{ flex: 1, textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 0.75,
                  fontSize: '0.8rem',
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
          </Box>
        ) : status === 'ACTIVE' ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                fontSize: '0.8rem',
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
        ) : pool.winner ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              icon={pool.winner === 'UP' ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
              label={`${pool.winner} WINS`}
              size="small"
              sx={{
                bgcolor: pool.winner === 'UP' ? `${UP_COLOR}15` : `${DOWN_COLOR}15`,
                color: pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR,
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
              <Button size="small" sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 0, px: 1 }}>
                View
              </Button>
            </Link>
          </Box>
        ) : (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button size="small" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              View Details
            </Button>
          </Link>
        )}
      </Box>

      {/* Desktop layout */}
      {/* Asset */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', gap: 0.75, flexWrap: 'wrap', overflow: 'hidden', pl: 1.5 }}>
        <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}>
            {pool.asset}/USD
          </Typography>
        </Link>
        <Chip
          label={INTERVAL_LABELS[pool.interval] || pool.interval}
          size="small"
          sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary', borderRadius: '2px' }}
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
                minWidth: 0,
                px: 2.5,
                py: 0.5,
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
                minWidth: 0,
                px: 2,
                py: 0.5,
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
        ) : pool.winner ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${pool.winner} WINS`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
                borderRadius: '2px',
                bgcolor: pool.winner === 'UP' ? `${UP_COLOR}15` : `${DOWN_COLOR}15`,
                color: pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR,
              }}
            />
            {userBet && (
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
        ) : (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button size="small" sx={{ minWidth: 0, px: 1, fontSize: '0.7rem', color: 'text.secondary', borderRadius: '2px' }}>
              View
            </Button>
          </Link>
        )}
      </Box>
    </Box>
  );
}

export function PoolTable({ pools, userBetByPoolId, getPrice, isPlaceholderData }: PoolTableProps) {
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
          <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h}
          </Typography>
        ))}
      </Box>

      {/* Rows */}
      {pools.map((pool, i) => (
        <PoolRow
          key={pool.id}
          pool={pool}
          userBet={userBetByPoolId.get(pool.id)}
          getPrice={getPrice}
          index={i}
        />
      ))}

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
