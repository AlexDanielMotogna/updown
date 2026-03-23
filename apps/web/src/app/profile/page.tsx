'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
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
} from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { TransactionModal, AppShell } from '@/components';
import { formatUSDC } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR } from '@/lib/constants';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { PoolsBetTable } from '@/components/profile/PoolsBetTable';
import { TournamentPrizes } from '@/components/profile/TournamentPrizes';
import {
  fetchMyTournamentPrizes,
  type TournamentPrize,
} from '@/lib/api';

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

  useEffect(() => {
    if (!walletAddress) return;
    setPrizesLoading(true);
    fetchMyTournamentPrizes(walletAddress)
      .then(res => { if (res.success && res.data) setPrizes(res.data); })
      .finally(() => setPrizesLoading(false));
  }, [walletAddress]);

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
            {/* Claim All Banner */}
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
            <Box sx={{ borderBottom: '1px solid rgba(255, 255, 255, 0.06)', mb: 3 }}>
              <Tabs
                value={tab}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 44,
                  '& .MuiTabs-indicator': { backgroundColor: UP_COLOR, height: 2 },
                  '& .MuiTab-root': {
                    color: 'text.secondary',
                    fontWeight: 500,
                    textTransform: 'none',
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    px: { xs: 1.5, sm: 2.5 },
                    minHeight: 44,
                    minWidth: 'auto',
                    '&.Mui-selected': { color: '#FFFFFF' },
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
                sx={{ mb: 4, backgroundColor: 'rgba(255, 82, 82, 0.1)', border: 'none', borderRadius: 0 }}
              >
                Failed to load predictions
              </Alert>
            )}

            {/* Pools Tab */}
            {tab === 0 && (
              <PoolsBetTable
                bets={bets}
                betsLoading={betsLoading}
                claimingBetId={claimingBetId}
                onClaim={handleClaim}
              />
            )}

            {/* Sentinel for infinite scroll */}
            {tab !== 3 && <Box ref={sentinelRef} />}

            {/* Loading next page */}
            {tab !== 3 && isFetchingNextPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                <CircularProgress size={32} sx={{ color: '#FFFFFF' }} />
              </Box>
            )}

            {/* Tournaments Tab */}
            {tab === 1 && (
              <TournamentPrizes
                walletAddress={walletAddress}
                prizes={prizes}
                setPrizes={setPrizes}
                prizesLoading={prizesLoading}
              />
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
