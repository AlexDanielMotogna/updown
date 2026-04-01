'use client';

import { Box, Typography, Chip, Button, LinearProgress } from '@mui/material';
import { TrendingUp, TrendingDown, Person, LocalFireDepartment, Star } from '@mui/icons-material';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC } from '@/lib/format';
import { INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { Countdown } from '../Countdown';

export interface PoolRowMobileProps {
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

export function PoolRowMobile({
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
}: PoolRowMobileProps) {
  const t = useThemeTokens();

  return (
    <Box sx={{ p: 2 }}>
      {/* Header: asset icon, name, interval, hot badge, status */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
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
                    bgcolor: withAlpha(t.accent, 0.13),
                    color: t.accent,
                    borderRadius: '2px',
                    '& .MuiChip-icon': { color: t.accent },
                    animation: 'hotPulse 2s infinite',
                    '@keyframes hotPulse': {
                      '0%, 100%': { boxShadow: `0 0 4px ${withAlpha(t.accent, 0.25)}` },
                      '50%': { boxShadow: `0 0 8px ${withAlpha(t.accent, 0.38)}` },
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
                    bgcolor: withAlpha(t.accent, 0.13),
                    color: t.accent,
                    borderRadius: '2px',
                    '& .MuiChip-icon': { color: t.accent },
                  }}
                />
              )}
            </Box>
            <Chip label={status === 'JOINING' ? 'LIVE' : status} size="small" sx={{ ...statusStyle, height: 20, fontSize: '0.6rem', fontWeight: 600, borderRadius: '2px', mt: 0.5 }} />
          </Box>
        </Box>
      </Box>

      {/* Middle: countdown left, pool size right */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          {endTimePassed ? (
            <Typography sx={{ fontSize: '0.8rem', color: t.draw, fontStyle: 'italic' }}>Resolving...</Typography>
          ) : countdownTarget ? (
            <Countdown targetDate={countdownTarget} compact onComplete={handleCountdownComplete} />
          ) : (
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>Ended</Typography>
          )}
        </Box>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.gain }}>
          Pool: {formatUSDC(pool.totalPool)}
        </Typography>
      </Box>

      {/* Distribution bar + player count */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flex: 1 }}>
          <Typography sx={{ fontSize: '0.7rem', color: t.up, fontWeight: 500 }}>{upPct}%</Typography>
          <LinearProgress
            variant="determinate"
            value={upPct}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 1,
              bgcolor: withAlpha(t.down, 0.25),
              '& .MuiLinearProgress-bar': { bgcolor: t.up, borderRadius: 1 },
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
          <Typography sx={{ fontSize: '0.7rem', color: t.down, fontWeight: 500 }}>{downPct}%</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25, flexShrink: 0 }}>
          <Person sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>{pool.betCount}</Typography>
        </Box>
      </Box>

      {/* Action button */}
      <Box sx={{ pt: 1.5 }}>
        {canBet ? (
            <Button
              fullWidth
              size="small"
              onClick={(e: React.MouseEvent) => { e.stopPropagation(); onClick?.(); }}
              sx={{
                py: 1,
                fontSize: '0.85rem',
                fontWeight: 700,
                bgcolor: t.up,
                color: t.text.contrast,
                borderRadius: '2px',
                textTransform: 'none',
                minHeight: 44,
                '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
              }}
            >
              Join Pool
            </Button>
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
                bgcolor: t.hover.medium,
                textTransform: 'none',
                minHeight: 44,
                '&:hover': { bgcolor: t.hover.emphasis },
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
                bgcolor: t.hover.medium,
                textTransform: 'none',
                minHeight: 44,
                '&:hover': { bgcolor: t.hover.emphasis },
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
                bgcolor: isRefund ? withAlpha(t.accent, 0.08) : pool.winner === 'UP' ? withAlpha(t.up, 0.08) : withAlpha(t.down, 0.08),
                color: isRefund ? t.accent : pool.winner === 'UP' ? t.up : t.down,
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
                  bgcolor: userBet.isWinner === true ? withAlpha(t.gain, 0.08) : userBet.isWinner === false ? withAlpha(t.down, 0.08) : t.hover.medium,
                  color: userBet.isWinner === true ? t.gain : userBet.isWinner === false ? t.down : 'text.secondary',
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
                  bgcolor: t.hover.medium,
                  textTransform: 'none',
                  minHeight: 44,
                  minWidth: 44,
                  px: 2,
                  '&:hover': { bgcolor: t.hover.emphasis },
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
  );
}
