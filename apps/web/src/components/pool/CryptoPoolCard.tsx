'use client';

import React from 'react';
import { Box, Typography, Chip, Button } from '@mui/material';
import { Bolt, Speed, Timer, Schedule } from '@mui/icons-material';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { Countdown } from '../Countdown';
import { AssetIcon } from '../AssetIcon';

const INTERVAL_ICONS: Record<string, React.ReactNode> = {
  '3m': <Bolt sx={{ fontSize: 13 }} />,
  '5m': <Speed sx={{ fontSize: 13 }} />,
  '15m': <Timer sx={{ fontSize: 13 }} />,
  '1h': <Schedule sx={{ fontSize: 13 }} />,
};

interface CryptoPoolCardProps {
  pool: Pool;
  userBet?: { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null };
  getPrice: (a: string) => string | null;
  isNew?: boolean;
  isPopular?: boolean;
  alwaysShowView?: boolean;
  onClick?: () => void;
}

export function CryptoPoolCard({ pool, userBet, onClick }: CryptoPoolCardProps) {
  const t = useThemeTokens();

  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;

  const status = pool.status;
  const isJoining = status === 'JOINING';
  const endTimePassed = isJoining && new Date(pool.endTime).getTime() <= Date.now();
  const canBet = isJoining && !endTimePassed;

  const countdownTarget =
    status === 'JOINING' ? pool.endTime :
    status === 'ACTIVE' ? pool.endTime :
    status === 'UPCOMING' ? pool.startTime :
    null;

  const isRefund = pool.winner && (Number(pool.totalUp) === 0 || Number(pool.totalDown) === 0);
  const isEnded = !!pool.winner || status === 'RESOLVED' || status === 'CLAIMABLE';

  return (
    <Box
      sx={{
        bgcolor: t.bg.surfaceAlt,
        border: t.surfaceBorder,
        boxShadow: t.surfaceShadow,
        borderRadius: 1.5,
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'background 0.15s ease',
        '&:hover': { background: t.hover.default },
      }}
    >
      {/* ── Header: Asset left, Interval right ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AssetIcon asset={pool.asset} size={28} />
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', '&:hover': { color: t.text.bright } }}>
              {pool.asset}/USD
            </Typography>
          </Link>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: t.text.tertiary }}>
          {INTERVAL_ICONS[pool.interval] && React.cloneElement(INTERVAL_ICONS[pool.interval] as React.ReactElement, { sx: { fontSize: 12, color: t.text.tertiary } })}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
            {INTERVAL_LABELS[pool.interval] || pool.interval}
          </Typography>
        </Box>
      </Box>

      {/* ── Countdown / status above buttons ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {endTimePassed ? (
          <Typography sx={{ fontSize: '0.75rem', color: t.draw, fontStyle: 'italic' }}>Resolving...</Typography>
        ) : countdownTarget ? (
          <Countdown targetDate={countdownTarget} compact />
        ) : isEnded ? null : null}
      </Box>

      {/* ── Duel: UP vs DOWN buttons ── */}
      {canBet ? (
        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 42 }}>
          <Button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
              py: 0.75, bgcolor: withAlpha(t.up, 0.08), border: `1px solid ${withAlpha(t.up, 0.2)}`,
              borderRadius: 1, textTransform: 'none', minWidth: 0, transition: 'all 0.15s ease',
              '&:hover': { bgcolor: withAlpha(t.up, 0.15), borderColor: withAlpha(t.up, 0.4) },
            }}
          >
            <Box component="img" src="/assets/up-icon-64x64.png" alt="UP" sx={{ width: 18, height: 18 }} />
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.up }}>{upPct}%</Typography>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: t.text.tertiary }}>UP</Typography>
          </Button>
          <Button
            onClick={(e) => { e.stopPropagation(); onClick?.(); }}
            sx={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
              py: 0.75, bgcolor: withAlpha(t.down, 0.08), border: `1px solid ${withAlpha(t.down, 0.2)}`,
              borderRadius: 1, textTransform: 'none', minWidth: 0, transition: 'all 0.15s ease',
              '&:hover': { bgcolor: withAlpha(t.down, 0.15), borderColor: withAlpha(t.down, 0.4) },
            }}
          >
            <Box component="img" src="/assets/down-icon-64x64.png" alt="DOWN" sx={{ width: 18, height: 18 }} />
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.down }}>{downPct}%</Typography>
            <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: t.text.tertiary }}>DOWN</Typography>
          </Button>
        </Box>
      ) : isEnded && pool.winner ? (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 42 }}>
          <Chip
            label={isRefund ? 'REFUNDED' : `${pool.winner} WINS`}
            size="small"
            sx={{
              height: 24, fontSize: '0.7rem', fontWeight: 700,
              bgcolor: isRefund ? withAlpha(t.accent, 0.1) : pool.winner === 'UP' ? withAlpha(t.up, 0.1) : withAlpha(t.down, 0.1),
              color: isRefund ? t.accent : pool.winner === 'UP' ? t.up : t.down,
            }}
          />
          {userBet && !isRefund && (
            <Chip
              label={userBet.isWinner === true ? 'YOU WON' : userBet.isWinner === false ? 'YOU LOST' : '...'}
              size="small"
              sx={{
                height: 24, fontSize: '0.7rem', fontWeight: 700,
                bgcolor: userBet.isWinner === true ? withAlpha(t.gain, 0.1) : withAlpha(t.down, 0.1),
                color: userBet.isWinner === true ? t.gain : t.down,
              }}
            />
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 42 }}>
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                px: 3, py: 0.75, fontSize: '0.8rem', fontWeight: 600,
                color: t.text.secondary, bgcolor: t.hover.medium, textTransform: 'none',
                '&:hover': { bgcolor: t.hover.emphasis },
              }}
            >
              {endTimePassed ? 'Resolving...' : 'View Pool'}
            </Button>
          </Link>
        </Box>
      )}

      {/* ── Footer: Volume left, details right ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {isEnded ? (
          <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
            <Typography sx={{ fontSize: '0.7rem', color: t.text.tertiary, '&:hover': { color: t.text.primary }, cursor: 'pointer' }}>
              View details →
            </Typography>
          </Link>
        ) : (
          <Box />
        )}
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.gain }}>
          {formatUSDC(pool.totalPool)} Vol.
        </Typography>
      </Box>
    </Box>
  );
}
