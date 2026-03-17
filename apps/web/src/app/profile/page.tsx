'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Alert,
  Avatar,
  Card,
  CardContent,
  Button,
  Chip,
  CircularProgress,
  Skeleton,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  OpenInNew,
  ContentCopy,
  CheckCircle,
  LocalFireDepartment,
  AttachMoney,
} from '@mui/icons-material';
import Link from 'next/link';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { TransactionModal, AppShell, ConnectWalletButton, Countdown, AssetIcon } from '@/components';
import { UserLevelBadge } from '@/components/UserLevelBadge';
import { formatUSDC, formatDate, formatPrice, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR, DOWN_COLOR, ACCENT_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';
import type { Bet } from '@/lib/api';

function getAvatarUrl(address: string): string {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${address}`;
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const ASSET_INTERVAL_BOX_IMAGE: Record<string, string> = {
  'BTC-1m': '/boxes/Btc-1min.png',
  'BTC-5m': '/boxes/Btc-5min.png',
  'BTC-15m': '/boxes/Btc-15min.png',
  'BTC-1h': '/boxes/Btc-1h.png',
  'ETH-1m': '/boxes/Eth-1min.png',
  'ETH-5m': '/boxes/Eth-5min.png',
  'ETH-15m': '/boxes/Eth-15min.png',
  'ETH-1h': '/boxes/Eth-1h.png',
  'SOL-1m': '/boxes/Sol-1min.png',
  'SOL-5m': '/boxes/Sol-5min.png',
  'SOL-15m': '/boxes/Sol-15min.png',
  'SOL-1h': '/boxes/Sol-1h.png',
};

const ASSET_BOX_IMAGE: Record<string, string> = {
  BTC: '/boxes/Btc-box.png',
  ETH: '/boxes/Eth-box.png',
  SOL: '/boxes/Sol-box.png',
};

function getBoxImage(asset: string, interval: string): string | undefined {
  return ASSET_INTERVAL_BOX_IMAGE[`${asset}-${interval}`] ?? ASSET_BOX_IMAGE[asset];
}

/* ─── Table Row for a single prediction ─── */

function BetRow({
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

function BetRowSkeleton() {
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

/* ─── Page ─── */

export default function MyBetsPage() {
  const { connected, walletAddress } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const { data: balance } = useUsdcBalance();
  const [tab, setTab] = useState(0);
  const [claimingBetId, setClaimingBetId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [claimAllProgress, setClaimAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: betsData,
    isLoading: betsLoading,
    error: betsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteBets();
  const { data: claimableData } = useClaimableBets();
  const { claim, state: claimState, reset: resetClaim } = useClaim();

  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    setTab(newValue);
  };

  const handleClaim = async (poolId: string, betId: string) => {
    setClaimingBetId(betId);
    setClaimAllProgress(null);
    setShowModal(true);
    try {
      await claim(poolId, betId);
    } catch {
      // Error handled in state
    }
  };

  const handleClaimAll = async () => {
    if (!claimable) return;
    const betsToProcess = claimable.bets.filter((b) => !b.claimed);
    if (betsToProcess.length === 0) return;

    setClaimAllProgress({ current: 1, total: betsToProcess.length });
    setShowModal(true);

    for (let i = 0; i < betsToProcess.length; i++) {
      const bet = betsToProcess[i];
      setClaimAllProgress({ current: i + 1, total: betsToProcess.length });
      setClaimingBetId(bet.id);
      try {
        resetClaim();
        await claim(bet.pool.id, bet.id);
      } catch {
        // Stop on first error  user can retry or claim remaining individually
        return;
      }
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setClaimingBetId(null);
    setClaimAllProgress(null);
    resetClaim();
  };

  const bets = useMemo(() => {
    const flat = betsData?.pages.flatMap((p) => p.data ?? []) ?? [];
    const seen = new Set<string>();
    return flat.filter((bet) => {
      if (seen.has(bet.id)) return false;
      seen.add(bet.id);
      return true;
    });
  }, [betsData]);
  const claimable = claimableData?.data;

  const activeBets = bets.filter(
    (bet) => bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE'
  );
  const resolvedBets = bets.filter(
    (bet) => (bet.pool.status === 'RESOLVED' || bet.pool.status === 'CLAIMABLE') && !bet.claimed
  );
  const claimedBets = bets.filter((bet) => bet.claimed);

  const displayBets = tab === 0 ? activeBets : tab === 1 ? resolvedBets : claimedBets;

  const wonBets = bets.filter((b) => b.isWinner === true && !(b.claimed && b.payoutAmount != null && b.payoutAmount === b.amount));
  const lostBets = bets.filter((b) => b.isWinner === false);
  const totalStaked = useMemo(() => bets.reduce((sum, b) => sum + Number(b.amount), 0), [bets]);
  const totalPayout = useMemo(() => wonBets.filter((b) => b.payoutAmount).reduce((sum, b) => sum + Number(b.payoutAmount!), 0), [wonBets]);
  const hasClaimable = claimable && claimable.summary.count > 0;

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  return (
    <AppShell>
      {/* ─── Stats Row (top, like Hellcase) ─── */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Container maxWidth={false} sx={{ px: { xs: 1.5, md: 3 } }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: { xs: 0.5, md: 0 },
              py: { xs: 1, md: 1.5 },
            }}
          >
            {[
              { value: userProfile?.stats.totalBets ?? 0, label: 'PREDICTIONS', color: UP_COLOR },
              { value: `${userProfile?.stats.totalWins ?? 0}`, label: 'WINS', color: GAIN_COLOR },
              { value: `${userProfile?.stats.winRate ?? '0'}%`, label: 'WIN RATE', color: GAIN_COLOR },
              { value: userProfile?.stats.currentStreak ?? 0, label: 'CURRENT STREAK', color: ACCENT_COLOR },
              { value: userProfile?.stats.bestStreak ?? 0, label: 'BEST STREAK', color: ACCENT_COLOR },
            ].map((stat, i) => (
              <Box
                key={i}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexShrink: 0,
                }}
              >
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 700, color: stat.color, fontVariantNumeric: 'tabular-nums' }}>
                  {stat.value}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.65rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>
                  {stat.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Container>
      </Box>

      {/* ─── Banner ─── */}
      <Box
        sx={{
          width: '100%',
          height: { xs: 140, sm: 180, md: 240 },
          backgroundImage: 'url(/Banner/banner-web-1500x300.gif)',
          backgroundSize: 'contain',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          backgroundColor: '#0B0F14',
        }}
      />

      {/* ─── Profile Strip (overlaps banner bottom) ─── */}
      <Box sx={{ bgcolor: '#0D1219' }}>
        <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
          {!connected ? (
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Typography sx={{ color: 'text.secondary', fontWeight: 400, mb: 3, fontSize: '1rem' }}>
                Connect your wallet to view your profile
              </Typography>
              <ConnectWalletButton variant="page" />
            </Box>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: '2.5fr repeat(6, 1fr)' },
                gap: 0.5,
                mt: { xs: -3, md: -5 },
                py: { xs: 1.5, md: 2 },
              }}
            >
              {/* ── Card 1: Avatar + Level + XP (full width on mobile, 2 cols on desktop) ── */}
              <Box sx={{ gridColumn: { xs: '1 / -1', md: 'auto' }, display: 'flex', alignItems: 'center', gap: { xs: 1.5, md: 2 }, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5 }}>
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                  {walletAddress ? (
                    <Avatar
                      src={getAvatarUrl(walletAddress)}
                      sx={{ width: { xs: 40, md: 56 }, height: { xs: 40, md: 56 } }}
                    />
                  ) : (
                    <Skeleton variant="circular" width={56} height={56} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
                  )}
                  {userProfile && (
                    <Box sx={{ position: 'absolute', bottom: -16, right: -6 }}>
                      <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" />
                    </Box>
                  )}
                </Box>
                <Box sx={{ minWidth: 0, flex: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {walletAddress ? truncateAddress(walletAddress) : ''}
                    </Typography>
                    <Box
                      component="button"
                      onClick={handleCopy}
                      sx={{
                        background: 'none', border: 'none', cursor: 'pointer', p: 0,
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        color: copied ? GAIN_COLOR : 'rgba(255,255,255,0.3)',
                        '&:hover': { color: '#fff' },
                      }}
                    >
                      {copied ? <CheckCircle sx={{ fontSize: 13 }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', mb: 0.5 }}>
                    {userProfile ? `LVL ${userProfile.level}: ${userProfile.title}` : ''}
                  </Typography>
                  {userProfile && (
                    <Box sx={{ width: '100%' }}>
                      <Box sx={{ width: '100%', height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.max(0, Math.min(100, (userProfile.xpProgress || 0) * 100))}%`, height: '100%', borderRadius: 4, bgcolor: ACCENT_COLOR }} />
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>
                          XP {(Number(userProfile.totalXp) - Number(userProfile.xpForCurrentLevel)).toLocaleString()}/{(Number(userProfile.xpForNextLevel) - Number(userProfile.xpForCurrentLevel)).toLocaleString()}
                        </Typography>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)' }}>
                          {userProfile.level >= 40 ? 'MAX' : `${userProfile.level + 1} LVL`}
                        </Typography>
                      </Box>
                    </Box>
                  )}
                </Box>
              </Box>

              {/* ── Card 2: Balance ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    Your funds
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    $ {balance ? balance.uiAmount.toFixed(2) : '0.00'}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 3: UP Coins ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    UP Coins
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                    <Box component="img" src="/token/Token_16px_Gold.png" alt="UP" sx={{ width: { xs: 14, md: 18 }, height: { xs: 14, md: 18 } }} />
                    <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: ACCENT_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                      {userProfile ? (Number(userProfile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                    </Typography>
                  </Box>
                </Box>
              </Box>

              {/* ── Card 4: Predictions ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    Predictions
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {userProfile?.stats.totalBets ?? bets.length}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 5: Win / Loss ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    Win / Loss
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    <Box component="span" sx={{ color: GAIN_COLOR }}>{wonBets.length}</Box>
                    <Box component="span" sx={{ color: 'rgba(255,255,255,0.3)', mx: 0.5 }}>/</Box>
                    <Box component="span" sx={{ color: DOWN_COLOR }}>{lostBets.length}</Box>
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 6: Total Staked ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    Total Staked
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    ${(totalStaked / USDC_DIVISOR).toFixed(0)}
                  </Typography>
                </Box>
              </Box>

              {/* ── Card 7: Total Won ── */}
              <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                    Total Won
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                    ${(totalPayout / USDC_DIVISOR).toFixed(0)}
                  </Typography>
                </Box>
              </Box>
            </Box>
          )}
        </Container>
      </Box>

      <Container maxWidth={false} sx={{ pb: { xs: 3, md: 6 }, pt: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
        {connected && (
          <>
            {/* ─── Claim All Banner ─── */}
            {hasClaimable && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  px: 3,
                  py: 2,
                  mb: 3,
                  background: `linear-gradient(135deg, ${GAIN_COLOR}20, ${GAIN_COLOR}08)`,
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: GAIN_COLOR }}>
                  {claimable!.summary.count} TO CLAIM  {formatUSDC(claimable!.summary.totalClaimable, { min: 2 })}
                </Typography>
                <Button
                  variant="contained"
                  onClick={handleClaimAll}
                  disabled={claimAllProgress !== null}
                  sx={{
                    background: `linear-gradient(135deg, ${GAIN_COLOR}, #16A34A)`,
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 4,
                    py: 0.75,
                    textTransform: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { background: `linear-gradient(135deg, ${GAIN_COLOR}DD, #16A34ADD)` },
                    '&:disabled': { background: 'rgba(255,255,255,0.2)', color: 'rgba(0,0,0,0.5)' },
                  }}
                >
                  {claimAllProgress ? `Claiming ${claimAllProgress.current}/${claimAllProgress.total}...` : 'Claim All'}
                </Button>
              </Box>
            )}

            {/* Tabs */}
            <Box
              sx={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                mb: 3,
              }}
            >
              <Tabs
                value={tab}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 44,
                  '& .MuiTabs-indicator': {
                    backgroundColor: UP_COLOR,
                    height: 2,
                  },
                  '& .MuiTab-root': {
                    color: 'text.secondary',
                    fontWeight: 500,
                    textTransform: 'none',
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    px: { xs: 1.5, sm: 2.5 },
                    minHeight: 44,
                    minWidth: 'auto',
                    '&.Mui-selected': {
                      color: '#FFFFFF',
                    },
                  },
                }}
              >
                <Tab label={`Active (${activeBets.length})`} />
                <Tab label={`Resolved (${resolvedBets.length})`} />
                <Tab label={`Claimed (${claimedBets.length})`} />
              </Tabs>
            </Box>

            {/* Error */}
            {betsError && (
              <Alert
                severity="error"
                sx={{
                  mb: 4,
                  backgroundColor: 'rgba(255, 82, 82, 0.1)',
                  border: 'none',
                  borderRadius: 0,
                }}
              >
                Failed to load predictions
              </Alert>
            )}

            {/* Loading */}
            {betsLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <BetRowSkeleton key={i} />
                ))}
              </Box>
            )}

            {/* Predictions Table */}
            {!betsLoading && displayBets.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 12,
                  px: 4,
                }}
              >
                <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
                  No predictions found in this category
                </Typography>
              </Box>
            ) : !betsLoading && (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                {/* Table header (desktop only) */}
                <Box
                  sx={{
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr',
                    px: 0,
                    py: 1,
                    bgcolor: '#0D1219',
                  }}
                >
                  {['', 'Asset', 'Result', 'Stake', 'Payout', 'Price', 'Time', 'Action', 'Tx'].map((h, i) => (
                    <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                      {h}
                    </Typography>
                  ))}
                </Box>

                {/* Rows */}
                {displayBets.map((bet) => (
                  <BetRow
                    key={bet.id}
                    bet={bet}
                    onClaim={() => handleClaim(bet.pool.id, bet.id)}
                    isClaiming={claimingBetId === bet.id}
                  />
                ))}
              </Box>
            )}

            {/* Sentinel for infinite scroll */}
            <Box ref={sentinelRef} />

            {/* Loading next page */}
            {isFetchingNextPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                <CircularProgress size={32} sx={{ color: '#FFFFFF' }} />
              </Box>
            )}
          </>
        )}
      </Container>

      {/* Claim Modal */}
      <TransactionModal
        open={showModal}
        status={claimState.status}
        title={
          claimAllProgress
            ? `Claiming Payout (${claimAllProgress.current}/${claimAllProgress.total})`
            : 'Claiming Payout'
        }
        txSignature={claimState.txSignature}
        error={claimState.error}
        onClose={handleCloseModal}
        onRetry={() => resetClaim()}
      />
    </AppShell>
  );
}
