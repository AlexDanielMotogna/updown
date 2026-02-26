'use client';

import { Card, CardContent, Box, Typography, Chip, Button } from '@mui/material';
import { TrendingUp, TrendingDown, OpenInNew } from '@mui/icons-material';
import Link from 'next/link';
import type { Bet } from '@/lib/api';
import { formatUSDC, formatDate, formatPrice, formatDateTime, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';

interface BetCardProps {
  bet: Bet;
  onClaim?: () => void;
  isClaiming?: boolean;
}

export function BetCard({ bet, onClaim, isClaiming }: BetCardProps) {
  const isWinner = bet.isWinner === true;
  const isLoser = bet.isWinner === false;
  const isClaimable = isWinner && !bet.claimed && bet.pool.status === 'CLAIMABLE';
  const isActive = bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE';
  const statusStyle = statusStyles[bet.pool.status] || statusStyles.UPCOMING;

  return (
    <Card
      sx={{
        overflow: 'hidden',
        background: '#141414',
        border: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography variant="h6" sx={{ fontWeight: 500, '&:hover': { color: 'rgba(255, 255, 255, 0.7)' }, transition: 'color 0.2s ease' }}>
                {bet.pool.asset}/USD
              </Typography>
            </Link>
          </Box>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
            <Chip
              label={bet.pool.status}
              size="small"
              sx={{
                ...statusStyle,
                fontWeight: 500,
                fontSize: '0.7rem',
                letterSpacing: '0.03em',
              }}
            />
            <Chip
              icon={bet.side === 'UP' ? <TrendingUp sx={{ fontSize: 14 }} /> : <TrendingDown sx={{ fontSize: 14 }} />}
              label={bet.side}
              size="small"
              sx={{
                bgcolor: bet.side === 'UP' ? 'rgba(0, 229, 255, 0.1)' : 'rgba(255, 82, 82, 0.1)',
                color: bet.side === 'UP' ? '#00E5FF' : '#FF5252',
                fontWeight: 500,
                fontSize: '0.7rem',
                '& .MuiChip-icon': { color: 'inherit' },
              }}
            />
            {isWinner && !bet.claimed && (
              <Chip
                label="Won"
                size="small"
                sx={{
                  bgcolor: 'rgba(0, 229, 255, 0.1)',
                  color: '#00E5FF',
                  fontWeight: 500,
                  fontSize: '0.7rem',
                }}
              />
            )}
            {isLoser && (
              <Chip
                label="Lost"
                size="small"
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.4)',
                  fontWeight: 500,
                  fontSize: '0.7rem',
                }}
              />
            )}
            {bet.claimed && (
              <Chip
                label="Claimed"
                size="small"
                sx={{
                  bgcolor: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.5)',
                  fontWeight: 500,
                  fontSize: '0.7rem',
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
                Payout
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, color: '#00E5FF' }}>
                {formatUSDC(bet.payoutAmount!, { min: 2 })}
              </Typography>
            </Box>
          )}

          {/* Strike price — shown for active pools once available */}
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

          {/* Strike → Final price — shown for resolved pools */}
          {bet.pool.strikePrice && bet.pool.finalPrice && (
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                Price
              </Typography>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  color: bet.pool.winner === 'UP' ? '#00E5FF' : '#FF5252',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {formatPrice(bet.pool.strikePrice)} → {formatPrice(bet.pool.finalPrice)}
              </Typography>
            </Box>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              {isActive ? 'Ends' : 'Ended'}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 400 }}>
              {isActive ? formatDateTime(bet.pool.endTime) : formatDate(bet.pool.endTime)}
            </Typography>
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
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.3)' },
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
                  borderColor: 'rgba(255, 255, 255, 0.1)',
                  px: 1.5,
                  py: 0.5,
                  '&:hover': { color: '#FFFFFF', borderColor: 'rgba(255, 255, 255, 0.3)' },
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
              background: '#FFFFFF',
              color: '#0A0A0A',
              '&:hover': {
                background: 'rgba(255, 255, 255, 0.9)',
              },
              '&:disabled': {
                background: 'rgba(255, 255, 255, 0.2)',
                color: 'rgba(0, 0, 0, 0.5)',
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
