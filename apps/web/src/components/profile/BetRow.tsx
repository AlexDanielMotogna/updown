'use client';

import {
  Box,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  OpenInNew,
} from '@mui/icons-material';
import Link from 'next/link';
import { formatUSDC, formatDate, formatPrice, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR, DOWN_COLOR, ACCENT_COLOR, getBoxImage } from '@/lib/constants';
import { Countdown, AssetIcon } from '@/components';
import type { Bet } from '@/lib/api';

/* ─── Table Row for a single prediction ─── */

export function BetRow({
  bet,
  onClaim,
  isClaiming,
}: {
  bet: Bet;
  onClaim?: () => void;
  isClaiming?: boolean;
}) {
  const isRefund = bet.claimed && bet.payoutAmount != null && bet.payoutAmount === bet.amount;
  const isWinner = bet.isWinner === true && !isRefund;
  const isLoser = bet.isWinner === false;
  const isClaimable = isWinner && !bet.claimed && bet.pool.status === 'CLAIMABLE';
  const isActive = bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE';
  const isResolving = bet.pool.status === 'ACTIVE' && new Date(bet.pool.endTime).getTime() <= Date.now();
  const statusStyle = statusStyles[bet.pool.status] || statusStyles.UPCOMING;
  const sideColor = bet.side === 'UP' ? UP_COLOR : DOWN_COLOR;
  const boxImageUrl = getBoxImage(bet.pool.asset, bet.pool.interval);

  // Result chip
  const resultLabel = bet.claimed
    ? (isRefund ? 'Refunded' : 'Claimed')
    : isWinner
    ? 'Won'
    : isLoser
    ? 'Lost'
    : isActive
    ? 'Active'
    : 'Pending';

  const resultColor = bet.claimed
    ? (isRefund ? '#60A5FA' : 'rgba(255,255,255,0.5)')
    : isWinner
    ? GAIN_COLOR
    : isLoser
    ? DOWN_COLOR
    : isActive
    ? UP_COLOR
    : 'text.secondary';

  const resultBg = bet.claimed
    ? (isRefund ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.05)')
    : isWinner
    ? `${GAIN_COLOR}18`
    : isLoser
    ? `${DOWN_COLOR}12`
    : isActive
    ? `${UP_COLOR}12`
    : 'rgba(255,255,255,0.05)';

  return (
    <Box
      sx={{
        position: 'relative',
        overflow: 'hidden',
        display: { xs: 'block', md: 'grid' },
        gridTemplateColumns: { md: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr' },
        alignItems: 'stretch',
        px: 0,
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
      {/* Box image  desktop only */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: 70,
          overflow: 'hidden',
        }}
      >
        {boxImageUrl ? (
          <Box
            component="img"
            className="box-img"
            src={boxImageUrl}
            alt={`${bet.pool.asset} box`}
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
            <AssetIcon asset={bet.pool.asset} size={24} />
          </Box>
        )}
      </Box>

      {/* Mobile card layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
        {/* Header: asset icon, name, side chip, result chip, status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {boxImageUrl ? (
              <Box
                component="img"
                src={boxImageUrl}
                alt={`${bet.pool.asset} box`}
                sx={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
              />
            ) : (
              <Box sx={{ width: 40, height: 40, bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', flexShrink: 0 }}>
                <AssetIcon asset={bet.pool.asset} size={20} />
              </Box>
            )}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.95rem' }}>{bet.pool.asset}/USD</Typography>
                </Link>
                <Chip
                  icon={bet.side === 'UP' ? <TrendingUp sx={{ fontSize: 12 }} /> : <TrendingDown sx={{ fontSize: 12 }} />}
                  label={bet.side}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    bgcolor: `${sideColor}18`,
                    color: sideColor,
                    borderRadius: '2px',
                    '& .MuiChip-icon': { color: 'inherit' },
                  }}
                />
                <Chip
                  label={resultLabel}
                  size="small"
                  sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600, bgcolor: resultBg, color: resultColor, borderRadius: '2px' }}
                />
              </Box>
              <Chip
                label={isResolving ? 'Resolving...' : bet.pool.status}
                size="small"
                sx={{ ...(isResolving ? { bgcolor: 'rgba(251,191,36,0.12)', color: '#FBBF24' } : statusStyle), height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px', mt: 0.5 }}
              />
            </Box>
          </Box>
        </Box>

        {/* Stake and payout */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            Stake: <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>{formatUSDC(bet.amount, { min: 2 })}</Box>
          </Typography>
          {bet.payoutAmount ? (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: isRefund ? '#60A5FA' : GAIN_COLOR }}>
              {isRefund ? 'Refund' : 'Payout'}: {formatUSDC(bet.payoutAmount!, { min: 2 })}
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}></Typography>
          )}
        </Box>

        {/* Price movement + time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box>
            {bet.pool.strikePrice && bet.pool.finalPrice ? (
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: bet.pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR }}>
                {formatPrice(bet.pool.strikePrice)} → {formatPrice(bet.pool.finalPrice)}
              </Typography>
            ) : bet.pool.strikePrice ? (
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(bet.pool.strikePrice)}
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary' }}></Typography>
            )}
          </Box>
          <Box>
            {isActive && !isResolving ? (
              <Countdown targetDate={bet.pool.endTime} compact />
            ) : (
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'text.secondary' }}>
                {formatDate(bet.pool.endTime)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Actions row */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pt: 1.5, gap: 1 }}>
          {isClaimable && onClaim ? (
            <Button
              fullWidth
              size="small"
              onClick={onClaim}
              disabled={isClaiming}
              sx={{
                py: 1, fontSize: '0.85rem', fontWeight: 700, minHeight: 44,
                bgcolor: GAIN_COLOR, color: '#000', borderRadius: '2px', textTransform: 'none',
                '&:hover': { bgcolor: GAIN_COLOR, filter: 'brightness(1.15)' },
              }}
            >
              {isClaiming ? 'Claiming...' : 'Claim'}
            </Button>
          ) : (
            <Link href={`/pool/${bet.pool.id}`} style={{ flex: 1, textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 1, fontSize: '0.8rem', fontWeight: 600, minHeight: 44,
                  color: 'text.secondary', borderRadius: '2px', bgcolor: 'rgba(255,255,255,0.06)',
                  textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
                }}
              >
                View
              </Button>
            </Link>
          )}
          {bet.depositTx && (
            <Button
              component="a"
              href={getExplorerTxUrl(bet.depositTx)}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{
                minWidth: 44, minHeight: 44, px: 1.5, fontSize: '0.7rem', color: 'text.secondary',
                textTransform: 'none', borderRadius: '2px', bgcolor: 'rgba(255,255,255,0.04)',
                gap: 0.5, '&:hover': { color: '#FFFFFF', bgcolor: 'rgba(255,255,255,0.08)' },
              }}
            >
              Tx <OpenInNew sx={{ fontSize: 12 }} />
            </Button>
          )}
        </Box>
      </Box>

      {/* Desktop columns */}

      {/* Asset + Side */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', alignSelf: 'center', gap: 0.75, pl: 1.5 }}>
        <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', '&:hover': { color: 'rgba(255,255,255,0.7)' } }}>
            {bet.pool.asset}/USD
          </Typography>
        </Link>
        <Chip
          icon={bet.side === 'UP' ? <TrendingUp sx={{ fontSize: 12 }} /> : <TrendingDown sx={{ fontSize: 12 }} />}
          label={bet.side}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.6rem',
            fontWeight: 600,
            bgcolor: `${sideColor}18`,
            color: sideColor,
            borderRadius: '2px',
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        />
        <Chip
          label={isResolving ? 'Resolving' : bet.pool.status}
          size="small"
          sx={{
            ...(isResolving ? { bgcolor: 'rgba(251,191,36,0.12)', color: '#FBBF24' } : statusStyle),
            height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px',
          }}
        />
      </Box>

      {/* Result */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'center' }}>
        <Chip
          label={resultLabel}
          size="small"
          sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600, bgcolor: resultBg, color: resultColor, borderRadius: '2px' }}
        />
      </Box>

      {/* Stake */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
          {formatUSDC(bet.amount, { min: 2 })}
        </Typography>
      </Box>

      {/* Payout */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {bet.payoutAmount ? (
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: isRefund ? '#60A5FA' : GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {formatUSDC(bet.payoutAmount!, { min: 2 })}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}></Typography>
        )}
      </Box>

      {/* Price */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {bet.pool.strikePrice && bet.pool.finalPrice ? (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: bet.pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR }}>
            {formatPrice(bet.pool.strikePrice)} → {formatPrice(bet.pool.finalPrice)}
          </Typography>
        ) : bet.pool.strikePrice ? (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
            {formatPrice(bet.pool.strikePrice)}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary' }}></Typography>
        )}
      </Box>

      {/* Time */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {isResolving ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CircularProgress size={12} sx={{ color: '#FBBF24' }} />
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#FBBF24' }}>Resolving</Typography>
          </Box>
        ) : isActive ? (
          <Countdown targetDate={bet.pool.endTime} compact />
        ) : (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'text.secondary' }}>
            {formatDate(bet.pool.endTime)}
          </Typography>
        )}
      </Box>

      {/* Action */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'center', gap: 0.75, alignItems: 'center' }}>
        {isClaimable && onClaim ? (
          <Button
            size="small"
            onClick={onClaim}
            disabled={isClaiming}
            sx={{
              minWidth: 0, px: 2.5, py: 0.5, fontSize: '0.75rem', fontWeight: 700,
              bgcolor: GAIN_COLOR, color: '#000', borderRadius: '2px', textTransform: 'none',
              '&:hover': { bgcolor: GAIN_COLOR, filter: 'brightness(1.15)' },
            }}
          >
            {isClaiming ? 'Claiming...' : 'Claim'}
          </Button>
        ) : (
          <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 0, px: 2, py: 0.5, fontSize: '0.75rem', fontWeight: 600,
                color: 'text.secondary', borderRadius: '2px', bgcolor: 'rgba(255,255,255,0.06)',
                textTransform: 'none', '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
              }}
            >
              View
            </Button>
          </Link>
        )}
      </Box>

      {/* Tx */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, alignSelf: 'center', gap: 0.75, alignItems: 'center' }}>
        {bet.depositTx && (
          <Button
            component="a"
            href={getExplorerTxUrl(bet.depositTx)}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{
              minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
              textTransform: 'none', gap: 0.5,
              '&:hover': { color: '#FFFFFF' },
            }}
          >
            Deposit <OpenInNew sx={{ fontSize: 12 }} />
          </Button>
        )}
        {bet.claimTx && (
          <Button
            component="a"
            href={getExplorerTxUrl(bet.claimTx)}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{
              minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
              textTransform: 'none', gap: 0.5,
              '&:hover': { color: '#FFFFFF' },
            }}
          >
            Claim <OpenInNew sx={{ fontSize: 12 }} />
          </Button>
        )}
        {!bet.depositTx && !bet.claimTx && (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}></Typography>
        )}
      </Box>
    </Box>
  );
}

/* ─── Skeleton Row ─── */

export function BetRowSkeleton() {
  return (
    <Box
      sx={{
        display: { xs: 'block', md: 'grid' },
        gridTemplateColumns: { md: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr' },
        alignItems: 'center',
        px: 0,
        py: 0,
        bgcolor: '#0D1219',
      }}
    >
      {/* Desktop: box image column */}
      <Box sx={{ display: { xs: 'none', md: 'flex' }, justifyContent: 'center', py: 1.5 }}>
        <Skeleton variant="rounded" width={60} height={50} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
      </Box>
      {/* Desktop columns */}
      {[110, 50, 70, 80, 70, 80, 60, 90].map((w, i) => (
        <Skeleton key={i} variant="text" width={w} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)', display: { xs: 'none', md: 'block' } }} />
      ))}
      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ bgcolor: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
          <Box>
            <Skeleton variant="text" width={120} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
            <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="text" width={100} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Skeleton variant="text" width={90} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Skeleton variant="text" width={130} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
          <Skeleton variant="text" width={60} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
        <Box sx={{ pt: 1.5 }}>
          <Skeleton variant="rounded" width="100%" height={44} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
        </Box>
      </Box>
    </Box>
  );
}
