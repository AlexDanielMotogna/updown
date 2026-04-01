'use client';

import { Card, CardContent, Box, Typography, Chip, Button, CircularProgress } from '@mui/material';
import { TrendingUp, TrendingDown, OpenInNew } from '@mui/icons-material';
import Link from 'next/link';
import type { Bet } from '@/lib/api';
import { formatUSDC, formatDate, formatPrice, formatDateTime, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AssetIcon } from './AssetIcon';
import { AnimatedValue } from './AnimatedValue';
import { Countdown } from './Countdown';

interface BetCardProps {
  bet: Bet;
  onClaim?: () => void;
  isClaiming?: boolean;
}

export function BetCard({ bet, onClaim, isClaiming }: BetCardProps) {
  const t = useThemeTokens();

  const isRefund = bet.claimed && bet.payoutAmount != null && bet.payoutAmount === bet.amount;
  const isWinner = bet.isWinner === true && !isRefund;
  const isLoser = bet.isWinner === false;
  const isClaimable = isWinner && !bet.claimed && bet.pool.status === 'CLAIMABLE';
  const isActive = bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE';
  const isResolving = bet.pool.status === 'ACTIVE' && new Date(bet.pool.endTime).getTime() <= Date.now();
  const statusStyle = statusStyles[bet.pool.status] || statusStyles.UPCOMING;

  return (
    <Card
      sx={{
        overflow: 'hidden',
        background: t.bg.surface,
        border: t.surfaceBorder,
        boxShadow: t.surfaceShadow,
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssetIcon asset={bet.pool.asset} size={28} />
            <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography variant="h6" sx={{ fontWeight: 500, '&:hover': { color: t.text.bright }, transition: 'color 0.2s ease' }}>
                {bet.pool.asset}/USD
              </Typography>
            </Link>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              icon={isResolving ? <CircularProgress size={10} sx={{ color: 'inherit' }} /> : undefined}
              label={isResolving ? 'Resolving...' : bet.pool.status}
              size="small"
              sx={{
                ...(isResolving
                  ? { bgcolor: withAlpha(t.draw, 0.07), color: t.draw }
                  : statusStyle),
                fontWeight: 500,
                fontSize: '0.7rem',
                letterSpacing: '0.03em',
                borderRadius: '2px',
              }}
            />
            <Chip
              icon={bet.side === 'UP' ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
              label={bet.side}
              size="small"
              sx={{
                bgcolor: bet.side === 'UP' ? withAlpha(t.up, 0.09) : withAlpha(t.down, 0.09),
                color: bet.side === 'UP' ? t.up : t.down,
                fontWeight: 500,
                fontSize: '0.7rem',
                borderRadius: '2px',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            {isWinner && !bet.claimed && (
              <Chip
                label="Won"
                size="small"
                sx={{
                  bgcolor: withAlpha(t.gain, 0.09),
                  color: t.gain,
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  borderRadius: '2px',
                }}
              />
            )}
            {isLoser && (
              <Chip
                label="Lost"
                size="small"
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  color: t.text.tertiary,
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  borderRadius: '2px',
                }}
              />
            )}
            {bet.claimed && (
              <Chip
                label={isRefund ? 'Refunded' : 'Claimed'}
                size="small"
                sx={{
                  bgcolor: isRefund ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.05)',
                  color: isRefund ? t.info : t.text.secondary,
                  fontWeight: 500,
                  fontSize: '0.7rem',
                  borderRadius: '2px',
                }}
              />
            )}
          </Box>
        </Box>

        {/* Details */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Stake
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {formatUSDC(bet.amount, { min: 2 })}
            </Typography>
          </Box>

          {bet.payoutAmount && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {isRefund ? 'Refund' : 'Payout'}
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: isRefund ? t.info : t.gain }}>
                <AnimatedValue usdcValue={bet.payoutAmount!} prefix="$" />
              </Typography>
            </Box>
          )}

          {bet.pool.strikePrice && !bet.pool.finalPrice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Strike
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                {formatPrice(bet.pool.strikePrice)}
              </Typography>
            </Box>
          )}

          {bet.pool.strikePrice && bet.pool.finalPrice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Price
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: bet.pool.winner === 'UP' ? t.up : t.down,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatPrice(bet.pool.strikePrice)} → {formatPrice(bet.pool.finalPrice)}
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isActive ? (isResolving ? 'Result' : 'Result in') : 'Ended'}
            </Typography>
            {isResolving ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <CircularProgress size={12} sx={{ color: t.draw }} />
                <Typography variant="body2" sx={{ fontWeight: 500, color: t.draw }}>
                  Resolving...
                </Typography>
              </Box>
            ) : isActive ? (
              <Countdown targetDate={bet.pool.endTime} compact />
            ) : (
              <Typography variant="body2" sx={{ fontWeight: 400 }}>
                {formatDate(bet.pool.endTime)}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              Placed
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 400 }}>
              {formatDateTime(bet.createdAt)}
            </Typography>
          </Box>
        </Box>

        {/* Transaction Links */}
        {(bet.depositTx || bet.claimTx) && (
          <Box sx={{ display: 'flex', gap: 1, mt: 2.5 }}>
            {bet.depositTx && (
              <Button
                component="a"
                href={getExplorerTxUrl(bet.depositTx)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                sx={{
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  borderColor: 'transparent',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { color: t.text.primary, borderColor: t.border.active },
                }}
                variant="outlined"
              >
                Deposit Tx
              </Button>
            )}
            {bet.claimTx && (
              <Button
                component="a"
                href={getExplorerTxUrl(bet.claimTx)}
                target="_blank"
                rel="noopener noreferrer"
                size="small"
                endIcon={<OpenInNew sx={{ fontSize: 14 }} />}
                sx={{
                  fontSize: '0.7rem',
                  color: 'text.secondary',
                  borderColor: 'transparent',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { color: t.text.primary, borderColor: t.border.active },
                }}
                variant="outlined"
              >
                Claim Tx
              </Button>
            )}
          </Box>
        )}

        {/* Claim Button */}
        {isClaimable && onClaim && (
          <Button
            variant="contained"
            fullWidth
            onClick={onClaim}
            disabled={isClaiming}
            sx={{
              mt: 2.5,
              py: 1.5,
              fontWeight: 600,
              background: `linear-gradient(135deg, ${t.gain}, ${t.successDark})`,
              color: t.text.contrast,
              '&:hover': {
                background: `linear-gradient(135deg, ${withAlpha(t.gain, 0.87)}, ${withAlpha(t.successDark, 0.87)})`,
              },
              '&:disabled': {
                background: t.border.hover,
                color: t.shadow.default,
              },
            }}
          >
            {isClaiming ? 'Claiming...' : 'Claim Payout'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
