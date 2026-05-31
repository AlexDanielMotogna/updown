'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { GridView, Speed, Timer, AvTimer, Schedule } from '@mui/icons-material';
import Link from 'next/link';
import {
  usePool,
  useDeposit,
  usePriceStream,
  usePacificaPrices,
} from '@/hooks';
import {
  TransactionModal,
  AppShell,
  PoolDetailSkeleton,
  AiAnalyzerBot,
} from '@/components';
import { MarketFilter, type MarketType } from '@/components/sports/MarketFilter';
import { useThemeTokens } from '@/app/providers';
import { ArenaSection } from '@/components/pool/ArenaSection';
import { InlineChart } from '@/components/pool/InlineChart';
import { PoolPageHeader } from '@/components/pool/PoolPageHeader';
import { PriceTargetStrip } from '@/components/pool/PriceTargetStrip';
import { ActiveCryptoPoolsSidebar } from '@/components/pool/ActiveCryptoPoolsSidebar';
import { PoolActivityList } from '@/components/pool/PoolActivityList';

// Filter dropdown options — mirror the home page so MarketFilter renders
// with the same set of choices when a user wants to switch context from
// inside a pool view. Changes navigate back to the home grid.
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

export default function PoolDetailPage() {
  const t = useThemeTokens();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const searchParams = useSearchParams();
  const poolId = params.id as string;
  const initialSide = (searchParams.get('side')?.toUpperCase() as 'UP' | 'DOWN') || undefined;

  const { data, isLoading, error } = usePool(poolId);
  const { deposit, state: txState, reset: resetTx } = useDeposit();
  const [showModal, setShowModal] = useState(false);
  const [selectedSide, setSelectedSide] = useState<'UP' | 'DOWN'>(initialSide || 'UP');
  const betFormRef = useRef<HTMLDivElement>(null);

  const pool = data?.data;

  // Sports / PM pools live at /match — bounce there if someone deep-links to /pool.
  useEffect(() => {
    if (pool?.poolType === 'SPORTS') {
      router.replace(`/match/${pool.id}`);
    }
  }, [pool, router]);

  const { getPrice } = usePriceStream(
    pool?.asset ? [pool.asset] : [],
    { enabled: !!pool?.asset }
  );
  const livePrice = pool?.asset ? getPrice(pool.asset) : null;

  // Quick green/red flash on the price tile when the WS tick lands.
  const prevPrice = useRef(livePrice);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (livePrice && prevPrice.current && livePrice !== prevPrice.current) {
      setPriceFlash(Number(livePrice) > Number(prevPrice.current) ? 'up' : 'down');
      const id = setTimeout(() => setPriceFlash(null), 300);
      prevPrice.current = livePrice;
      return () => clearTimeout(id);
    }
    prevPrice.current = livePrice;
  }, [livePrice]);

  const { getPriceData } = usePacificaPrices(
    pool?.asset ? [pool.asset] : [],
    !!pool?.asset,
  );
  const priceData = pool?.asset ? getPriceData(pool.asset) : null;

  useEffect(() => {
    if (initialSide && betFormRef.current && pool?.status === 'JOINING') {
      setTimeout(() => {
        betFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  }, [initialSide, pool?.status]);

  // Category navbar — all changes navigate back to the markets grid. We're
  // inside a single pool so per-asset / per-interval filtering doesn't apply
  // here; the dropdowns just hand off to / with the right query string.
  const goToHome = useCallback((key: string, value: string) => {
    const params = new URLSearchParams();
    // Default home view is CRYPTO; only set 'type' when the user picks
    // something else, mirroring the home page's URL convention.
    if (key === 'type' && value !== 'CRYPTO') params.set('type', value);
    else if (key !== 'type' && value !== 'ALL') params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }, [router]);

  const filterBar = (
    <MarketFilter
      marketType="CRYPTO"
      onMarketTypeChange={(v: MarketType) => goToHome('type', v)}
      assetFilter="ALL"
      intervalFilter="ALL"
      onAssetChange={v => goToHome('asset', v)}
      onIntervalChange={v => goToHome('interval', v)}
      assetOptions={ASSET_FILTERS}
      intervalOptions={INTERVAL_FILTERS}
      sportFilter="ALL"
      onSportChange={v => goToHome('sport', v)}
      leagueFilter="ALL"
      onLeagueChange={v => goToHome('league', v)}
    />
  );

  const handleBet = async (side: 'UP' | 'DOWN', amount: number) => {
    setShowModal(true);
    try {
      await deposit(poolId, side, amount);
    } catch {
      // Surfaced through txState.error.
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetTx();
  };

  if (isLoading) {
    return (
      <AppShell topBar={filterBar}>
        <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 6 } }}>
          <PoolDetailSkeleton />
        </Box>
      </AppShell>
    );
  }

  if (error || !pool) {
    return (
      <AppShell topBar={filterBar}>
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 12 }, px: 3 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: t.text.primary, mb: 1 }}>
            This pool has ended
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: t.text.soft, mb: 3 }}>
            The pool was resolved and is no longer available. Check out the active markets.
          </Typography>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Box
              component="span"
              sx={{
                display: 'inline-block', px: 4, py: 1,
                bgcolor: t.border.default, color: t.text.primary,
                fontWeight: 600, fontSize: '0.85rem', borderRadius: '2px',
                cursor: 'pointer', transition: 'background 0.15s',
                '&:hover': { bgcolor: t.hover.emphasis },
              }}
            >
              Back to Markets
            </Box>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const isLive = pool.status === 'JOINING' || pool.status === 'ACTIVE';

  return (
    <AppShell topBar={filterBar}>
      {/* ── Two-column Polymarket-style layout ─────────────────────────────
          Left  → header, price strip, chart, AI analyzer
          Right → place bet card, recent activity, more crypto markets
         ─────────────────────────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' },
          gap: { xs: 0, md: 2 },
          alignItems: 'start',
          maxWidth: 1400,
          mx: 'auto',
          px: { xs: 0, md: 1 },
        }}
      >
        {/* ── Main column ── */}
        <Box sx={{ minWidth: 0 }}>
          <PoolPageHeader
            asset={pool.asset}
            interval={pool.interval}
            startTime={pool.startTime}
            endTime={pool.endTime}
          />
          <PriceTargetStrip
            strikePrice={pool.strikePrice}
            livePrice={livePrice}
            priceFlash={priceFlash}
            endTime={pool.endTime}
            status={pool.status}
            finalPrice={pool.finalPrice}
            isLive={isLive}
          />
          <Box sx={{ px: { xs: 0, md: 1 } }}>
            <InlineChart
              asset={pool.asset}
              livePrice={livePrice}
              strikePrice={pool.strikePrice}
            />
          </Box>
        </Box>

        {/* ── Right sidebar ── */}
        <Box sx={{ minWidth: 0, px: { xs: 1.5, md: 0 }, pb: { xs: 3, md: 4 } }}>
          <ArenaSection
            pool={pool}
            selectedSide={selectedSide}
            onSelectSide={setSelectedSide}
            onBet={handleBet}
            txState={txState}
            betFormRef={betFormRef}
          />
          <PoolActivityList poolId={poolId} />
          <ActiveCryptoPoolsSidebar currentPoolId={poolId} />
        </Box>
      </Box>

      <AiAnalyzerBot
        asset={pool.asset}
        poolStatus={pool.status}
        startTime={pool.startTime}
        endTime={pool.endTime}
        winner={pool.winner}
        priceData={priceData}
      />

      <TransactionModal
        open={showModal}
        status={txState.status}
        title="Placing Prediction"
        txSignature={txState.txSignature}
        error={txState.error}
        onClose={handleCloseModal}
        onRetry={() => { resetTx(); setShowModal(false); }}
      />
    </AppShell>
  );
}
