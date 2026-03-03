'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Alert,
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
} from '@mui/icons-material';
import Link from 'next/link';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { TransactionModal, AppShell, ConnectWalletButton, Countdown, AssetIcon } from '@/components';
import { formatUSDC, formatDate, formatPrice, formatDateTime, getExplorerTxUrl, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR, DOWN_COLOR } from '@/lib/constants';
import type { Bet } from '@/lib/api';

const ASSET_BOX_IMAGE: Record<string, string> = {
  BTC: '/boxes/Btc-box.png',
  ETH: '/boxes/Eth-box.png',
  SOL: '/boxes/Sol-box.png',
};

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
  const boxImageUrl = ASSET_BOX_IMAGE[bet.pool.asset];

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
        display: 'grid',
        gridTemplateColumns: { xs: '60px 1fr', md: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr' },
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
      {/* Box image */}
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          height: '100%',
          minHeight: { xs: 60, md: 70 },
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

      {/* Mobile layout */}
      <Box sx={{ display: { xs: 'block', md: 'none' }, py: 1.5, pl: 1 }}>
        {/* Row 1: Asset, side, status */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{bet.pool.asset}/USD</Typography>
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
          </Box>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
            <Chip
              label={resultLabel}
              size="small"
              sx={{ height: 20, fontSize: '0.6rem', fontWeight: 600, bgcolor: resultBg, color: resultColor, borderRadius: '2px' }}
            />
            <Chip
              label={isResolving ? 'Resolving...' : bet.pool.status}
              size="small"
              sx={{ ...(isResolving ? { bgcolor: 'rgba(251,191,36,0.12)', color: '#FBBF24' } : statusStyle), height: 20, fontSize: '0.55rem', fontWeight: 600, borderRadius: '2px' }}
            />
          </Box>
        </Box>

        {/* Row 2: Stake, payout, countdown */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 0.75 }}>
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
            Stake: <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>{formatUSDC(bet.amount, { min: 2 })}</Box>
          </Typography>
          {bet.payoutAmount && (
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: isRefund ? '#60A5FA' : GAIN_COLOR }}>
              {isRefund ? 'Refund' : 'Payout'}: {formatUSDC(bet.payoutAmount!, { min: 2 })}
            </Typography>
          )}
        </Box>

        {/* Row 3: Time + action */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {isActive && !isResolving ? (
            <Countdown targetDate={bet.pool.endTime} compact />
          ) : (
            <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
              {formatDate(bet.pool.endTime)}
            </Typography>
          )}
          {isClaimable && onClaim ? (
            <Button
              size="small"
              onClick={onClaim}
              disabled={isClaiming}
              sx={{
                px: 2, py: 0.5, fontSize: '0.75rem', fontWeight: 700,
                bgcolor: GAIN_COLOR, color: '#000', borderRadius: '2px', textTransform: 'none',
                '&:hover': { bgcolor: GAIN_COLOR, filter: 'brightness(1.15)' },
              }}
            >
              {isClaiming ? 'Claiming...' : 'Claim'}
            </Button>
          ) : (
            <Link href={`/pool/${bet.pool.id}`} style={{ textDecoration: 'none' }}>
              <Button size="small" sx={{ fontSize: '0.7rem', color: 'text.secondary', minWidth: 0, px: 1, textTransform: 'none' }}>
                View
              </Button>
            </Link>
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
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>—</Typography>
        )}
      </Box>

      {/* Price */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {bet.pool.strikePrice && bet.pool.finalPrice ? (
          <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', color: bet.pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR }}>
            {formatPrice(bet.pool.strikePrice)} → {formatPrice(bet.pool.finalPrice)}
          </Typography>
        ) : bet.pool.strikePrice ? (
          <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
            {formatPrice(bet.pool.strikePrice)}
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>—</Typography>
        )}
      </Box>

      {/* Time */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center' }}>
        {isResolving ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CircularProgress size={12} sx={{ color: '#FBBF24' }} />
            <Typography sx={{ fontSize: '0.8rem', color: '#FBBF24' }}>Resolving</Typography>
          </Box>
        ) : isActive ? (
          <Countdown targetDate={bet.pool.endTime} compact />
        ) : (
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>
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
          <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>—</Typography>
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
        display: 'grid',
        gridTemplateColumns: { xs: '60px 1fr', md: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr' },
        alignItems: 'center',
        px: 0,
        py: 1.5,
        bgcolor: '#0D1219',
      }}
    >
      <Skeleton variant="rounded" width={60} height={50} sx={{ bgcolor: 'rgba(255,255,255,0.04)', mx: 'auto' }} />
      <Box sx={{ display: { xs: 'block', md: 'none' }, pl: 1 }}>
        <Skeleton variant="text" width={120} height={20} sx={{ bgcolor: 'rgba(255,255,255,0.06)' }} />
        <Skeleton variant="text" width={80} height={16} sx={{ bgcolor: 'rgba(255,255,255,0.04)' }} />
      </Box>
      {[110, 50, 70, 80, 70, 80, 60, 90].map((w, i) => (
        <Skeleton key={i} variant="text" width={w} height={18} sx={{ bgcolor: 'rgba(255,255,255,0.06)', display: { xs: 'none', md: 'block' } }} />
      ))}
    </Box>
  );
}

/* ─── Page ─── */

export default function MyBetsPage() {
  const { connected } = useWalletBridge();
  const [tab, setTab] = useState(0);
  const [claimingBetId, setClaimingBetId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [claimAllProgress, setClaimAllProgress] = useState<{ current: number; total: number } | null>(null);

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
        // Stop on first error — user can retry or claim remaining individually
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

  // Portfolio stats (computed from all loaded bets)
  const totalStaked = useMemo(
    () => bets.reduce((sum, b) => sum + Number(b.amount), 0),
    [bets],
  );
  const wonBets = bets.filter((b) => b.isWinner === true && !(b.claimed && b.payoutAmount != null && b.payoutAmount === b.amount));
  const lostBets = bets.filter((b) => b.isWinner === false);
  const totalPayout = useMemo(
    () => wonBets.filter((b) => b.payoutAmount).reduce((sum, b) => sum + Number(b.payoutAmount!), 0),
    [wonBets],
  );
  const hasClaimable = claimable && claimable.summary.count > 0;

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  return (
    <AppShell>
      <Container maxWidth="xl" sx={{ py: { xs: 3, md: 6 } }}>
        <Typography
          variant="h3"
          sx={{ fontWeight: 400, mb: { xs: 3, md: 5 }, fontSize: { xs: '1.75rem', md: undefined } }}
        >
          Portfolio
        </Typography>

        {!connected ? (
          <Card
            sx={{
              background: '#0D1219',
              border: 'none',
            }}
          >
            <CardContent sx={{ textAlign: 'center', py: 10 }}>
              <Typography
                variant="h6"
                sx={{ color: 'text.secondary', fontWeight: 400, mb: 3 }}
              >
                Connect your wallet to view your predictions
              </Typography>
              <ConnectWalletButton variant="page" />
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Portfolio Stats — always visible */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: {
                  xs: '1fr 1fr',
                  sm: hasClaimable ? 'repeat(4, 1fr) auto' : 'repeat(4, 1fr)',
                },
                gap: '3px',
                mb: 4,
              }}
            >
              {/* Total Predictions */}
              <Box sx={{ px: 2.5, py: 2.5, background: `linear-gradient(135deg, ${UP_COLOR}12, ${UP_COLOR}04)` }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.08em', mb: 0.5 }}>
                  PREDICTIONS
                </Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
                  {bets.length}
                </Typography>
              </Box>

              {/* Win / Loss */}
              <Box sx={{ px: 2.5, py: 2.5, background: `linear-gradient(135deg, ${GAIN_COLOR}12, ${GAIN_COLOR}04)` }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.08em', mb: 0.5 }}>
                  WIN / LOSS
                </Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1 }}>
                  <Box component="span" sx={{ color: GAIN_COLOR }}>{wonBets.length}</Box>
                  <Box component="span" sx={{ color: 'text.secondary', mx: 0.5 }}>/</Box>
                  <Box component="span" sx={{ color: DOWN_COLOR }}>{lostBets.length}</Box>
                </Typography>
              </Box>

              {/* Total Staked */}
              <Box sx={{ px: 2.5, py: 2.5, background: 'linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))' }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.08em', mb: 0.5 }}>
                  TOTAL STAKED
                </Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: 'text.primary', lineHeight: 1 }}>
                  ${(totalStaked / USDC_DIVISOR).toFixed(0)}
                </Typography>
              </Box>

              {/* Total Won */}
              <Box sx={{ px: 2.5, py: 2.5, background: `linear-gradient(135deg, ${GAIN_COLOR}0A, ${GAIN_COLOR}03)` }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'text.secondary', letterSpacing: '0.08em', mb: 0.5 }}>
                  TOTAL WON
                </Typography>
                <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: GAIN_COLOR, lineHeight: 1 }}>
                  ${(totalPayout / USDC_DIVISOR).toFixed(0)}
                </Typography>
              </Box>

              {/* Claim card — only when there are claimable bets */}
              {hasClaimable && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: { xs: 2.5, md: 4 },
                    py: 2.5,
                    gridColumn: { xs: '1 / -1', sm: 'auto' },
                    background: `linear-gradient(135deg, ${GAIN_COLOR}20, ${GAIN_COLOR}08)`,
                    gap: 1,
                  }}
                >
                  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: GAIN_COLOR, letterSpacing: '0.08em', textAlign: 'center' }}>
                    {claimable!.summary.count} TO CLAIM — {formatUSDC(claimable!.summary.totalClaimable, { min: 2 })}
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
                      py: 1,
                      textTransform: 'none',
                      whiteSpace: 'nowrap',
                      '&:hover': {
                        background: `linear-gradient(135deg, ${GAIN_COLOR}DD, #16A34ADD)`,
                      },
                      '&:disabled': {
                        background: 'rgba(255, 255, 255, 0.2)',
                        color: 'rgba(0, 0, 0, 0.5)',
                      },
                    }}
                  >
                    {claimAllProgress
                      ? `Claiming ${claimAllProgress.current}/${claimAllProgress.total}...`
                      : 'Claim All'}
                  </Button>
                </Box>
              )}
            </Box>

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
                    fontSize: '0.85rem',
                    px: 2.5,
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
                    <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.08em' }}>
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
