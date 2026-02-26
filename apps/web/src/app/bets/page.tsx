'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Tabs,
  Tab,
  Grid,
  Alert,
  Card,
  CardContent,
  Button,
  CircularProgress,
} from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useInfiniteBets, useClaimableBets, useClaim, useIntersectionObserver } from '@/hooks';
import { BetCard, BetCardSkeleton, TransactionModal, Header, ConnectWalletButton } from '@/components';
import { formatUSDC } from '@/lib/format';

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

  const bets = useMemo(
    () => betsData?.pages.flatMap((p) => p.data ?? []) ?? [],
    [betsData]
  );
  const claimable = claimableData?.data;

  const activeBets = bets.filter(
    (bet) => bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE'
  );
  const resolvedBets = bets.filter(
    (bet) => (bet.pool.status === 'RESOLVED' || bet.pool.status === 'CLAIMABLE') && !bet.claimed
  );
  const claimedBets = bets.filter((bet) => bet.claimed);

  const displayBets = tab === 0 ? activeBets : tab === 1 ? resolvedBets : claimedBets;

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header showBackButton />

      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Typography
          variant="h3"
          sx={{ fontWeight: 400, mb: 5 }}
        >
          Portfolio
        </Typography>

        {!connected ? (
          <Card
            sx={{
              background: '#141414',
              border: '1px solid rgba(255, 255, 255, 0.08)',
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
            {/* Claimable Summary */}
            {claimable && claimable.summary.count > 0 && (
              <Card
                sx={{
                  mb: 5,
                  background: 'rgba(0, 229, 255, 0.06)',
                  border: '1px solid rgba(0, 229, 255, 0.15)',
                }}
              >
                <CardContent sx={{ py: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                      <Typography
                        variant="h5"
                        sx={{ color: '#FFFFFF', fontWeight: 500, mb: 0.5 }}
                      >
                        {claimable.summary.count} Winning Prediction{claimable.summary.count > 1 ? 's' : ''} to Claim
                      </Typography>
                      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        Total claimable:{' '}
                        <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {formatUSDC(claimable.summary.totalClaimable, { min: 2 })}
                        </Box>
                      </Typography>
                    </Box>
                    <Button
                      variant="contained"
                      onClick={handleClaimAll}
                      disabled={claimAllProgress !== null}
                      sx={{
                        background: '#FFFFFF',
                        color: '#0A0A0A',
                        fontWeight: 600,
                        px: 4,
                        py: 1.5,
                        '&:hover': {
                          background: 'rgba(255, 255, 255, 0.9)',
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
                </CardContent>
              </Card>
            )}

            {/* Tabs */}
            <Box
              sx={{
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                mb: 4,
              }}
            >
              <Tabs
                value={tab}
                onChange={handleTabChange}
                sx={{
                  '& .MuiTabs-indicator': {
                    backgroundColor: '#FFFFFF',
                    height: 2,
                  },
                  '& .MuiTab-root': {
                    color: 'text.secondary',
                    fontWeight: 400,
                    textTransform: 'none',
                    fontSize: '0.95rem',
                    px: 3,
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
                  border: '1px solid rgba(255, 82, 82, 0.3)',
                  borderRadius: 1,
                }}
              >
                Failed to load predictions
              </Alert>
            )}

            {/* Loading */}
            {betsLoading && (
              <Grid container spacing={4}>
                {[1, 2, 3, 4].map((i) => (
                  <Grid item xs={12} md={6} key={i}>
                    <BetCardSkeleton />
                  </Grid>
                ))}
              </Grid>
            )}

            {/* Predictions List */}
            {!betsLoading && displayBets.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 12,
                  px: 4,
                  borderRadius: 1,
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                }}
              >
                <Typography sx={{ color: 'text.secondary', fontSize: '1.1rem' }}>
                  No predictions found in this category
                </Typography>
              </Box>
            ) : (
              <Grid container spacing={4}>
                {displayBets.map((bet) => (
                  <Grid item xs={12} md={6} key={bet.id}>
                    <BetCard
                      bet={bet}
                      onClaim={() => handleClaim(bet.pool.id, bet.id)}
                      isClaiming={claimingBetId === bet.id}
                    />
                  </Grid>
                ))}
              </Grid>
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
    </Box>
  );
}
