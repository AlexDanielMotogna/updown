'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import { useInfinitePools, useBets, usePriceStream, useIntersectionObserver, type PoolFilters } from '@/hooks';
import { PoolCard, PoolCardSkeleton, Header } from '@/components';

const ASSETS = ['ALL', 'BTC', 'ETH', 'SOL'];
const STATUSES = ['ALL', 'UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED'];

export default function MarketsPage() {
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [statusTab, setStatusTab] = useState(0);

  const selectedStatus = statusTab === 0 ? undefined : STATUSES[statusTab];
  const isResolvedTab = selectedStatus === 'RESOLVED';

  const filters: Omit<PoolFilters, 'page' | 'limit'> = {
    asset: assetFilter === 'ALL' ? undefined : assetFilter,
    status: isResolvedTab ? undefined : selectedStatus,
  };

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInfinitePools(filters);

  // Fetch user bets to filter RESOLVED tab to only pools user participated in
  const { data: betsData } = useBets();

  // Subscribe to live prices for all assets
  const { getPrice } = usePriceStream(['BTC', 'ETH', 'SOL']);

  const allPools = useMemo(
    () => data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [data]
  );

  // Map poolId → user's bet for that pool
  const userBetByPoolId = useMemo(() => {
    const map = new Map<string, { side: 'UP' | 'DOWN'; isWinner: boolean | null }>();
    for (const bet of betsData?.data || []) {
      map.set(bet.pool.id, { side: bet.side, isWinner: bet.isWinner });
    }
    return map;
  }, [betsData]);

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  const handleAssetChange = (_: React.MouseEvent, newAsset: string | null) => {
    if (newAsset) {
      setAssetFilter(newAsset);
    }
  };

  const handleStatusChange = (_: React.SyntheticEvent, newValue: number) => {
    setStatusTab(newValue);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', md: 0 } }}>
      <Header />

      {/* Hero Section */}
      <Box
        sx={{
          pt: { xs: 10, md: 14 },
          pb: { xs: 6, md: 10 },
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <Container maxWidth="md" sx={{ position: 'relative', zIndex: 1 }}>
          <Typography
            variant="h1"
            sx={{
              fontSize: { xs: '2.5rem', md: '3.5rem' },
              fontWeight: 600,
              color: '#FFFFFF',
              mb: 3,
            }}
          >
            Predict. Stake. Win.
          </Typography>
          <Typography
            variant="h5"
            sx={{
              color: 'text.secondary',
              fontWeight: 300,
              maxWidth: 500,
              mx: 'auto',
              lineHeight: 1.6,
            }}
          >
            Stake USDC on UP or DOWN price movements. Winners split the pool proportionally.
          </Typography>
        </Container>
      </Box>

      <Container maxWidth="lg">
        {/* Filters Section */}
        <Box sx={{ mb: 6 }}>
          {/* Asset Filter - Pill Style */}
          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4, overflowX: 'auto' }}>
            <ToggleButtonGroup
              value={assetFilter}
              exclusive
              onChange={handleAssetChange}
              sx={{
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 50,
                padding: '4px',
                '& .MuiToggleButtonGroup-grouped': {
                  border: 'none',
                  borderRadius: '50px !important',
                  mx: 0.5,
                  px: { xs: 1.5, sm: 3 },
                  py: 1,
                  color: 'text.secondary',
                  fontWeight: 400,
                  transition: 'all 0.3s ease',
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: '#FFFFFF',
                  },
                  '&:hover': {
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  },
                },
              }}
            >
              {ASSETS.map((asset) => (
                <ToggleButton key={asset} value={asset}>
                  {asset}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>

          {/* Status Tabs */}
          <Box
            sx={{
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <Tabs
              value={statusTab}
              onChange={handleStatusChange}
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
              {STATUSES.map((status) => (
                <Tab key={status} label={status} />
              ))}
            </Tabs>
          </Box>
        </Box>

        {/* Error State */}
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 4,
              backgroundColor: 'rgba(255, 82, 82, 0.1)',
              border: '1px solid rgba(255, 82, 82, 0.3)',
              borderRadius: 1,
            }}
          >
            Failed to load pools. Please try again.
          </Alert>
        )}

        {/* Loading State */}
        {isLoading && (
          <Grid container spacing={4} alignItems="stretch">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Grid item xs={12} sm={6} lg={4} key={i} sx={{ display: 'flex' }}>
                <PoolCardSkeleton />
              </Grid>
            ))}
          </Grid>
        )}

        {/* Pools Grid */}
        {!isLoading && (() => {
          let pools = allPools;

          if (isResolvedTab) {
            // Show only resolved/claimable pools the user participated in
            const userPoolIds = new Set(
              (betsData?.data || []).map((bet) => bet.pool.id)
            );
            pools = pools.filter(
              (pool) =>
                (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') &&
                userPoolIds.has(pool.id)
            );
          }

          return (
          <>
            {pools.length === 0 ? (
              <Box
                sx={{
                  textAlign: 'center',
                  py: 12,
                  px: 4,
                  borderRadius: 1,
                  border: '1px dashed rgba(255, 255, 255, 0.1)',
                }}
              >
                <Typography color="text.secondary" sx={{ fontSize: '1.1rem' }}>
                  No pools found with current filters
                </Typography>
              </Box>
            ) : (
              <Grid
                container
                spacing={4}
                alignItems="stretch"
                sx={{
                  opacity: isPlaceholderData ? 0.5 : 1,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {pools.map((pool) => (
                  <Grid item xs={12} sm={6} lg={4} key={pool.id} sx={{ display: 'flex' }}>
                    <PoolCard pool={pool} livePrice={getPrice(pool.asset)} userBet={userBetByPoolId.get(pool.id)} />
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

            {/* End of results */}
            {!hasNextPage && pools.length > 0 && (
              <Box sx={{ textAlign: 'center', mt: 6, pb: 6 }}>
                <Typography
                  variant="body2"
                  sx={{ color: 'text.secondary', fontWeight: 400 }}
                >
                  Showing all {pools.length} pools
                </Typography>
              </Box>
            )}
          </>
          );
        })()}
      </Container>
    </Box>
  );
}
