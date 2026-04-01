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
  Gavel,
  Public,
  TheaterComedy,
  AccountBalance,
} from '@mui/icons-material';
import Link from 'next/link';
import { formatUSDC, formatDate, formatPrice, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { getBoxImage } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { Countdown, AssetIcon } from '@/components';
import type { Bet } from '@/lib/api';
const PM_MUI_ICONS: Record<string, React.ReactNode> = {
  PM_POLITICS: <Gavel sx={{ fontSize: 28 }} />,
  PM_GEO: <Public sx={{ fontSize: 28 }} />,
  PM_CULTURE: <TheaterComedy sx={{ fontSize: 28 }} />,
  PM_FINANCE: <AccountBalance sx={{ fontSize: 28 }} />,
};

/* ─── Table Row for a single prediction ─── */

const PM_COLORS_KEYS: Record<string, 'politics' | 'geopolitics' | 'culture' | 'finance'> = {
  PM_POLITICS: 'politics', PM_GEO: 'geopolitics', PM_CULTURE: 'culture', PM_FINANCE: 'finance',
};

export function BetRow({
  bet,
  onClaim,
  isClaiming,
}: {
  bet: Bet;
  onClaim?: () => void;
  isClaiming?: boolean;
}) {
  const t = useThemeTokens();
  const isRefund = bet.claimed && bet.payoutAmount != null && bet.payoutAmount === bet.amount;
  const isWinner = bet.isWinner === true && !isRefund;
  const isLoser = bet.isWinner === false;
  const isClaimable = isWinner && !bet.claimed && bet.pool.status === 'CLAIMABLE';
  const isActive = bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE';
  const isResolving = bet.pool.status === 'ACTIVE' && new Date(bet.pool.endTime).getTime() <= Date.now();
  const statusStyle = statusStyles[bet.pool.status] || statusStyles.UPCOMING;
  const sideColor = bet.side === 'UP' ? t.up : t.down;
  const isSports = bet.pool.poolType === 'SPORTS';
  const isPM = bet.pool.league?.startsWith('PM_');
  const poolLink = isSports ? `/match/${bet.pool.id}` : `/pool/${bet.pool.id}`;
  const poolName = isPM
    ? (bet.pool.homeTeam || bet.pool.asset).slice(0, 40)
    : isSports
    ? `${bet.pool.homeTeam || ''} vs ${bet.pool.awayTeam || ''}`.trim()
    : `${bet.pool.asset}/USD`;
  const sideLabel = isPM
    ? (bet.side === 'UP' ? 'Yes' : 'No')
    : isSports
    ? (bet.side === 'UP' ? (bet.pool.homeTeam || 'Home') : bet.side === 'DOWN' ? (bet.pool.awayTeam || 'Away') : 'Draw')
    : bet.side;
  const boxImageUrl = isSports ? null : getBoxImage(bet.pool.asset, bet.pool.interval);
  const teamCrest = isSports && !isPM ? bet.pool.homeTeamCrest : null;

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

  const pmKey = PM_COLORS_KEYS[bet.pool.league || ''];
  const pmColor = pmKey ? t.categoryColors[pmKey] : t.prediction;

  const resultColor = bet.claimed
    ? (isRefund ? t.info : t.text.secondary)
    : isWinner
    ? t.gain
    : isLoser
    ? t.down
    : isActive
    ? t.up
    : 'text.secondary';

  const resultBg = bet.claimed
    ? (isRefund ? 'rgba(59,130,246,0.12)' : t.hover.medium)
    : isWinner
    ? withAlpha(t.gain, 0.09)
    : isLoser
    ? withAlpha(t.down, 0.07)
    : isActive
    ? withAlpha(t.up, 0.07)
    : t.hover.medium;

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
        bgcolor: t.bg.surfaceAlt,
        border: t.surfaceBorder,
        boxShadow: t.surfaceShadow,
        transition: 'background 0.15s ease',
        '&:hover': {
          background: t.hover.default,
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
        ) : teamCrest ? (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Box component="img" src={teamCrest} alt="" sx={{ width: 40, height: 40, objectFit: 'contain' }} />
          </Box>
        ) : isPM ? (
          <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: pmColor }}>
            {PM_MUI_ICONS[bet.pool.league || ''] || <TrendingUp sx={{ fontSize: 28 }} />}
          </Box>
        ) : (
          <Box sx={{ width: '100%', height: '100%', bgcolor: t.hover.medium, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AssetIcon asset={bet.pool.asset} size={24} />
          </Box>
        )}
      </Box>

      {/* Mobile card layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, p: 2 }}>
        {/* Header: asset icon, name, side chip, result chip, status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pb: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {boxImageUrl ? (
              <Box
                component="img"
                src={boxImageUrl}
                alt={`${bet.pool.asset} box`}
                sx={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }}
              />
            ) : teamCrest ? (
              <Box component="img" src={teamCrest} alt="" sx={{ width: 40, height: 40, objectFit: 'contain', flexShrink: 0 }} />
            ) : isPM ? (
              <Box sx={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: pmColor }}>
                {PM_MUI_ICONS[bet.pool.league || ''] || <TrendingUp sx={{ fontSize: 24 }} />}
              </Box>
            ) : (
              <Box sx={{ width: 40, height: 40, bgcolor: t.hover.medium, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '4px', flexShrink: 0 }}>
                <AssetIcon asset={bet.pool.asset} size={20} />
              </Box>
            )}
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Link href={poolLink} style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Typography sx={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{poolName}</Typography>
                </Link>
                <Chip
                  icon={<Box component="img" src={bet.side === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt="" sx={{ width: 12, height: 12 }} />}
                  label={bet.side}
                  size="small"
                  sx={{
                    height: 20,
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    bgcolor: withAlpha(sideColor, 0.09),
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
                sx={{ ...(isResolving ? { bgcolor: withAlpha(t.draw, 0.12), color: t.draw } : statusStyle), height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px', mt: 0.5 }}
              />
            </Box>
          </Box>
        </Box>

        {/* Stake and payout */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            Stake: <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>{formatUSDC(bet.amount, { min: 2 })}</Box>
          </Typography>
          {bet.payoutAmount ? (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: isRefund ? t.info : t.gain }}>
              {isRefund ? 'Refund' : 'Payout'}: {formatUSDC(bet.payoutAmount!, { min: 2 })}
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}></Typography>
          )}
        </Box>

        {/* Price movement + time */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box>
            {bet.pool.strikePrice && bet.pool.finalPrice ? (
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: bet.pool.winner === 'UP' ? t.up : t.down }}>
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
                bgcolor: t.gain, color: t.text.contrast, borderRadius: '2px', textTransform: 'none',
                '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
              }}
            >
              {isClaiming ? 'Claiming...' : 'Claim'}
            </Button>
          ) : (
            <Link href={poolLink} style={{ flex: 1, textDecoration: 'none' }}>
              <Button
                fullWidth
                size="small"
                sx={{
                  py: 1, fontSize: '0.8rem', fontWeight: 600, minHeight: 44,
                  color: 'text.secondary', borderRadius: '2px', bgcolor: t.border.default,
                  textTransform: 'none', '&:hover': { bgcolor: t.hover.emphasis },
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
                textTransform: 'none', borderRadius: '2px', bgcolor: t.hover.default,
                gap: 0.5, '&:hover': { color: t.text.primary, bgcolor: t.hover.strong },
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
        <Link href={poolLink} style={{ textDecoration: 'none', color: 'inherit' }}>
          <Typography sx={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180, '&:hover': { color: t.text.bright } }}>
            {poolName}
          </Typography>
        </Link>
        <Chip
          icon={<Box component="img" src={bet.side === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt="" sx={{ width: 12, height: 12 }} />}
          label={sideLabel}
          size="small"
          sx={{
            height: 20,
            fontSize: '0.6rem',
            fontWeight: 600,
            bgcolor: withAlpha(sideColor, 0.09),
            color: sideColor,
            borderRadius: '2px',
            '& .MuiChip-icon': { color: 'inherit' },
          }}
        />
        <Chip
          label={isResolving ? 'Resolving' : bet.pool.status}
          size="small"
          sx={{
            ...(isResolving ? { bgcolor: withAlpha(t.draw, 0.12), color: t.draw } : statusStyle),
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
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: isRefund ? t.info : t.gain, fontVariantNumeric: 'tabular-nums' }}>
            {formatUSDC(bet.payoutAmount!, { min: 2 })}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}></Typography>
        )}
      </Box>

      {/* Price */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {bet.pool.strikePrice && bet.pool.finalPrice ? (
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: bet.pool.winner === 'UP' ? t.up : t.down }}>
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
            <CircularProgress size={12} sx={{ color: t.draw }} />
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.draw }}>Resolving</Typography>
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
              bgcolor: t.gain, color: t.text.contrast, borderRadius: '2px', textTransform: 'none',
              '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
            }}
          >
            {isClaiming ? 'Claiming...' : 'Claim'}
          </Button>
        ) : (
          <Link href={poolLink} style={{ textDecoration: 'none' }}>
            <Button
              size="small"
              sx={{
                minWidth: 0, px: 2, py: 0.5, fontSize: '0.75rem', fontWeight: 600,
                color: 'text.secondary', borderRadius: '2px', bgcolor: t.border.default,
                textTransform: 'none', '&:hover': { bgcolor: t.hover.emphasis },
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
              '&:hover': { color: t.text.primary },
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
              '&:hover': { color: t.text.primary },
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
  const t = useThemeTokens();
  return (
    <>
      {/* Desktop row skeleton */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr',
          alignItems: 'center',
          px: 0,
          py: 0,
          minHeight: 70,
          bgcolor: t.bg.surfaceAlt,
          border: t.surfaceBorder,
          boxShadow: t.surfaceShadow,
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>
          <Skeleton variant="rounded" width={60} height={50} sx={{ bgcolor: t.hover.default }} />
        </Box>
        <Box sx={{ pl: 1.5 }}>
          <Skeleton variant="text" width={90} height={18} sx={{ bgcolor: t.border.default }} />
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
            <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
            <Skeleton variant="rounded" width={52} height={16} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
          </Box>
        </Box>
        <Skeleton variant="rounded" width={48} height={20} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: t.border.default }} />
        <Skeleton variant="text" width={55} height={18} sx={{ bgcolor: t.hover.default }} />
        <Skeleton variant="text" width={120} height={18} sx={{ bgcolor: t.hover.default }} />
        <Skeleton variant="text" width={70} height={18} sx={{ bgcolor: t.hover.default }} />
        <Skeleton variant="rounded" width={56} height={28} sx={{ bgcolor: t.border.default, borderRadius: '2px' }} />
        <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.hover.default }} />
      </Box>

      {/* Mobile card skeleton */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: '#0D1219', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pb: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="rounded" width={40} height={40} sx={{ bgcolor: t.hover.default, flexShrink: 0 }} />
          <Box sx={{ flex: 1 }}>
            <Skeleton variant="text" width={100} height={18} sx={{ bgcolor: t.border.default }} />
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5 }}>
              <Skeleton variant="rounded" width={36} height={16} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
              <Skeleton variant="rounded" width={44} height={16} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="text" width={90} height={16} sx={{ bgcolor: t.hover.default }} />
          <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: t.border.default }} />
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Skeleton variant="text" width={120} height={16} sx={{ bgcolor: t.hover.default }} />
          <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.hover.default }} />
        </Box>
        <Box sx={{ pt: 1.5 }}>
          <Skeleton variant="rounded" width="100%" height={44} sx={{ bgcolor: t.hover.default, borderRadius: '2px' }} />
        </Box>
      </Box>
    </>
  );
}
