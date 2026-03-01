'use client';

import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, Person, LocalFireDepartment } from '@mui/icons-material';
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

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;
  const isJoining = pool.status === 'JOINING';
  const lockTimePassed = isJoining && new Date(pool.lockTime).getTime() <= Date.now();
  const canBet = isJoining && !lockTimePassed;
  const isHot = canBet && pool.betCount >= 5;

  const borderColor = userBet
    ? userBet.isWinner === true
      ? GAIN_COLOR
      : userBet.isWinner === false
        ? DOWN_COLOR
        : 'rgba(255,255,255,0.3)'
    : canBet
      ? `${UP_COLOR}40`
      : pool.status === 'ACTIVE'
        ? `${ACCENT_COLOR}40`
        : 'transparent';

  const countdownTarget =
    pool.status === 'JOINING' ? pool.lockTime :
    pool.status === 'ACTIVE' ? pool.endTime :
    pool.status === 'UPCOMING' ? pool.startTime :
    null;

  const assetIconUrl = `https://app.pacifica.fi/imgs/tokens/${pool.asset}.svg`;

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 2fr) 110px 140px 100px 110px 60px 150px' },
        gap: { xs: 1, md: 0 },
        alignItems: 'center',
        px: 2,
        py: { xs: 1.5, md: 1.25 },
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        borderLeft: `3px solid ${borderColor}`,
        transition: 'background 0.15s ease',
        animation: 'fadeSlideUp 0.3s ease both',
        '@keyframes fadeSlideUp': {
          from: { opacity: 0, transform: 'translateY(6px)' },
          to: { opacity: 1, transform: 'translateY(0)' },
        },
        '&:hover': {
          background: 'rgba(255,255,255,0.02)',
          '& .row-bg-icon': {
            opacity: 0.45,
          },
        },
      }}
    >
      {/* Background asset icon — faded flag effect */}
      <Box
        className="row-bg-icon"
        sx={{
          position: 'absolute',
          top: 0,
          left: -20,
          width: '30%',
          height: '100%',
          pointerEvents: 'none',
          opacity: 0.35,
          transition: 'opacity 0.3s ease',
          maskImage: 'linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.3) 70%, transparent 100%)',
          backgroundImage: `url(${assetIconUrl})`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center left',
          backgroundSize: '61px 61px',
        }}
      />

      {/* Mobile layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        {/* Row 1: Asset, interval, status, countdown */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{pool.asset}/USD</Typography>
            </Link>
            <Chip
              label={INTERVAL_LABELS[pool.interval] || pool.interval}
              size="small"
              sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }}
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
            ) : countdownTarget ? (
              <Countdown targetDate={countdownTarget} compact />
            ) : null}
            <Chip label={pool.status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.6rem', fontWeight: 600 }} />
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
            <Link href={`/pool/${pool.id}?side=UP`} style={{ flex: 1, textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                startIcon={<TrendingUp sx={{ fontSize: 16 }} />}
                sx={{
                  py: 0.75,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  bgcolor: `${UP_COLOR}15`,
                  color: UP_COLOR,
                  border: `1px solid ${UP_COLOR}30`,
                  '&:hover': { bgcolor: `${UP_COLOR}25` },
                }}
              >
                UP {oddsUp}x
              </Button>
            </Link>
            <Link href={`/pool/${pool.id}?side=DOWN`} style={{ flex: 1, textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                startIcon={<TrendingDown sx={{ fontSize: 16 }} />}
                sx={{
                  py: 0.75,
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  bgcolor: `${DOWN_COLOR}15`,
                  color: DOWN_COLOR,
                  border: `1px solid ${DOWN_COLOR}30`,
                  '&:hover': { bgcolor: `${DOWN_COLOR}25` },
                }}
              >
                DOWN {oddsDown}x
              </Button>
            </Link>
          </Box>
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
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.75, flexWrap: 'wrap', overflow: 'hidden' }}>
        <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}>
            {pool.asset}/USD
          </Typography>
        </Link>
        <Chip
          label={INTERVAL_LABELS[pool.interval] || pool.interval}
          size="small"
          sx={{ height: 20, fontSize: '0.6rem', bgcolor: 'rgba(255,255,255,0.06)', color: 'text.secondary' }}
        />
        <Chip label={pool.status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.55rem', fontWeight: 600 }} />
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
              '& .MuiChip-icon': { color: ACCENT_COLOR },
              animation: 'hotPulse 2s infinite',
            }}
          />
        )}
      </Box>

      {/* Countdown */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        {lockTimePassed ? (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontStyle: 'italic' }}>Locking...</Typography>
        ) : countdownTarget ? (
          <Countdown targetDate={countdownTarget} compact />
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Ended</Typography>
        )}
      </Box>

      {/* Distribution */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
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
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR }}>
          {formatUSDC(pool.totalPool)}
        </Typography>
      </Box>

      {/* Odds */}
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>
        <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          <Box component="span" sx={{ color: UP_COLOR, fontWeight: 500 }}>{oddsUp}x</Box>
          {' / '}
          <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{oddsDown}x</Box>
        </Typography>
      </Box>

      {/* Players */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 0.5 }}>
        <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{pool.betCount}</Typography>
      </Box>

      {/* Action */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: 0.75 }}>
        {canBet ? (
          <>
            <Link href={`/pool/${pool.id}?side=UP`} style={{ textDecoration: 'none' }}>
              <Button
                size="small"
                sx={{
                  minWidth: 0,
                  px: 1.25,
                  py: 0.5,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: `${UP_COLOR}15`,
                  color: UP_COLOR,
                  border: `1px solid ${UP_COLOR}30`,
                  '&:hover': { bgcolor: `${UP_COLOR}25` },
                }}
              >
                UP
              </Button>
            </Link>
            <Link href={`/pool/${pool.id}?side=DOWN`} style={{ textDecoration: 'none' }}>
              <Button
                size="small"
                sx={{
                  minWidth: 0,
                  px: 1.25,
                  py: 0.5,
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  bgcolor: `${DOWN_COLOR}15`,
                  color: DOWN_COLOR,
                  border: `1px solid ${DOWN_COLOR}30`,
                  '&:hover': { bgcolor: `${DOWN_COLOR}25` },
                }}
              >
                DOWN
              </Button>
            </Link>
          </>
        ) : pool.winner ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Chip
              label={`${pool.winner} WINS`}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.6rem',
                fontWeight: 600,
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
                  bgcolor: userBet.isWinner === true ? `${GAIN_COLOR}15` : userBet.isWinner === false ? `${DOWN_COLOR}15` : 'rgba(255,255,255,0.06)',
                  color: userBet.isWinner === true ? GAIN_COLOR : userBet.isWinner === false ? DOWN_COLOR : 'text.secondary',
                }}
              />
            )}
          </Box>
        ) : (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button size="small" sx={{ minWidth: 0, px: 1, fontSize: '0.7rem', color: 'text.secondary' }}>
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
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 1,
        overflow: 'hidden',
        opacity: isPlaceholderData ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Table header (desktop only) */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: 'minmax(240px, 2fr) 110px 140px 100px 110px 60px 150px',
          px: 2,
          py: 1,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          bgcolor: 'rgba(255,255,255,0.02)',
        }}
      >
        {['Asset', 'Countdown', 'Distribution', 'Pool Size', 'Odds', 'Players', 'Action'].map((h) => (
          <Typography key={h} variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h.toUpperCase()}
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
