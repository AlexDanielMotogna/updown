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
  Button,
  Collapse,
} from '@mui/material';
import {
  FilterList,
  Bolt,
  HourglassTop,
  ViewList,
} from '@mui/icons-material';
import { useInfinitePools, useBets, usePriceStream, useIntersectionObserver, type PoolFilters } from '@/hooks';
import { PoolTable, AppShell } from '@/components';
import { UP_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';

const ASSETS = ['ALL', 'BTC', 'ETH', 'SOL'];
const INTERVAL_OPTIONS = ['ALL', '1m', '5m', '15m', '1h'];
const INTERVAL_LABELS: Record<string, string> = {
  ALL: 'ALL',
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};
const STATUSES = ['ALL', 'JOINING', 'ACTIVE'];

const STATUS_ICONS = [
  <ViewList key="all" sx={{ fontSize: 18 }} />,
  <HourglassTop key="joining" sx={{ fontSize: 18 }} />,
  <Bolt key="active" sx={{ fontSize: 18 }} />,
];

const HOW_TO_PLAY = [
  {
    image: '/info-cards/info-1.webp',
    title: 'Pick a Pool',
    desc: 'Choose your asset & timeframe. BTC, ETH, SOL from 1min turbo to 1hr rounds.',
    gradient: `linear-gradient(135deg, ${ACCENT_COLOR}15, ${ACCENT_COLOR}05)`,
  },
  {
    image: '/info-cards/info-2.webp',
    title: 'Go UP or DOWN',
    desc: 'Stake USDC on your prediction. All bets go into the pool  winner takes all.',
    gradient: `linear-gradient(135deg, ${UP_COLOR}15, ${UP_COLOR}05)`,
  },
  {
    image: '/info-cards/info-3.png',
    title: 'Collect Winnings',
    desc: 'Price moves your way? Claim your share of the entire pool. Instant payout.',
    gradient: `linear-gradient(135deg, ${GAIN_COLOR}15, ${GAIN_COLOR}05)`,
  },
];

export default function MarketsPage() {
  const [assetFilter, setAssetFilter] = useState('ALL');
  const [intervalFilter, setIntervalFilter] = useState('ALL');
  const [statusTab, setStatusTab] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // "ALL" tab shows JOINING + ACTIVE pools; other tabs filter to a single status
  const selectedStatus = statusTab === 0 ? 'JOINING,ACTIVE' : STATUSES[statusTab];

  // Memoize filters to prevent unnecessary re-renders and WebSocket re-subscriptions
  const filters = useMemo(() => ({
    asset: assetFilter === 'ALL' ? undefined : assetFilter,
    interval: intervalFilter === 'ALL' ? undefined : intervalFilter,
    status: selectedStatus,
  }), [assetFilter, intervalFilter, selectedStatus]);

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

  const allPools = useMemo(() => {
    const flat = data?.pages.flatMap((p) => p.data ?? []) ?? [];
    const seen = new Set<string>();
    return flat.filter((pool) => {
      if (seen.has(pool.id)) return false;
      seen.add(pool.id);
      return true;
    });
  }, [data]);

  // Identify top 3 most popular pools (by participant count, min 2 bets)
  const { sortedPools, popularPoolIds } = useMemo(() => {
    if (allPools.length === 0) return { sortedPools: allPools, popularPoolIds: new Set<string>() };

    const candidates = [...allPools].filter(p => p.betCount >= 2);
    candidates.sort((a, b) => b.betCount - a.betCount);
    const top3Ids = new Set(candidates.slice(0, 3).map(p => p.id));

    // Move popular pools to the top (ordered by betCount desc), rest keep original order
    const popular = allPools.filter(p => top3Ids.has(p.id)).sort((a, b) => b.betCount - a.betCount);
    const rest = allPools.filter(p => !top3Ids.has(p.id));

    return { sortedPools: [...popular, ...rest], popularPoolIds: top3Ids };
  }, [allPools]);

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

  // Filters are now fully handled server-side; use sorted list with popular pools first
  const pools = sortedPools;

  const selectedPillSx = {
    backgroundColor: `${UP_COLOR}18`,
    color: UP_COLOR,
  };

  return (
    <AppShell>
      <Container maxWidth="xl">
            {/* How to Play — 3 cards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: '3px',
                mt: { xs: 2, md: 3 },
                mb: 3,
              }}
            >
              {HOW_TO_PLAY.map((card) => (
                <Box
                  key={card.title}
                  sx={{
                    position: 'relative',
                    overflow: 'hidden',
                    display: 'flex',
                    alignItems: 'center',
                    minHeight: { xs: 90, md: 110 },
                    px: { xs: 2, md: 2.5 },
                    py: { xs: 1.5, md: 2 },
                    background: card.gradient,
                    transition: 'background 0.2s ease',
                    '&:hover': { background: 'rgba(255,255,255,0.03)' },
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                    <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.9rem', md: '1rem' }, mb: 0.5 }}>
                      {card.title}
                    </Typography>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.82rem' }, fontWeight: 500, color: 'text.secondary', lineHeight: 1.5, maxWidth: { xs: '80%', md: '70%' } }}>
                      {card.desc}
                    </Typography>
                  </Box>
                  <Box
                    component="img"
                    src={card.image}
                    alt={card.title}
                    sx={{
                      position: 'absolute',
                      right: -10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: { xs: '100%', md: '120%' },
                      width: 'auto',
                      objectFit: 'contain',
                      opacity: { xs: 0.6, md: 0.9 },
                    }}
                  />
                </Box>
              ))}
            </Box>

            {/* Status tabs + Filters — Hellcase style */}
            <Box sx={{ mb: 3 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Tabs
                  value={statusTab}
                  onChange={handleStatusChange}
                  variant="scrollable"
                  scrollButtons={false}
                  sx={{
                    minHeight: 44,
                    '& .MuiTabs-indicator': {
                      backgroundColor: ACCENT_COLOR,
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
                      gap: 0.75,
                      '&.Mui-selected': { color: '#FFFFFF' },
                    },
                  }}
                >
                  {STATUSES.map((status, i) => (
                    <Tab
                      key={status}
                      icon={STATUS_ICONS[i]}
                      iconPosition="start"
                      label={status}
                    />
                  ))}
                </Tabs>

                <Button
                  variant="text"
                  size="small"
                  startIcon={<FilterList />}
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  sx={{
                    borderRadius: '4px',
                    color: filtersOpen ? ACCENT_COLOR : 'text.secondary',
                    textTransform: 'none',
                    fontWeight: 500,
                    fontSize: '0.85rem',
                    px: 2,
                    '&:hover': {
                      bgcolor: `${ACCENT_COLOR}10`,
                    },
                  }}
                >
                  Filters
                </Button>
              </Box>

              {/* Collapsible filter panel */}
              <Collapse in={filtersOpen}>
                <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', sm: 'center' }, gap: { xs: 1, sm: 2 }, py: 2, flexWrap: 'wrap', overflowX: 'auto' }}>
                  <ToggleButtonGroup
                    value={assetFilter}
                    exclusive
                    onChange={handleAssetChange}
                    sx={{
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px',
                      '& .MuiToggleButtonGroup-grouped': {
                        border: 'none',
                        borderRadius: '4px !important',
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
                      border: 'none',
                      borderRadius: '4px',
                      padding: '3px',
                      '& .MuiToggleButtonGroup-grouped': {
                        border: 'none',
                        borderRadius: '4px !important',
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
              </Collapse>
            </Box>

            {/* Error State */}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 4,
                  backgroundColor: 'rgba(248, 113, 113, 0.1)',
                  border: 'none',
                  borderRadius: 0,
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
                  popularPoolIds={popularPoolIds}
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
    </AppShell>
  );
}
