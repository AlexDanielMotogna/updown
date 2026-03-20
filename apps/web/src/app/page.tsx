'use client';

import { useMemo, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Alert,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  GridView,
  Timer,
  Speed,
  AvTimer,
  Schedule,
} from '@mui/icons-material';
import { useInfinitePools, useBets, usePriceStream, useIntersectionObserver, type PoolFilters } from '@/hooks';
import { PoolTable, AppShell } from '@/components';
import { UP_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';

const ASSET_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: 'BTC', label: 'BTC', img: '/coins/btc-coin.png' },
  { value: 'ETH', label: 'ETH', img: '/coins/eth-coin.png' },
  { value: 'SOL', label: 'SOL', img: '/coins/sol-coin.png' },
];

const INTERVAL_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: '3m', label: '3 min', icon: <Speed sx={{ fontSize: 16 }} /> },
  { value: '5m', label: '5 min', icon: <Timer sx={{ fontSize: 16 }} /> },
  { value: '15m', label: '15 min', icon: <AvTimer sx={{ fontSize: 16 }} /> },
  { value: '1h', label: '1 hour', icon: <Schedule sx={{ fontSize: 16 }} /> },
];

const HOW_TO_PLAY = [
  {
    image: '/info-cards/info-1.webp',
    title: 'Pick a Pool',
    desc: 'Choose your asset & timeframe. BTC, ETH, SOL from 3min turbo to 1hr rounds.',
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read filters from URL (fallback to defaults)
  const assetValues = ASSET_FILTERS.map(f => f.value);
  const intervalValues = INTERVAL_FILTERS.map(f => f.value);
  const assetFilter = assetValues.includes(searchParams.get('asset') ?? '') ? searchParams.get('asset')! : 'ALL';
  const intervalFilter = intervalValues.includes(searchParams.get('interval') ?? '') ? searchParams.get('interval')! : 'ALL';

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL' || value === 'all') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  // Show all live pools (JOINING = open for betting)
  const filters = useMemo(() => ({
    asset: assetFilter === 'ALL' ? undefined : assetFilter,
    interval: intervalFilter === 'ALL' ? undefined : intervalFilter,
    status: 'JOINING',
  }), [assetFilter, intervalFilter]);

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

  // Sort pools: those with bets first (by betCount desc), rest keep original order
  const { sortedPools, popularPoolIds } = useMemo(() => {
    if (allPools.length === 0) return { sortedPools: allPools, popularPoolIds: new Set<string>() };

    const withBets = allPools.filter(p => p.betCount >= 1).sort((a, b) => b.betCount - a.betCount);
    const withoutBets = allPools.filter(p => p.betCount === 0);

    // Mark top 3 (with at least 2 bets) as "POPULAR"
    const popularCandidates = withBets.filter(p => p.betCount >= 2);
    const top3Ids = new Set(popularCandidates.slice(0, 3).map(p => p.id));

    return { sortedPools: [...withBets, ...withoutBets], popularPoolIds: top3Ids };
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

  // Filters are now fully handled server-side; use sorted list with popular pools first
  const pools = sortedPools;

  return (
    <AppShell>
      <Container maxWidth="xl">
            {/* How to Play  3 cards */}
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

            {/* Filters */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between', mb: 3, gap: { xs: 1, sm: 1 } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflowX: 'auto', WebkitOverflowScrolling: 'touch', '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
                {ASSET_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    size="small"
                    icon={f.img ? (
                      <Box component="img" src={f.img} alt={f.label} sx={{ width: 16, height: 16, borderRadius: '50%' }} />
                    ) : f.icon}
                    onClick={() => updateParam('asset', f.value)}
                    sx={{
                      fontWeight: 600, fontSize: { xs: '0.72rem', sm: '0.8rem' }, border: 'none', flexShrink: 0,
                      height: { xs: 28, sm: 32 },
                      backgroundColor: assetFilter === f.value ? `${UP_COLOR}20` : 'rgba(255,255,255,0.04)',
                      color: assetFilter === f.value ? UP_COLOR : 'text.secondary',
                      '&:hover': { backgroundColor: assetFilter === f.value ? `${UP_COLOR}28` : 'rgba(255,255,255,0.08)' },
                    }}
                  />
                ))}
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflowX: 'auto', WebkitOverflowScrolling: 'touch', '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
                {INTERVAL_FILTERS.map((f) => (
                  <Chip
                    key={f.value}
                    label={f.label}
                    size="small"
                    icon={f.icon}
                    onClick={() => updateParam('interval', f.value)}
                    sx={{
                      fontWeight: 600, fontSize: { xs: '0.72rem', sm: '0.8rem' }, border: 'none', flexShrink: 0,
                      height: { xs: 28, sm: 32 },
                      backgroundColor: intervalFilter === f.value ? `${UP_COLOR}20` : 'rgba(255,255,255,0.04)',
                      color: intervalFilter === f.value ? UP_COLOR : 'text.secondary',
                      '&:hover': { backgroundColor: intervalFilter === f.value ? `${UP_COLOR}28` : 'rgba(255,255,255,0.08)' },
                    }}
                  />
                ))}
              </Box>
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
