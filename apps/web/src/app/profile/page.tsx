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
  IconButton,
} from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { TransactionModal, AppShell } from '@/components';
import { ReferralDashboard } from '@/components/ReferralDashboard';
import { formatUSDC } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { GridView, FilterList } from '@mui/icons-material';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { PoolsBetTable } from '@/components/profile/PoolsBetTable';
import { TournamentPrizes } from '@/components/profile/TournamentPrizes';
import { OverviewTab } from '@/components/profile/OverviewTab';
import { RewardsTab } from '@/components/profile/RewardsTab';
import { HISTORY_FILTERS, getCategoryMeta } from '@/components/profile/category-meta';
import {
  fetchMyTournamentPrizes,
  type TournamentPrize,
} from '@/lib/api';

const TAB_KEYS = ['overview', 'history', 'rewards', 'referrals', 'tournaments'] as const;
type TabKey = typeof TAB_KEYS[number];

export default function MyBetsPage() {
  const t = useThemeTokens();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { connected, walletAddress } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const { data: balance } = useUsdcBalance();
  const tabParam = searchParams.get('tab') ?? 'overview';
  const tabIndex = TAB_KEYS.indexOf(tabParam as TabKey);
  const tab = tabIndex >= 0 ? tabIndex : 0;
  const [claimingBetId, setClaimingBetId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [claimAllProgress, setClaimAllProgress] = useState<{ current: number; total: number } | null>(null);
  const [poolFilter, setPoolFilter] = useState<string>('ALL');
  const [showPoolFilters, setShowPoolFilters] = useState(false);

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

  const goToTab = useCallback((key: TabKey) => {
    const params = new URLSearchParams(searchParams.toString());
    if (key === 'overview') params.delete('tab');
    else params.set('tab', key);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const handleTabChange = useCallback((_: React.SyntheticEvent, newValue: number) => {
    goToTab(TAB_KEYS[newValue]!);
  }, [goToTab]);

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

  const filteredBets = useMemo(() => {
    if (poolFilter === 'ALL') return bets;
    if (poolFilter === 'CRYPTO') return bets.filter(b => b.pool.poolType !== 'SPORTS');
    if (poolFilter === 'SPORTS') return bets.filter(b => b.pool.poolType === 'SPORTS' && !b.pool.league?.startsWith('PM_'));
    // PM categories
    return bets.filter(b => b.pool.league === poolFilter);
  }, [bets, poolFilter]);

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
      />

      <Container maxWidth={false} sx={{ pb: { xs: 3, md: 6 }, pt: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
        {connected && walletAddress && (
          <>
            {/* Claim All Banner (global CTA) */}
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
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.gain }}>
                  {claimable!.summary.count} TO CLAIM — {formatUSDC(claimable!.summary.totalClaimable, { min: 2 })}
                </Typography>
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

            {/* Tabs + filter icon */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${t.border.default}`, mb: 3 }}>
              <Tabs
                value={tab}
                onChange={handleTabChange}
                variant="scrollable"
                scrollButtons={false}
                sx={{
                  minHeight: 44,
                  '& .MuiTabs-indicator': { backgroundColor: t.up, height: 2 },
                  '& .MuiTab-root': {
                    color: 'text.secondary',
                    fontWeight: 500,
                    textTransform: 'none',
                    fontSize: { xs: '0.8rem', sm: '0.85rem' },
                    px: { xs: 1.5, sm: 2.5 },
                    minHeight: 44,
                    minWidth: 'auto',
                    '&.Mui-selected': { color: t.text.primary },
                  },
                }}
              >
                <Tab label="Overview" />
                <Tab label={`History${bets.length ? ` (${bets.length})` : ''}`} />
                <Tab label="Rewards" />
                <Tab label="Referrals" />
                <Tab label={`Tournaments${prizes.length > 0 ? ` (${prizes.length})` : ''}`} />
              </Tabs>
              {tab === 1 && (
                <IconButton
                  onClick={() => setShowPoolFilters(!showPoolFilters)}
                  size="small"
                  sx={{ color: showPoolFilters ? t.text.primary : t.text.quaternary, '&:hover': { color: t.text.primary }, mr: 1 }}
                >
                  <FilterList sx={{ fontSize: 20 }} />
                </IconButton>
              )}
            </Box>

            {/* ─── Overview ─── */}
            {tab === 0 && (
              <OverviewTab walletAddress={walletAddress} userProfile={userProfile} onViewTab={goToTab} />
            )}

            {/* ─── History ─── */}
            {tab === 1 && (
              <>
                {betsError && (
                  <Alert severity="error" sx={{ mb: 4, backgroundColor: 'rgba(255, 82, 82, 0.1)', border: 'none', borderRadius: 1 }}>
                    Failed to load predictions
                  </Alert>
                )}

                {showPoolFilters && (
                  <Box sx={{ display: 'flex', gap: 0, mb: 2, overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
                    {HISTORY_FILTERS.map(key => {
                      const meta = key === 'ALL'
                        ? { label: 'All', color: t.text.primary, icon: <GridView sx={{ fontSize: 16 }} /> }
                        : getCategoryMeta(key, t, 16);
                      const active = poolFilter === key;
                      return (
                        <Box
                          key={key}
                          onClick={() => setPoolFilter(key)}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 0.75,
                            px: { xs: 1.25, md: 2 }, py: 1, cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: active ? `2px solid ${meta.color}` : '2px solid transparent',
                            color: active ? meta.color : t.text.quaternary,
                            transition: 'all 0.15s ease', '&:hover': { color: meta.color },
                          }}
                        >
                          {meta.icon}
                          <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: active ? 700 : 500 }}>
                            {meta.label}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}

                <PoolsBetTable
                  bets={filteredBets}
                  betsLoading={betsLoading}
                  claimingBetId={claimingBetId}
                  onClaim={handleClaim}
                />

                <Box ref={sentinelRef} />
                {isFetchingNextPage && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                    <CircularProgress size={32} sx={{ color: t.text.primary }} />
                  </Box>
                )}
              </>
            )}

            {/* ─── Rewards ─── */}
            {tab === 2 && <RewardsTab walletAddress={walletAddress} />}

            {/* ─── Referrals ─── */}
            {tab === 3 && <ReferralDashboard walletAddress={walletAddress} />}

            {/* ─── Tournaments ─── */}
            {tab === 4 && (
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
