'use client';

import { useState, useMemo, useCallback } from 'react';
import { useQueryClient, type InfiniteData } from '@tanstack/react-query';
import {
  Box,
  Container,
  Alert,
  Button,
  CircularProgress,
} from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { useLivePoolTotals } from '@/hooks/useLivePoolTotals';
import type { Bet } from '@/lib/api';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { TransactionModal, AppShell } from '@/components';
import { formatUSDC } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { PositionsTab } from '@/components/profile/PositionsTab';
import { PnLChart } from '@/components/profile/PnLChart';
import { ProfileInsights } from '@/components/profile/ProfileInsights';

/**
 * /profile - intentionally minimal. Identity header + P&L chart + the single
 * Positions surface with Active / Closed sub-tabs. Other sections of the
 * product (Rewards is surfaced in the header via level / XP / coins;
 * Referrals lives at /referrals; Tournaments at /tournaments) keep their own
 * routes - surfacing them all here as tabs duplicated information without
 * adding value.
 */
export default function MyBetsPage() {
  const t = useThemeTokens();
  const { connected, walletAddress } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const { data: balance } = useUsdcBalance();
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

  const handleClaim = useCallback(async (poolId: string, betId: string) => {
    setClaimingBetId(betId);
    setClaimAllProgress(null);
    setShowModal(true);
    try {
      await claim(poolId, betId);
    } catch {
      /* error surfaces via claim state */
    }
  }, [claim]);

  const handleClaimAll = useCallback(async () => {
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
        return; // stop on first failure
      }
    }
  }, [claim, resetClaim]);

  const handleCloseModal = useCallback(() => {
    setShowModal(false);
    setClaimingBetId(null);
    setClaimAllProgress(null);
    resetClaim();
  }, [resetClaim]);

  const bets = useMemo(() => {
    const flat = betsData?.pages.flatMap((p) => p.data ?? []) ?? [];
    const seen = new Set<string>();
    return flat.filter((bet) => {
      if (seen.has(bet.id)) return false;
      seen.add(bet.id);
      return true;
    });
  }, [betsData]);

  // Live totals: subscribe to the pools backing the user's ACTIVE positions
  // and patch the cached bets in place so the scenario P&L updates as new bets
  // land — no refetch. The hook is reusable for other live-pool surfaces.
  const queryClient = useQueryClient();
  const activePoolIds = useMemo(() => {
    const ids = new Set<string>();
    for (const b of bets) {
      if (b.pool.status === 'JOINING' || b.pool.status === 'ACTIVE' || b.pool.status === 'UPCOMING') {
        ids.add(b.pool.id);
      }
    }
    return [...ids];
  }, [bets]);

  useLivePoolTotals(activePoolIds, (d) => {
    queryClient.setQueryData<InfiniteData<{ data?: Bet[]; meta?: unknown }>>(
      ['infiniteBets', walletAddress],
      (old) => {
        if (!old?.pages) return old;
        return {
          ...old,
          pages: old.pages.map((pg) => ({
            ...pg,
            data: pg.data?.map((b) =>
              b.pool.id === d.id
                ? {
                    ...b,
                    pool: {
                      ...b.pool,
                      totalUp: d.totalUp ?? b.pool.totalUp,
                      totalDown: d.totalDown ?? b.pool.totalDown,
                      totalDraw: d.totalDraw ?? b.pool.totalDraw,
                      weightedUp: d.weightedUp ?? b.pool.weightedUp,
                      weightedDown: d.weightedDown ?? b.pool.weightedDown,
                      weightedDraw: d.weightedDraw ?? b.pool.weightedDraw,
                    },
                  }
                : b,
            ),
          })),
        };
      },
    );
  });

  const claimable = claimableData?.data;
  const hasClaimable = claimable && claimable.summary.count > 0;

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  return (
    <AppShell centered>
      <ProfileHeader
        connected={connected}
        walletAddress={walletAddress}
        userProfile={userProfile}
        balance={balance}
      />

      <Container maxWidth={false} sx={{ maxWidth: 1400, pb: { xs: 3, md: 6 }, pt: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
        {connected && walletAddress && (
          <>
            {/* Claim All Banner (manual fallback for payoutFailed bets) */}
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
                  background: `linear-gradient(135deg, ${t.gain}20, ${t.gain}08)`,
                }}
              >
                <Box sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.gain }}>
                  {claimable!.summary.count} TO CLAIM - {formatUSDC(claimable!.summary.totalClaimable, { min: 2 })}
                </Box>
                <Button
                  variant="contained"
                  onClick={handleClaimAll}
                  disabled={claimAllProgress !== null}
                  sx={{
                    background: `linear-gradient(135deg, ${t.gain}, #16A34A)`,
                    color: '#000',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    px: 4,
                    py: 0.75,
                    textTransform: 'none',
                    whiteSpace: 'nowrap',
                    '&:hover': { background: `linear-gradient(135deg, ${t.gain}DD, #16A34ADD)` },
                    '&:disabled': { background: 'rgba(255,255,255,0.2)', color: 'rgba(0,0,0,0.5)' },
                  }}
                >
                  {claimAllProgress ? `Claiming ${claimAllProgress.current}/${claimAllProgress.total}...` : 'Claim All'}
                </Button>
              </Box>
            )}

            {/* P&L chart (narrower) + insight tiles beside it. Stacks on mobile. */}
            <Box sx={{ mb: 4, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.6fr 1fr' }, gap: 2 }}>
              <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, p: 2 }}>
                <PnLChart bets={bets} />
              </Box>
              <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, p: 2 }}>
                <ProfileInsights bets={bets} profile={userProfile} />
              </Box>
            </Box>

            {/* Positions */}
            {betsError ? (
              <Alert severity="error" sx={{ mb: 4, backgroundColor: 'rgba(255, 82, 82, 0.1)', border: 'none', borderRadius: 1 }}>
                Failed to load positions
              </Alert>
            ) : (
              <PositionsTab
                bets={bets}
                betsLoading={betsLoading}
                claimingBetId={claimingBetId}
                onClaim={handleClaim}
              />
            )}

            <Box ref={sentinelRef} />
            {isFetchingNextPage && (
              <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                <CircularProgress size={32} sx={{ color: t.text.primary }} />
              </Box>
            )}
          </>
        )}
      </Container>

      <TransactionModal
        open={showModal}
        status={claimState.status}
        title={claimAllProgress
          ? `Claiming Payout (${claimAllProgress.current}/${claimAllProgress.total})`
          : 'Claiming Payout'}
        txSignature={claimState.txSignature}
        error={claimState.error}
        onClose={handleCloseModal}
        onRetry={() => resetClaim()}
      />
    </AppShell>
  );
}
