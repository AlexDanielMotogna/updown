'use client';

import React from 'react';
import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { Person, LocalFireDepartment, Star, Share } from '@mui/icons-material';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { Countdown } from '../Countdown';

export interface PoolRowDesktopProps {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null };
  status: string;
  statusStyle: Record<string, unknown>;
  isJoining: boolean;
  endTimePassed: boolean;
  canBet: boolean;
  isHot: boolean;
  isPopular?: boolean;
  alwaysShowView?: boolean;
  upPct: number;
  downPct: number;
  countdownTarget: string | null;
  handleCountdownComplete: () => void;
  boxImageUrl: string | undefined;
  onClick?: () => void;
}

export function PoolRowDesktop({
  pool,
  userBet,
  status,
  statusStyle,
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
}: PoolRowDesktopProps) {
  const t = useThemeTokens();

  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const totalUpUsd = totalUp / USDC_DIVISOR;
  const totalDownUsd = totalDown / USDC_DIVISOR;
  const totalUsd = totalUpUsd + totalDownUsd;
  const oddsUp = totalUpUsd > 0 && totalUsd > 0 ? (totalUsd / totalUpUsd).toFixed(1) : '';
  const oddsDown = totalDownUsd > 0 && totalUsd > 0 ? (totalUsd / totalDownUsd).toFixed(1) : '';

  return (
    <>
      {/* Box image - first column */}
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

      {/* Asset */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', justifyContent: 'flex-start', gap: 0.75, flexWrap: 'nowrap', overflow: 'hidden', pl: 1.5, height: '100%' }}>
        <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', '&:hover': { color: t.text.bright } }}>
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
              bgcolor: withAlpha(t.accent, 0.13),
              color: t.accent,
              borderRadius: '2px',
              '& .MuiChip-icon': { color: t.accent },
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
              bgcolor: withAlpha(t.accent, 0.13),
              color: t.accent,
              borderRadius: '2px',
              '& .MuiChip-icon': { color: t.accent },
            }}
          />
        )}
      </Box>

      {/* Countdown */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {endTimePassed ? (
          <Typography sx={{ fontSize: '0.8rem', color: t.draw, fontStyle: 'italic' }}>Resolving...</Typography>
        ) : countdownTarget ? (
          <Countdown targetDate={countdownTarget} compact onComplete={handleCountdownComplete} />
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Ended</Typography>
        )}
      </Box>

      {/* Distribution */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', gap: 0.5 }}>
        <Typography sx={{ fontSize: '0.7rem', color: t.up, fontWeight: 500, minWidth: 28 }}>{upPct}%</Typography>
        <LinearProgress
          variant="determinate"
          value={upPct}
          sx={{
            width: 50,
            height: 6,
            borderRadius: 1,
            bgcolor: withAlpha(t.down, 0.25),
            '& .MuiLinearProgress-bar': { bgcolor: t.up, borderRadius: 1 },
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
        <Typography sx={{ fontSize: '0.7rem', color: t.down, fontWeight: 500, minWidth: 28 }}>{downPct}%</Typography>
      </Box>

      {/* Pool Size */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.gain }}>
          {formatUSDC(pool.totalPool)}
        </Typography>
      </Box>

      {/* Odds */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
          <Box component="span" sx={{ color: t.up, fontWeight: 500 }}>{oddsUp}x</Box>
          {' / '}
          <Box component="span" sx={{ color: t.down, fontWeight: 500 }}>{oddsDown}x</Box>
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
            <Button
              size="small"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick?.(); }}
              sx={{
                minWidth: 70,
                px: 2,
                py: 0.75,
                fontSize: '0.75rem',
                fontWeight: 700,
                bgcolor: t.up,
                color: t.text.contrast,
                borderRadius: '2px',
                textTransform: 'none',
                '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
              }}
            >
              Join
            </Button>
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
                bgcolor: t.hover.medium,
                textTransform: 'none',
                '&:hover': { bgcolor: t.hover.emphasis },
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
                bgcolor: isRefund ? withAlpha(t.accent, 0.08) : pool.winner === 'UP' ? withAlpha(t.up, 0.08) : withAlpha(t.down, 0.08),
                color: isRefund ? t.accent : pool.winner === 'UP' ? t.up : t.down,
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
                  bgcolor: userBet.isWinner === true ? withAlpha(t.gain, 0.08) : userBet.isWinner === false ? withAlpha(t.down, 0.08) : t.hover.medium,
                  color: userBet.isWinner === true ? t.gain : userBet.isWinner === false ? t.down : 'text.secondary',
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
          color: t.text.muted,
          '&:hover': { color: t.text.bright, bgcolor: t.hover.medium },
          transition: 'all 0.15s ease',
        }}
      >
        <Share sx={{ fontSize: 15 }} />
      </Box>
    </>
  );
}
