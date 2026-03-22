'use client';

import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Alert,
  Button,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { TransactionModal, AppShell } from '@/components';
import { formatUSDC, formatDate, USDC_DIVISOR } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR, DOWN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { BetRow, BetRowSkeleton } from '@/components/profile/BetRow';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import {
  fetchMyTournamentPrizes,
  claimTournamentPrize,
  type TournamentPrize,
} from '@/lib/api';
import { EmojiEvents, CheckCircle, OpenInNew } from '@mui/icons-material';
import { useEffect } from 'react';
import Link from 'next/link';

const TAB_KEYS = ['pools', 'tournaments'] as const;

export default function MyBetsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { connected, walletAddress } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const { data: balance } = useUsdcBalance();
  const tabParam = searchParams.get('tab') ?? 'pools';
  const tabIndex = TAB_KEYS.indexOf(tabParam as typeof TAB_KEYS[number]);
  const tab = tabIndex >= 0 ? tabIndex : 0;
  const [claimingBetId, setClaimingBetId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [claimAllProgress, setClaimAllProgress] = useState<{ current: number; total: number } | null>(null);

  // Tournament prizes
  const [prizes, setPrizes] = useState<TournamentPrize[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(false);
  const [claimingTournamentId, setClaimingTournamentId] = useState<string | null>(null);
  const [claimTxResult, setClaimTxResult] = useState<{ id: string; tx: string } | null>(null);
  const [claimPrizeError, setClaimPrizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!walletAddress) return;
    setPrizesLoading(true);
    fetchMyTournamentPrizes(walletAddress)
      .then(res => { if (res.success && res.data) setPrizes(res.data); })
      .finally(() => setPrizesLoading(false));
  }, [walletAddress]);

  const handleClaimPrize = async (tournamentId: string) => {
    if (!walletAddress) return;
    setClaimingTournamentId(tournamentId);
    setClaimPrizeError(null);
    setClaimTxResult(null);
    try {
      const res = await claimTournamentPrize(tournamentId, walletAddress);
      if (res.success && res.data) {
        setClaimTxResult({ id: tournamentId, tx: res.data.txSignature });
        setPrizes(prev => prev.map(p => p.id === tournamentId ? { ...p, prizeClaimedTx: res.data!.txSignature } : p));
      } else {
        setClaimPrizeError(res.error?.message || 'Failed to claim');
      }
    } catch {
      setClaimPrizeError('Failed to claim prize');
    } finally {
      setClaimingTournamentId(null);
    }
  };

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

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    const params = new URLSearchParams(searchParams.toString());
    const key = TAB_KEYS[newValue]!;
    if (key === 'pools') {
      params.delete('tab');
    } else {
      params.set('tab', key);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

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

  const displayBets = bets;

  const wonBets = bets.filter((b) => b.isWinner === true && !(b.claimed && b.payoutAmount != null && b.payoutAmount === b.amount));
  const lostBets = bets.filter((b) => b.isWinner === false);
  const totalStaked = useMemo(() => bets.reduce((sum, b) => sum + Number(b.amount), 0), [bets]);
  const totalPayout = useMemo(() => wonBets.filter((b) => b.payoutAmount).reduce((sum, b) => sum + Number(b.payoutAmount!), 0), [wonBets]);
  const hasClaimable = claimable && claimable.summary.count > 0;

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  return (
    <AppShell>
      <ProfileHeader
        connected={connected}
        walletAddress={walletAddress}
        userProfile={userProfile}
        balance={balance}
        totalBets={bets.length}
        wonCount={wonBets.length}
        lostCount={lostBets.length}
        totalStaked={totalStaked}
        totalPayout={totalPayout}
      />

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
                <Tab label={`Pools (${bets.length})`} />
                <Tab label={`Tournaments${prizes.length > 0 ? ` (${prizes.length})` : ''}`} />
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
            {tab === 0 && betsLoading && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <BetRowSkeleton key={i} />
                ))}
              </Box>
            )}

            {/* Pools Table */}
            {tab !== 0 ? null : !betsLoading && displayBets.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 12,
                  px: 4,
                }}
              >
                <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
                  No predictions yet
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
                  {[
                    { label: '', tip: '' },
                    { label: 'Asset', tip: 'Cryptocurrency and pool timeframe' },
                    { label: 'Result', tip: 'Whether your prediction was correct' },
                    { label: 'Stake', tip: 'USDC amount you placed on this pool' },
                    { label: 'Payout', tip: 'USDC received after fees (winners only)' },
                    { label: 'Price', tip: 'Strike price at open vs final price at close' },
                    { label: 'Time', tip: 'When the pool was resolved' },
                    { label: 'Action', tip: '' },
                    { label: 'Tx', tip: 'View transaction on Solana Explorer' },
                  ].map((h, i) => (
                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                        {h.label}
                      </Typography>
                      {h.tip && (
                        <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                          <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                        </Tooltip>
                      )}
                    </Box>
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
            {tab !== 3 && <Box ref={sentinelRef} />}

            {/* Loading next page */}
            {tab !== 3 && isFetchingNextPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                <CircularProgress size={32} sx={{ color: '#FFFFFF' }} />
              </Box>
            )}

            {/* ─── Tournaments Tab ─── */}
            {tab === 1 && (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {prizesLoading && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                    <CircularProgress size={28} sx={{ color: 'rgba(255,255,255,0.3)' }} />
                  </Box>
                )}

                {!prizesLoading && prizes.length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 12 }}>
                    <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
                      No tournament prizes yet
                    </Typography>
                  </Box>
                )}

                {!prizesLoading && prizes.length > 0 && (
                  <>
                    {/* Table header (desktop) */}
                    <Box
                      sx={{
                        display: { xs: 'none', md: 'grid' },
                        gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr',
                        px: 0,
                        py: 1,
                        bgcolor: '#0D1219',
                      }}
                    >
                      {['Tournament', 'Asset', 'Prize Pool', 'Fee', 'Payout', 'Date', 'Action'].map((h) => (
                        <Typography key={h} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                          {h}
                        </Typography>
                      ))}
                    </Box>

                    {/* Rows */}
                    {prizes.map((prize) => {
                      const prizeUsdc = (Number(prize.prizePool) / 1_000_000).toFixed(2);
                      const feeUsdc = (Number(prize.prizePool) * 0.05 / 1_000_000).toFixed(2);
                      const netUsdc = (Number(prize.prizePool) * 0.95 / 1_000_000).toFixed(2);
                      const claimed = !!prize.prizeClaimedTx;
                      const justClaimed = claimTxResult?.id === prize.id;
                      const isClaiming = claimingTournamentId === prize.id;
                      const tx = prize.prizeClaimedTx || (justClaimed ? claimTxResult?.tx : null);

                      return (
                        <Box key={prize.id}>
                          {/* Desktop row */}
                          <Box
                            sx={{
                              display: { xs: 'none', md: 'grid' },
                              gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr',
                              alignItems: 'center',
                              bgcolor: '#0D1219',
                              py: 1.5,
                              transition: 'background 0.15s ease',
                              '&:hover': { background: 'rgba(255,255,255,0.04)' },
                            }}
                          >
                            <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{prize.name}</Typography>
                            <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{prize.asset}</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${prizeUsdc}</Typography>
                            <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>${feeUsdc}</Typography>
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>${netUsdc}</Typography>
                            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                              {prize.completedAt ? formatDate(prize.completedAt) : '--'}
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {!claimed && !justClaimed ? (
                                <Button
                                  variant="contained"
                                  size="small"
                                  disabled={isClaiming}
                                  onClick={() => handleClaimPrize(prize.id)}
                                  sx={{
                                    bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.75rem',
                                    textTransform: 'none', px: 2, borderRadius: 0,
                                    '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                                    '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                                  }}
                                >
                                  {isClaiming ? <CircularProgress size={14} sx={{ color: '#000' }} /> : 'Claim'}
                                </Button>
                              ) : (
                                <>
                                  <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                                  {tx && (
                                    <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                                      <OpenInNew sx={{ fontSize: 14, color: ACCENT_COLOR, '&:hover': { color: '#fff' }, transition: 'color 0.15s' }} />
                                    </a>
                                  )}
                                </>
                              )}
                            </Box>
                          </Box>

                          {/* Mobile row */}
                          <Box
                            sx={{
                              display: { xs: 'block', md: 'none' },
                              bgcolor: '#0D1219',
                              p: 2,
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                              <Box>
                                <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{prize.name}</Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                                  {prize.asset} · {prize.completedAt ? formatDate(prize.completedAt) : ''}
                                </Typography>
                              </Box>
                              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                                ${netUsdc}
                              </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                                Pool ${prizeUsdc} · Fee ${feeUsdc}
                              </Typography>
                              {!claimed && !justClaimed ? (
                                <Button
                                  variant="contained"
                                  size="small"
                                  disabled={isClaiming}
                                  onClick={() => handleClaimPrize(prize.id)}
                                  sx={{
                                    bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.75rem',
                                    textTransform: 'none', px: 2, borderRadius: 0,
                                    '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                                    '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                                  }}
                                >
                                  {isClaiming ? <CircularProgress size={14} sx={{ color: '#000' }} /> : 'Claim'}
                                </Button>
                              ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                                  <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                                  {tx && (
                                    <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                                      <OpenInNew sx={{ fontSize: 14, color: ACCENT_COLOR }} />
                                    </a>
                                  )}
                                </Box>
                              )}
                            </Box>
                          </Box>
                        </Box>
                      );
                    })}
                  </>
                )}

                {claimPrizeError && (
                  <Alert severity="error" onClose={() => setClaimPrizeError(null)} sx={{ bgcolor: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 0 }}>
                    {claimPrizeError}
                  </Alert>
                )}
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
