'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Alert,
  Button,
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
import { useInfinitePools, useBets, useClaimableBets, useClaim, usePriceStream, useIntersectionObserver, type PoolFilters } from '@/hooks';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { PoolTable, AppShell } from '@/components';
import { MatchCard } from '@/components/sports/MatchCard';
import { MatchBetModal } from '@/components/sports/MatchBetModal';
import { MarketFilter, type MarketType } from '@/components/sports/MarketFilter';
import { TournamentBanner } from '@/components/tournament/TournamentBanner';
import { CryptoPoolModal } from '@/components/pool/CryptoPoolModal';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

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

function useHowToPlayCards() {
  const t = useThemeTokens();
  return {
    crypto: [
      { image: '/assets/asset-card-1.png', title: 'Pick a Pool', desc: 'Choose your asset & timeframe. BTC, ETH, SOL from 3min turbo to 1hr rounds.', gradient: `linear-gradient(135deg, ${withAlpha(t.accent, 0.08)}, ${withAlpha(t.accent, 0.02)})` },
      { image: '/assets/asset-card-2.png', title: 'Go UP or DOWN', desc: 'Stake USDC on your prediction. All bets go into the pool — winner takes all.', gradient: `linear-gradient(135deg, ${withAlpha(t.up, 0.08)}, ${withAlpha(t.up, 0.02)})` },
      { image: '/assets/asset-card-3.png', title: 'Collect Winnings', desc: 'Price moves your way? Claim your share of the entire pool. Instant payout.', gradient: `linear-gradient(135deg, ${withAlpha(t.gain, 0.08)}, ${withAlpha(t.gain, 0.02)})` },
    ],
    sports: [
      { image: '/assets/asset-card-1.png', title: 'Pick a Match', desc: 'Browse upcoming football matches across Champions League, Premier League, La Liga & more.', gradient: `linear-gradient(135deg, ${withAlpha(t.accent, 0.08)}, ${withAlpha(t.accent, 0.02)})` },
      { image: '/assets/asset-card-2.png', title: 'Home, Draw or Away', desc: 'Stake USDC on your prediction. All bets go into the pool — winner takes all.', gradient: `linear-gradient(135deg, ${withAlpha(t.up, 0.08)}, ${withAlpha(t.up, 0.02)})` },
      { image: '/assets/asset-card-3.png', title: 'Collect Winnings', desc: 'Your team wins? Claim your share of the entire pool. Payout after full time.', gradient: `linear-gradient(135deg, ${withAlpha(t.gain, 0.08)}, ${withAlpha(t.gain, 0.02)})` },
    ],
    predictions: [
      { image: '/assets/asset-card-1.png', title: 'Pick a Market', desc: 'Politics, geopolitics, culture, sports futures — real-world events with real odds.', gradient: `linear-gradient(135deg, ${withAlpha(t.prediction, 0.08)}, ${withAlpha(t.prediction, 0.02)})` },
      { image: '/assets/asset-card-2.png', title: 'Yes or No', desc: 'Stake USDC on your prediction. All bets go into the pool — winner takes all.', gradient: `linear-gradient(135deg, ${withAlpha(t.up, 0.08)}, ${withAlpha(t.up, 0.02)})` },
      { image: '/assets/asset-card-3.png', title: 'Collect Winnings', desc: 'Event resolves your way? Claim your share of the entire pool.', gradient: `linear-gradient(135deg, ${withAlpha(t.gain, 0.08)}, ${withAlpha(t.gain, 0.02)})` },
    ],
  };
}

