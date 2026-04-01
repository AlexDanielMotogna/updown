'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Box, Typography, Alert, Chip } from '@mui/material';
import { Circle, ArrowBack } from '@mui/icons-material';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { usePool, useDeposit, usePriceStream, usePacificaPrices } from '@/hooks';
import {
  TransactionModal,
  AppShell,
  PoolDetailSkeleton,
  AiAnalyzerBot,
  AssetIcon,
} from '@/components';
import { statusStyles, USDC_DIVISOR } from '@/lib/format';
import { INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { PoolStatsStrip } from '@/components/pool/PoolStatsStrip';
import { PoolInfoCards } from '@/components/pool/PoolInfoCards';
import { ArenaSection } from '@/components/pool/ArenaSection';
import { InlineChart } from '@/components/pool/InlineChart';

export default function PoolDetailPage() {
  const t = useThemeTokens();
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

  // Activity log: fetch bets with polling every 5s
  const [bets, setBets] = useState<Array<{ wallet: string; side: string; amount: string; createdAt: string }>>([]);
  const knownBetsRef = useRef<Set<string>>(new Set());
  const [newBetKeys, setNewBetKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!poolId) { setBets([]); knownBetsRef.current.clear(); return; }
    let active = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const url = `${apiBase}/api/pools/${poolId}/bets`;
    const fetchBets = async () => {
      try {
        const r = await fetch(url);
        const d = await r.json();
        if (!active || !d.success) return;
        const freshKeys = new Set<string>();
        for (const b of d.data) {
          const key = `${b.wallet}-${b.createdAt}`;
          if (!knownBetsRef.current.has(key)) {
            freshKeys.add(key);
            knownBetsRef.current.add(key);
          }
        }
        setBets(d.data);
        if (freshKeys.size > 0 && freshKeys.size <= 5) {
          setNewBetKeys(freshKeys);
          setTimeout(() => setNewBetKeys(new Set()), 2000);
        }
      } catch { /* ignore */ }
    };
    fetchBets();
    const iv = setInterval(fetchBets, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [poolId]);

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
                display: 'inline-block',
                px: 4,
                py: 1,
                bgcolor: t.border.default,
                color: t.text.primary,
                fontWeight: 600,
                fontSize: '0.85rem',
                borderRadius: '2px',
                cursor: 'pointer',
                transition: 'background 0.15s',
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

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;

  return (
    <AppShell>
      {/* Back nav + Asset identity */}
      <Box sx={{ bgcolor: t.bg.app, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
              <ArrowBack sx={{ fontSize: 18, color: t.text.tertiary, '&:hover': { color: t.text.primary }, cursor: 'pointer' }} />
            </Link>
            <Circle sx={{ fontSize: 8, color: isConnected ? t.gain : t.down, animation: isConnected ? 'pulse 2s infinite' : 'none', '@keyframes pulse': { '0%': { opacity: 1 }, '50%': { opacity: 0.4 }, '100%': { opacity: 1 } } }} />
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

      {/* Activity log */}
      {bets.length > 0 && (
        <Box sx={{
          px: { xs: 2, md: 3 },
          py: 1.5,
          maxHeight: 300,
          overflowY: 'auto',
          '&::-webkit-scrollbar': { display: 'none' },
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
        }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            Activity
          </Typography>
          <AnimatePresence>
            {bets.map((b) => {
              const key = `${b.wallet}-${b.createdAt}`;
              const isNew = newBetKeys.has(key);
              const sideColor = b.side === 'UP' ? t.up : t.down;
              const sideLabel = b.side === 'UP' ? 'UP' : 'DOWN';
              const amt = (Number(b.amount) / USDC_DIVISOR).toFixed(2);
              const ago = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000);
              const timeStr = ago < 1 ? 'now' : ago < 60 ? `${ago}m` : `${Math.floor(ago / 60)}h`;
              return (
                <motion.div
                  key={key}
                  initial={isNew ? { opacity: 0, scale: 0.96, y: -10 } : false}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                  layout
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, fontSize: '0.75rem', fontWeight: 600 }}>
                    <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.soft, width: 75, flexShrink: 0 }}>{b.wallet}</Typography>
                    <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: sideColor, width: 55, flexShrink: 0 }}>{sideLabel}</Typography>
                    <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.primary, flex: 1, textAlign: 'right' }}>${amt}</Typography>
                    <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.muted, width: 25, textAlign: 'right', flexShrink: 0 }}>{timeStr}</Typography>
                  </Box>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </Box>
      )}

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
