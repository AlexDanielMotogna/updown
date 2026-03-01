'use client';

import { useState, useMemo } from 'react';
import {
  Box,
  Container,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Alert,
  Tabs,
  Tab,
  CircularProgress,
} from '@mui/material';
import { useInfinitePools, useBets, usePriceStream, useIntersectionObserver, type PoolFilters } from '@/hooks';
import { PoolTable, Header, LiveResultsSidebar } from '@/components';
import { UP_COLOR } from '@/lib/constants';

const ASSETS = ['ALL', 'BTC', 'ETH', 'SOL'];
const INTERVAL_OPTIONS = ['ALL', '1m', '5m', '15m', '1h'];
const INTERVAL_LABELS: Record<string, string> = {
  ALL: 'ALL',
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};
const STATUSES = ['ALL', 'UPCOMING', 'JOINING', 'ACTIVE', 'RESOLVED'];

export default function MarketsPage() {
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [intervalFilter, setIntervalFilter] = useState('ALL');
  const [statusTab, setStatusTab] = useState(0);

  const selectedStatus = statusTab === 0 ? undefined : STATUSES[statusTab];
  const isResolvedTab = selectedStatus === 'RESOLVED';

  const filters: Omit<PoolFilters, 'page' | 'limit'> = {
    asset: assetFilter === 'ALL' ? undefined : assetFilter,
    interval: intervalFilter === 'ALL' ? undefined : intervalFilter,
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

  const { data: betsData } = useBets();
  const { getPrice } = usePriceStream(['BTC', 'ETH', 'SOL']);

  const allPools = useMemo(
    () => data?.pages.flatMap((p) => p.data ?? []) ?? [],
    [data]
  );

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
    if (newAsset) setAssetFilter(newAsset);
  };

  const handleIntervalChange = (_: React.MouseEvent, newInterval: string | null) => {
    if (newInterval) setIntervalFilter(newInterval);
  };

  const handleStatusChange = (_: React.SyntheticEvent, newValue: number) => {
    setStatusTab(newValue);
  };

  // Filter pools for resolved tab
  let pools = allPools;
  if (isResolvedTab) {
    const userPoolIds = new Set((betsData?.data || []).map((bet) => bet.pool.id));
    pools = pools.filter(
      (pool) =>
        (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') &&
        userPoolIds.has(pool.id)
    );
  }

  const selectedPillSx = {
    backgroundColor: `${UP_COLOR}18`,
    color: UP_COLOR,
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', md: 0 } }}>
      <Header />

      <Box sx={{ display: 'flex' }}>
        {/* Left Sidebar */}
        <LiveResultsSidebar />

        {/* Main Content */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Hero - Compact */}
          <Box sx={{ pt: { xs: 4, md: 5 }, pb: { xs: 2, md: 3 }, textAlign: 'center' }}>
            <Typography
              variant="h4"
              sx={{
                fontWeight: 600,
                letterSpacing: '-0.02em',
                fontSize: { xs: '1.3rem', md: '1.5rem' },
              }}
            >
              Predict. Stake.{' '}
              <Box component="span" sx={{ color: UP_COLOR }}>
                Win.
              </Box>
            </Typography>
          </Box>

          <Container maxWidth="lg">
            {/* Filters - Single compact row */}
            <Box sx={{ mb: 3 }}>
              {/* Asset + Interval filters in one row */}
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                  value={assetFilter}
                  exclusive
                  onChange={handleAssetChange}
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 50,
                    padding: '3px',
                    '& .MuiToggleButtonGroup-grouped': {
                      border: 'none',
                      borderRadius: '50px !important',
                      mx: 0.25,
                      px: { xs: 1.5, sm: 2.5 },
                      py: 0.75,
                      color: 'text.secondary',
                      fontWeight: 400,
                      fontSize: '0.8rem',
                      transition: 'all 0.3s ease',
                      '&.Mui-selected': selectedPillSx,
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
                    },
                  }}
                >
                  {ASSETS.map((asset) => (
                    <ToggleButton key={asset} value={asset}>{asset}</ToggleButton>
                  ))}
                </ToggleButtonGroup>

                <ToggleButtonGroup
                  value={intervalFilter}
                  exclusive
                  onChange={handleIntervalChange}
                  sx={{
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: 50,
                    padding: '3px',
                    '& .MuiToggleButtonGroup-grouped': {
                      border: 'none',
                      borderRadius: '50px !important',
                      mx: 0.25,
                      px: { xs: 1.25, sm: 2 },
                      py: 0.75,
                      color: 'text.secondary',
                      fontWeight: 400,
                      fontSize: '0.8rem',
                      transition: 'all 0.3s ease',
                      '&.Mui-selected': selectedPillSx,
                      '&:hover': { backgroundColor: 'rgba(255, 255, 255, 0.04)' },
                    },
                  }}
                >
                  {INTERVAL_OPTIONS.map((interval) => (
                    <ToggleButton key={interval} value={interval}>
                      {INTERVAL_LABELS[interval]}
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
                      backgroundColor: UP_COLOR,
                      height: 2,
                    },
                    '& .MuiTab-root': {
                      color: 'text.secondary',
                      fontWeight: 400,
                      textTransform: 'none',
                      fontSize: '0.9rem',
                      px: 2.5,
                      minWidth: 'auto',
                      '&.Mui-selected': { color: '#FFFFFF' },
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
                  backgroundColor: 'rgba(248, 113, 113, 0.1)',
                  border: '1px solid rgba(248, 113, 113, 0.3)',
                  borderRadius: 1,
                }}
              >
                Failed to load pools. Please try again.
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={32} sx={{ color: UP_COLOR }} />
              </Box>
            )}

            {/* Pool Table */}
            {!isLoading && (
              <>
                <PoolTable
                  pools={pools}
                  userBetByPoolId={userBetByPoolId}
                  getPrice={getPrice}
                  isPlaceholderData={isPlaceholderData}
                />

                {/* Sentinel for infinite scroll */}
                <Box ref={sentinelRef} />

                {/* Loading next page */}
                {isFetchingNextPage && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                    <CircularProgress size={32} sx={{ color: UP_COLOR }} />
                  </Box>
                )}

                {/* End of results */}
                {!hasNextPage && pools.length > 0 && (
                  <Box sx={{ textAlign: 'center', mt: 4, pb: 4 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', fontWeight: 400 }}
                    >
                      Showing all {pools.length} pools
                    </Typography>
                  </Box>
                )}
              </>
            )}
          </Container>
        </Box>
      </Box>
    </Box>
  );
}
