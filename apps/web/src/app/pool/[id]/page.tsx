'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Typography, Alert, Chip } from '@mui/material';
import { Circle, ArrowBack } from '@mui/icons-material';
import Link from 'next/link';
import { usePool, useDeposit, usePriceStream, usePacificaPrices } from '@/hooks';
import {
  TransactionModal,
  AppShell,
  PoolDetailSkeleton,
  AiAnalyzerBot,
  AssetIcon,
} from '@/components';
import { statusStyles } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { PoolStatsStrip } from '@/components/pool/PoolStatsStrip';
import { PoolInfoCards } from '@/components/pool/PoolInfoCards';
import { ArenaSection } from '@/components/pool/ArenaSection';
import { InlineChart } from '@/components/pool/InlineChart';

export default function PoolDetailPage() {
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

  const { getPrice, isConnected } = usePriceStream(
    pool?.asset ? [pool.asset] : [],
    { enabled: !!pool?.asset }
  );
  const livePrice = pool?.asset ? getPrice(pool.asset) : null;

  const prevPrice = useRef(livePrice);
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (livePrice && prevPrice.current && livePrice !== prevPrice.current) {
      setPriceFlash(Number(livePrice) > Number(prevPrice.current) ? 'up' : 'down');
      const t = setTimeout(() => setPriceFlash(null), 300);
      prevPrice.current = livePrice;
      return () => clearTimeout(t);
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

  const handleBet = async (side: 'UP' | 'DOWN', amount: number) => {
    setShowModal(true);
    try {
      await deposit(poolId, side, amount);
    } catch {
      // Error handled in state
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    resetTx();
  };

  if (isLoading) {
    return (
      <AppShell>
        <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 6 } }}>
          <PoolDetailSkeleton />
        </Box>
      </AppShell>
    );
  }

  if (error || !pool) {
    return (
      <AppShell>
        <Box sx={{ textAlign: 'center', py: { xs: 8, md: 12 }, px: 3 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', mb: 1 }}>
            This pool has ended
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', mb: 3 }}>
            The pool was resolved and is no longer available. Check out the active markets.
          </Typography>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                px: 4,
                py: 1,
                bgcolor: 'rgba(255,255,255,0.06)',
                color: '#fff',
                fontWeight: 600,
                fontSize: '0.85rem',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
              }}
            >
              Back to Markets
            </Box>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;

  return (
    <AppShell>
      {/* Back nav + Asset identity */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
              <ArrowBack sx={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' }, cursor: 'pointer' }} />
            </Link>
            <Circle sx={{ fontSize: 8, color: isConnected ? GAIN_COLOR : DOWN_COLOR, animation: isConnected ? 'pulse 2s infinite' : 'none', '@keyframes pulse': { '0%': { opacity: 1 }, '50%': { opacity: 0.4 }, '100%': { opacity: 1 } } }} />
            <AssetIcon asset={pool.asset} size={22} />
            <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.9rem', md: '1rem' } }}>{pool.asset}/USD</Typography>
            {pool.interval && <Box component="img" src={INTERVAL_TAG_IMAGES[pool.interval] || '/assets/hourly-tag.png'} alt={INTERVAL_LABELS[pool.interval] || pool.interval} sx={{ height: { xs: 36, md: 42 }, imageRendering: '-webkit-optimize-contrast' }} />}
          </Box>
          <Chip label={pool.status === 'JOINING' ? 'LIVE' : pool.status} size="small" sx={{ ...statusStyle, fontWeight: 700, fontSize: { xs: '0.6rem', md: '0.7rem' }, letterSpacing: '0.08em', px: 1, borderRadius: '2px', height: { xs: 22, md: 24 } }} />
        </Box>
      </Box>

      <PoolStatsStrip betCount={pool.betCount} totalPool={pool.totalPool} upOdds={pool.odds.up} downOdds={pool.odds.down} />

      <PoolInfoCards
        livePrice={livePrice}
        priceFlash={priceFlash}
        strikePrice={pool.strikePrice}
        finalPrice={pool.finalPrice}
        status={pool.status}
        totalUp={pool.totalUp}
        totalDown={pool.totalDown}
        endTime={pool.endTime}
      />

      <Box sx={{
        display: { xs: 'block', md: 'grid' },
        gridTemplateColumns: { md: '1fr 340px' },
        gap: { md: 1.5 },
        px: { md: 2 },
        py: { md: 1.5 },
        alignItems: 'start',
      }}>
        <InlineChart asset={pool.asset} livePrice={livePrice} strikePrice={pool.strikePrice} />
        <ArenaSection
          pool={pool}
          selectedSide={selectedSide}
          onSelectSide={setSelectedSide}
          onBet={handleBet}
          txState={txState}
          betFormRef={betFormRef}
        />
      </Box>

      {pool && (
        <AiAnalyzerBot asset={pool.asset} poolStatus={pool.status} startTime={pool.startTime} endTime={pool.endTime} winner={pool.winner} priceData={priceData} />
      )}

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