export default function MarketsPage() {
  const t = useThemeTokens();
  const howToPlay = useHowToPlayCards();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read filters from URL (fallback to defaults)
  const assetValues = ASSET_FILTERS.map(f => f.value);
  const intervalValues = INTERVAL_FILTERS.map(f => f.value);
  const rawType = searchParams.get('type');
  // Accept any type that starts with PM_ or is CRYPTO/SPORTS (dynamic from DB)
  const marketType: MarketType = rawType && (rawType === 'CRYPTO' || rawType === 'SPORTS' || rawType.startsWith('PM_')) ? rawType : 'CRYPTO';
  const isPM = marketType.startsWith('PM_');
  const sportFilter = searchParams.get('sport') ?? 'ALL';
  const assetFilter = assetValues.includes(searchParams.get('asset') ?? '') ? searchParams.get('asset')! : 'ALL';
  const intervalFilter = intervalValues.includes(searchParams.get('interval') ?? '') ? searchParams.get('interval')! : 'ALL';
  const leagueFilter = searchParams.get('league') ?? 'ALL';

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

  // Show all live pools; for sports include recently resolved pools
  const filters = useMemo(() => ({
    asset: assetFilter === 'ALL' ? undefined : assetFilter,
    interval: intervalFilter === 'ALL' ? undefined : intervalFilter,
    type: isPM ? 'SPORTS' : marketType,
    status: marketType === 'SPORTS' || isPM ? 'JOINING,ACTIVE,CLAIMABLE,RESOLVED' : 'JOINING',
  }), [assetFilter, intervalFilter, marketType, isPM]);

  // Sports/PM: load all pools at once (typically ~50-100) so client-side
  // sorting (live first) works immediately without scrolling to load more.
  // Crypto: paginate normally (could have many more pools).
  const isSportsOrPM = marketType === 'SPORTS' || isPM;

  const {
    data,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPlaceholderData,
  } = useInfinitePools(
    isSportsOrPM ? { ...filters, limit: 500 } : filters,
    { refetchInterval: isSportsOrPM ? 30_000 : 15_000 },
  );

  const { data: betsData } = useBets();
  const { data: claimableData } = useClaimableBets();
  const { claim } = useClaim();
  const { getPrice } = usePriceStream(['BTC', 'ETH', 'SOL']);
  const liveScores = useLiveScores();
  const categoryMap = useCategoryMap();

  const allPools = useMemo(() => {
    const flat = data?.pages.flatMap((p) => p.data ?? []) ?? [];
    const seen = new Set<string>();
    const cutoff = Date.now() - 48 * 60 * 60 * 1000; // 48h ago
    return flat.filter((pool) => {
      if (seen.has(pool.id)) return false;
      seen.add(pool.id);
      // Hide resolved pools older than 48h from the feed
      if ((pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED') && new Date(pool.updatedAt).getTime() < cutoff) return false;
      return true;
    });
  }, [data]);

  // Resolve livescore for a pool: by matchId first, team name fallback only for football
  const getPoolLiveScore = useCallback((p: typeof allPools[0]) => {
    if (!p.matchId) return undefined;
    const byId = liveScores.get(p.matchId);
    if (byId) return byId;
    // Team name fallback for football pools
    const cat = p.league ? categoryMap.get(p.league) : undefined;
    if (cat?.type === 'FOOTBALL_LEAGUE' && p.homeTeam) {
      return liveScores.get(p.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, ''));
    }
    return undefined;
  }, [liveScores, categoryMap]);

  // Sort pools: live first, then popular+upcoming, then upcoming, then ended
  const { sortedPools, popularPoolIds } = useMemo(() => {
    if (allPools.length === 0) return { sortedPools: allPools, popularPoolIds: new Set<string>() };

    // Mark top 3 (with at least 2 bets) as "POPULAR"
    const byBets = [...allPools].sort((a, b) => b.betCount - a.betCount);
    const popularCandidates = byBets.filter(p => p.betCount >= 2);
    const top3Ids = new Set(popularCandidates.slice(0, 3).map(p => p.id));

    const FINISHED = new Set(['FT', 'AET', 'PEN', 'AOT', 'AP']);

    // Priority tiers: 0=live, 1=popular+upcoming, 2=upcoming, 3=popular+ended, 4=ended
    const tier = (p: typeof allPools[0]) => {
      const ls = getPoolLiveScore(p);
      const isLive = ls && !FINISHED.has(ls.status) && ls.status !== 'NS';
      const hasScore = p.homeScore != null && p.awayScore != null;
      const isEnded = (ls && FINISHED.has(ls.status)) || p.status === 'RESOLVED' || p.status === 'CLAIMABLE' || hasScore;
      const isPopular = top3Ids.has(p.id);
      if (isLive) return 0;
      if (isPopular && !isEnded) return 1;
      if (!isEnded) return 2;
      if (isPopular) return 3;
      return 4;
    };

    const sorted = [...allPools].sort((a, b) => {
      const ta = tier(a), tb = tier(b);
      if (ta !== tb) return ta - tb;
      // Within same tier: popular by betCount, others by startTime
      if (top3Ids.has(a.id) && top3Ids.has(b.id)) return b.betCount - a.betCount;
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });

    return { sortedPools: sorted, popularPoolIds: top3Ids };
  }, [allPools, getPoolLiveScore]);

  const userBetByPoolId = useMemo(() => {
    const map = new Map<string, { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null; betId?: string }>();
    for (const bet of betsData?.data || []) {
      map.set(bet.pool.id, { side: bet.side, isWinner: bet.isWinner, betId: bet.id });
    }
    // Merge claimable info (betId needed for claim action)
    for (const bet of claimableData?.data?.bets || []) {
      const existing = map.get(bet.pool.id);
      if (existing) existing.betId = bet.id;
      else map.set(bet.pool.id, { side: bet.side, isWinner: true, betId: bet.id });
    }
    return map;
  }, [betsData, claimableData]);

  const sentinelRef = useIntersectionObserver(
    () => { if (hasNextPage && !isFetchingNextPage) fetchNextPage(); },
    hasNextPage && !isFetchingNextPage
  );

  // Split pools by type for conditional rendering
  const cryptoPools = useMemo(() => sortedPools.filter(p => p.poolType !== 'SPORTS'), [sortedPools]);
  const sportsPools = useMemo(() => {
    const allSports = sortedPools.filter(p => p.poolType === 'SPORTS' && !p.league?.startsWith('PM_'));
    let filtered = allSports;
    // Filter by sport type
    if (sportFilter === 'SOCCER') {
      // Football leagues are those with a category of type FOOTBALL_LEAGUE
      const footballCodes = new Set([...categoryMap.entries()].filter(([_, c]) => c.type === 'FOOTBALL_LEAGUE').map(([code]) => code));
      filtered = filtered.filter(p => footballCodes.has(p.league || ''));
    } else if (sportFilter !== 'ALL') {
      filtered = filtered.filter(p => p.league === sportFilter);
    }
    // Filter by league (only for soccer)
    if (leagueFilter !== 'ALL' && (sportFilter === 'ALL' || sportFilter === 'SOCCER')) {
      filtered = filtered.filter(p => p.league === leagueFilter);
    }
    return filtered;
  }, [sortedPools, sportFilter, leagueFilter]);
  const predictionPools = useMemo(() => {
    if (!isPM) return [];
    return sortedPools.filter(p => p.poolType === 'SPORTS' && p.league === marketType);
  }, [sortedPools, marketType, isPM]);
  const pools = sortedPools;

  // Modal states
  const [selectedSportsPool, setSelectedSportsPool] = useState<typeof allPools[number] | null>(null);
  const [selectedCryptoPool, setSelectedCryptoPool] = useState<typeof allPools[number] | null>(null);
  const CARDS_PER_PAGE = 12;
  const [sportsVisible, setSportsVisible] = useState(CARDS_PER_PAGE);
  const [predVisible, setPredVisible] = useState(CARDS_PER_PAGE);

  // Auto-expand visible count when new pools arrive (so they're not hidden behind "Show more")
  const prevSportsCount = useRef(0);
  const prevPredCount = useRef(0);
  useEffect(() => {
    if (sportsPools.length > prevSportsCount.current && prevSportsCount.current > 0) {
      const added = sportsPools.length - prevSportsCount.current;
      setSportsVisible(v => v + added);
    }
    prevSportsCount.current = sportsPools.length;
  }, [sportsPools.length]);
  useEffect(() => {
    if (predictionPools.length > prevPredCount.current && prevPredCount.current > 0) {
      const added = predictionPools.length - prevPredCount.current;
      setPredVisible(v => v + added);
    }
    prevPredCount.current = predictionPools.length;
  }, [predictionPools.length]);

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
            <TournamentBanner />

            {/* How to Play  3 cards */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(3, 1fr)' },
                gap: { xs: 1.5, md: 2 },
                mt: { xs: 2, md: 3 },
                mb: 3,
              }}
            >
              {(isPM ? howToPlay.predictions : marketType === 'SPORTS' ? howToPlay.sports : howToPlay.crypto).map((card) => (
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
                    '&:hover': { background: t.hover.light },
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
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      height: { xs: '85%', md: '100%' },
                      width: 'auto',
                      objectFit: 'contain',
                      opacity: { xs: 0.6, md: 0.9 },
                    }}
                  />
                </Box>
              ))}
            </Box>

            {/* Filters */}
            <MarketFilter
              marketType={marketType}
              onMarketTypeChange={(v: MarketType) => {
                const params = new URLSearchParams();
                if (v !== 'CRYPTO') params.set('type', v);
                const qs = params.toString();
                router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
                setSportsVisible(CARDS_PER_PAGE);
                setPredVisible(CARDS_PER_PAGE);
              }}
              assetFilter={assetFilter}
              intervalFilter={intervalFilter}
              onAssetChange={(v) => updateParam('asset', v)}
              onIntervalChange={(v) => updateParam('interval', v)}
              assetOptions={ASSET_FILTERS}
              intervalOptions={INTERVAL_FILTERS}
              sportFilter={sportFilter}
              onSportChange={(v) => updateParam('sport', v)}
              leagueFilter={leagueFilter}
              onLeagueChange={(v) => updateParam('league', v)}
            />

            {/* Error State */}
            {error && (
              <Alert
                severity="error"
                sx={{
                  mb: 4,
                  backgroundColor: 'rgba(248, 113, 113, 0.1)',
                  border: 'none',
                  borderRadius: 1,
                }}
              >
                Failed to load pools. Please try again.
              </Alert>
            )}

            {/* Loading State */}
            {isLoading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
                <CircularProgress size={32} sx={{ color: t.up }} />
              </Box>
            )}

            {/* Pool Table + Sports Cards */}
            {!isLoading && (
              <>
                {/* Sports match cards */}
                {marketType === 'SPORTS' && sportsPools.length > 0 && (
                  <>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                        gap: { xs: 1.5, md: 2 },
                        mb: 0,
                      }}
                    >
                      {sportsPools.slice(0, sportsVisible).map((pool) => (
                        <MatchCard key={pool.id} pool={pool} isPopular={popularPoolIds.has(pool.id)} liveScore={getPoolLiveScore(pool)} category={pool.league ? categoryMap.get(pool.league) : undefined} userBet={userBetByPoolId.get(pool.id)} onClaim={(poolId, betId) => claim(poolId, betId)} onClick={() => setSelectedSportsPool(pool)} />
                      ))}
                    </Box>
                    {sportsVisible < sportsPools.length && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 6 }}>
                        <Box
                          onClick={() => setSportsVisible(v => v + CARDS_PER_PAGE)}
                          sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 1,
                            px: 3, py: 1, cursor: 'pointer',
                            border: `1px solid ${t.border.medium}`,
                            borderRadius: 1,
                            color: t.text.secondary,
                            fontSize: '0.8rem', fontWeight: 600,
                            transition: 'all 0.15s ease',
                            '&:hover': { borderColor: t.up, color: t.up },
                          }}
                        >
                          Show more
                        </Box>
                      </Box>
                    )}
                  </>
                )}

                {/* Empty state for sports/PM (only show after data loaded) */}
                {!isPlaceholderData && marketType === 'SPORTS' && sportsPools.length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography sx={{ color: t.text.dimmed, fontSize: '0.9rem' }}>
                      No sports matches available right now
                    </Typography>
                  </Box>
                )}
                {!isPlaceholderData && isPM && predictionPools.length === 0 && (
                  <Box sx={{ textAlign: 'center', py: 8 }}>
                    <Typography sx={{ color: t.text.dimmed, fontSize: '0.9rem' }}>
                      No predictions available in this category
                    </Typography>
                  </Box>
                )}

                {/* Prediction market cards */}
                {isPM && predictionPools.length > 0 && (
                  <>
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
                        gap: { xs: 1.5, md: 2 },
                        mb: 0,
                      }}
                    >
                      {predictionPools.slice(0, predVisible).map((pool) => (
                        <MatchCard key={pool.id} pool={pool} isPopular={popularPoolIds.has(pool.id)} liveScore={getPoolLiveScore(pool)} category={pool.league ? categoryMap.get(pool.league) : undefined} userBet={userBetByPoolId.get(pool.id)} onClaim={(poolId, betId) => claim(poolId, betId)} onClick={() => setSelectedSportsPool(pool)} />
                      ))}
                    </Box>
                    {predVisible < predictionPools.length && (
                      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, mb: 6 }}>
                        <Box
                          onClick={() => setPredVisible(v => v + CARDS_PER_PAGE)}
                          sx={{
                            display: 'inline-flex', alignItems: 'center', gap: 1,
                            px: 3, py: 1, cursor: 'pointer',
                            border: `1px solid ${t.border.medium}`,
                            borderRadius: 1,
                            color: t.text.secondary,
                            fontSize: '0.8rem', fontWeight: 600,
                            transition: 'all 0.15s ease',
                            '&:hover': { borderColor: t.up, color: t.up },
                          }}
                        >
                          Show more
                        </Box>
                      </Box>
                    )}
                  </>
                )}

                {/* Crypto pool table */}
                {marketType === 'CRYPTO' && (
                  <PoolTable
                    pools={cryptoPools}
                    userBetByPoolId={userBetByPoolId}
                    getPrice={getPrice}
                    isPlaceholderData={isPlaceholderData}
                    popularPoolIds={popularPoolIds}
                    onPoolClick={(pool) => setSelectedCryptoPool(pool)}
                  />
                )}

                {/* Sentinel for infinite scroll */}
                <Box ref={sentinelRef} />

                {/* Loading next page */}
                {isFetchingNextPage && (
                  <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, pb: 4 }}>
                    <CircularProgress size={32} sx={{ color: t.up }} />
                  </Box>
                )}

                {/* End of results */}
                {!hasNextPage && marketType === 'CRYPTO' && cryptoPools.length > 0 && (
                  <Box sx={{ textAlign: 'center', mt: 4, pb: 4 }}>
                    <Typography
                      variant="body2"
                      sx={{ color: 'text.secondary', fontWeight: 400 }}
                    >
                      Showing all {cryptoPools.length} pools
                    </Typography>
                  </Box>
                )}
              </>
            )}
      </Container>

      <MatchBetModal pool={selectedSportsPool} onClose={() => setSelectedSportsPool(null)} />
      <CryptoPoolModal pool={selectedCryptoPool} onClose={() => setSelectedCryptoPool(null)} />
    </AppShell>
  );
}
