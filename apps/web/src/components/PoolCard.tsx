'use client';

import { Card, CardContent, Box, Typography, Chip, Button } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import Link from 'next/link';
import type { Pool } from '@/lib/api';
import { formatUSDC, formatPrice, formatDateTime, formatTime, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { Countdown } from './Countdown';

interface PoolCardProps {
  pool: Pool;
  livePrice?: string | null;
  userBet?: { side: 'UP' | 'DOWN'; isWinner: boolean | null };
}

export function PoolCard({ pool, livePrice, userBet }: PoolCardProps) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPercentage = total > 0 ? (totalUp / total) * 100 : 50;

  const countdownTarget =
    pool.status === 'JOINING' ? pool.lockTime :
    pool.status === 'ACTIVE' ? pool.endTime :
    pool.status === 'UPCOMING' ? pool.startTime :
    null;

  const countdownLabel =
    pool.status === 'JOINING' ? 'Predictions close in' :
    pool.status === 'ACTIVE' ? 'Result in' :
    pool.status === 'UPCOMING' ? 'Opens in' :
    null;

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;

  return (
    <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', height: '100%', width: '100%', display: 'block' }}>
      <Card
        sx={{
          cursor: 'pointer',
          position: 'relative',
          overflow: 'hidden',
          background: '#141414',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          transition: 'all 0.2s ease',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          '&:hover': {
            borderColor: 'rgba(255, 255, 255, 0.16)',
          },
        }}
      >
        <CardContent sx={{ p: 3, display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
          {/* Header */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Box>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                }}
              >
                {pool.asset}/USD
              </Typography>
              {/* Live Price */}
              <Typography
                variant="h4"
                sx={{
                  fontWeight: 300,
                  fontVariantNumeric: 'tabular-nums',
                  color: livePrice ? 'text.primary' : 'text.secondary',
                  mt: 0.5,
                }}
              >
                {livePrice ? `$${Number(livePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
              </Typography>
            </Box>
            <Chip
              label={pool.status}
              size="small"
              sx={{
                ...statusStyle,
                fontWeight: 500,
                fontSize: '0.7rem',
                letterSpacing: '0.05em',
              }}
            />
          </Box>

          {/* Countdown or Resolved Info */}
          {countdownTarget && countdownLabel ? (
            <Box sx={{ mb: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box sx={{ width: '100%' }}>
                  <Countdown targetDate={countdownTarget} label={countdownLabel} />
                </Box>
              </Box>

              {/* Timeline hint */}
              {pool.status === 'JOINING' && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    textAlign: 'center',
                    color: 'text.secondary',
                    mt: 1.5,
                    fontSize: '0.7rem',
                  }}
                >
                  Result at {formatTime(pool.endTime)}
                </Typography>
              )}
              {pool.status === 'ACTIVE' && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'block',
                    textAlign: 'center',
                    color: 'text.secondary',
                    mt: 1.5,
                    fontSize: '0.7rem',
                  }}
                >
                  Monitoring price — predictions locked
                </Typography>
              )}
            </Box>
          ) : (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && pool.strikePrice ? (
            <Box sx={{ mb: 3, display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  Strike
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                  {formatPrice(pool.strikePrice)}
                </Typography>
              </Box>
              {pool.finalPrice && (
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                    Close
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                    {formatPrice(pool.finalPrice)}
                  </Typography>
                </Box>
              )}
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  Ended
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 400 }}>
                  {formatDateTime(pool.endTime)}
                </Typography>
              </Box>
            </Box>
          ) : (
            <Box sx={{ mb: 3 }} />
          )}

          {/* Pool Distribution */}
          <Box sx={{ mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TrendingUp sx={{ fontSize: 18, color: '#00E5FF' }} />
                <Typography variant="body2" sx={{ color: '#00E5FF', fontWeight: 500 }}>
                  {formatUSDC(pool.totalUp)}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  ({pool.upCount})
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                  ({pool.downCount})
                </Typography>
                <Typography variant="body2" sx={{ color: '#FF5252', fontWeight: 500 }}>
                  {formatUSDC(pool.totalDown)}
                </Typography>
                <TrendingDown sx={{ fontSize: 18, color: '#FF5252' }} />
              </Box>
            </Box>

            {/* Gradient progress bar */}
            <Box
              sx={{
                position: 'relative',
                height: 6,
                borderRadius: 1,
                overflow: 'hidden',
                backgroundColor: 'rgba(255, 82, 82, 0.3)',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: `${upPercentage}%`,
                  background: '#00E5FF',
                  borderRadius: 1,
                  transition: 'width 0.5s ease',
                }}
              />
            </Box>
          </Box>

          {/* Total Pool */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pt: 2,
              mt: 'auto',
              borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            }}
          >
            <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400 }}>
              TOTAL POOL
            </Typography>
            <Typography
              variant="body1"
              sx={{ fontWeight: 500, color: 'text.primary' }}
            >
              {formatUSDC(pool.totalPool)}
            </Typography>
          </Box>

          {/* Winner Badge (if resolved) */}
          {pool.winner && (
            <Box
              sx={{
                mt: 3,
                p: 1.5,
                borderRadius: 1,
                background: pool.winner === 'UP'
                  ? 'rgba(0, 229, 255, 0.08)'
                  : 'rgba(255, 82, 82, 0.08)',
                border: pool.winner === 'UP'
                  ? '1px solid rgba(0, 229, 255, 0.2)'
                  : '1px solid rgba(255, 82, 82, 0.2)',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
              }}
            >
              {pool.winner === 'UP' ? (
                <TrendingUp sx={{ fontSize: 18, color: '#00E5FF' }} />
              ) : (
                <TrendingDown sx={{ fontSize: 18, color: '#FF5252' }} />
              )}
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 600,
                  color: pool.winner === 'UP' ? '#00E5FF' : '#FF5252',
                }}
              >
                {pool.winner} WINS
              </Typography>
            </Box>
          )}

          {/* Join CTA */}
          {pool.status === 'JOINING' && !userBet && (
            <Button
              fullWidth
              variant="contained"
              sx={{
                mt: 3,
                py: 1.25,
                bgcolor: '#FFFFFF',
                color: '#0A0A0A',
                fontWeight: 600,
                fontSize: '0.85rem',
                '&:hover': {
                  bgcolor: 'rgba(255, 255, 255, 0.9)',
                },
              }}
            >
              Place Prediction
            </Button>
          )}

          {/* User prediction result */}
          {userBet && (
            <Box
              sx={{
                mt: pool.winner ? 1.5 : 3,
                p: 1.5,
                borderRadius: 1,
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {userBet.side === 'UP' ? (
                  <TrendingUp sx={{ fontSize: 16, color: '#00E5FF' }} />
                ) : (
                  <TrendingDown sx={{ fontSize: 16, color: '#FF5252' }} />
                )}
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  You predicted {userBet.side}
                </Typography>
              </Box>
              {userBet.isWinner === true && (
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#00E5FF' }}>
                  WON
                </Typography>
              )}
              {userBet.isWinner === false && (
                <Typography variant="body2" sx={{ fontWeight: 600, color: '#FF5252' }}>
                  LOST
                </Typography>
              )}
              {userBet.isWinner === null && (
                <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                  Pending
                </Typography>
              )}
            </Box>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
