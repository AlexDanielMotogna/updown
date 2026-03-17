'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Box,
  Typography,
  Alert,
  Chip,
  Button,
} from '@mui/material';
import {
  Circle,
  ShowChart,
  ArrowBack,
  Whatshot,
} from '@mui/icons-material';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { usePool, useDeposit, usePriceStream, usePacificaPrices } from '@/hooks';
import {
  Countdown,
  BetForm,
  TransactionModal,
  AppShell,
  PoolDetailSkeleton,
  PriceChartDialog,
  AiAnalyzerBot,
  AssetIcon,
  AnimatedValue,
  SlotPrice,
} from '@/components';
import { formatUSDC, formatPrice, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';

const INTERVAL_TAG_IMAGES: Record<string, string> = {
  '1m': '/assets/turbo-tag.png',
  '5m': '/assets/rapid-tag.png',
  '15m': '/assets/short-tag.png',
  '1h': '/assets/hourly-tag.png',
};

const INTERVAL_LABELS: Record<string, string> = {
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

export default function PoolDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const poolId = params.id as string;
  const initialSide = (searchParams.get('side')?.toUpperCase() as 'UP' | 'DOWN') || undefined;

  const { data, isLoading, error } = usePool(poolId);
  const { deposit, state: txState, reset: resetTx } = useDeposit();
  const [showModal, setShowModal] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
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
        <Box sx={{ px: { xs: 2, md: 4 }, py: { xs: 3, md: 6 } }}>
          <Alert severity="error" sx={{ backgroundColor: 'rgba(248, 113, 113, 0.1)', border: 'none', borderRadius: 0 }}>
            Failed to load pool details
          </Alert>
        </Box>
      </AppShell>
    );
  }

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;
  const isResolved = pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE';
  const sideColor = selectedSide === 'UP' ? UP_COLOR : DOWN_COLOR;
  const assetKey = pool.asset.toLowerCase().replace(/[^a-z]/g, ''); // SOL -> sol, BTC -> btc, ETH -> eth
  const boxUp = `/boxes-pool/up-${assetKey}-green.png`;
  const boxDown = `/boxes-pool/down-${assetKey}-red.png`;

  return (
    <AppShell>
      {/* ═══ Back nav + Asset identity ═══ */}
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
          <Chip label={pool.status} size="small" sx={{ ...statusStyle, fontWeight: 700, fontSize: { xs: '0.6rem', md: '0.7rem' }, letterSpacing: '0.08em', px: 1, borderRadius: '2px', height: { xs: 22, md: 24 } }} />
        </Box>
      </Box>

      {/* ═══ Stats strip ═══ */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {[
            { icon: '/assets/players-icon-500.png', value: pool.betCount, label: 'PLAYERS', color: '#fff' },
            { icon: '/assets/pool-icon-500.png', value: formatUSDC(pool.totalPool), label: 'POOL', color: GAIN_COLOR },
            { icon: '/assets/up-icon-64x64.png', value: `${Number.isFinite(Number(pool.odds.up)) ? Number(pool.odds.up).toFixed(2) : pool.odds.up}x`, label: 'UP ODDS', color: UP_COLOR },
            { icon: '/assets/down-icon-64x64.png', value: `${Number.isFinite(Number(pool.odds.down)) ? Number(pool.odds.down).toFixed(2) : pool.odds.down}x`, label: 'DOWN ODDS', color: DOWN_COLOR },
          ].map((s, i) => (
            <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', pl: i > 0 ? { xs: 1.5, md: 2.5 } : 0 }}>
              <Box component="img" src={s.icon} alt="" sx={{ width: { xs: 14, md: 20 }, height: { xs: 14, md: 20 } }} />
              <Box>
                <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</Typography>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.6rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>{s.label}</Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ═══ Row 2: Cards strip (like profile cards) ═══ */}
      <Box sx={{ bgcolor: '#0D1219' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
              gap: 0.5,
            }}
          >
            {/* Live Price */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center', gridColumn: { xs: 'span 2', sm: 'span 1' } }}>
              <Box>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Live Price</Typography>
                <Typography
                  sx={{
                    fontSize: { xs: '1.1rem', md: '1.3rem' },
                    fontWeight: 700,
                    fontVariantNumeric: 'tabular-nums',
                    color: priceFlash === 'up' ? UP_COLOR : priceFlash === 'down' ? DOWN_COLOR : '#fff',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {livePrice
                    ? `$${Number(livePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : ''}
                </Typography>
              </Box>
            </Box>

            {/* Strike Price */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Strike Price</Typography>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                  {pool.strikePrice ? formatPrice(pool.strikePrice) : ''}
                </Typography>
              </Box>
            </Box>

            {/* UP Pool */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>UP Pool</Typography>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: UP_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  {formatUSDC(pool.totalUp)}
                </Typography>
              </Box>
            </Box>

            {/* DOWN Pool */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
              <Box>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>DOWN Pool</Typography>
                <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: DOWN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  {formatUSDC(pool.totalDown)}
                </Typography>
              </Box>
            </Box>

            {/* View Chart */}
            <Box
              onClick={() => setChartOpen(true)}
              sx={{
                bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5,
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.1)',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)' },
                transition: 'all 0.2s ease',
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <ShowChart sx={{ fontSize: 20, color: '#fff' }} />
                <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: '#fff' }}>View Chart</Typography>
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>

      {/* ═══ Arena Section ═══ */}
      <Box
        sx={{
          position: 'relative',
          overflow: 'hidden',
          background: 'transparent',
          pb: { xs: 4, md: 6 },
        }}
      >
        {/* ─── Row 2: MARKET BATTLE + Countdown (centered, own row) ─── */}
        <Box sx={{ textAlign: 'center', pt: { xs: 3, md: 4 }, pb: { xs: 2, md: 3 }, px: { xs: 1.5, md: 3 }, position: 'relative', zIndex: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 2, md: 3 }, mb: 1.5 }}>
            <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.85rem' }, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.3)' }}>
              MARKET
            </Typography>
            <Box component="img" src="/assets/market-battle-icon-500.png" alt="" sx={{ width: { xs: 20, md: 30 }, height: { xs: 20, md: 30 } }} />
            <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.85rem' }, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.3)' }}>
              BATTLE
            </Typography>
          </Box>
          {(pool.status === 'JOINING' || pool.status === 'ACTIVE') && (
            <Countdown
              targetDate={pool.status === 'JOINING' ? pool.lockTime : pool.endTime}
              label={pool.status === 'JOINING' ? 'PREDICTIONS CLOSE IN' : 'RESULT IN'}
            />
          )}
        </Box>

        {/* ─── Arena ─── */}
        <Box sx={{ px: { xs: 1.5, md: 3 }, position: 'relative', zIndex: 1 }}>

          {/* Mobile: UP and DOWN side by side */}
          <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mb: 2 }}>
            {/* UP compact */}
            <Box
              component={motion.div}
              {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
              onClick={() => setSelectedSide('UP')}
              sx={{
                flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                p: 1.5, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
                ...(selectedSide === 'UP'
                  ? { background: `${UP_COLOR}10`, boxShadow: `0 0 30px ${UP_COLOR}15` }
                  : { background: 'rgba(255,255,255,0.02)', opacity: 0.5 }),
                ...(pool.winner === 'UP' ? { boxShadow: `0 0 40px ${UP_COLOR}30` } : {}),
                ...(pool.winner === 'DOWN' ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
              }}
            >
              {pool.winner === 'UP' && <Chip label="WINNER" size="small" sx={{ bgcolor: `${UP_COLOR}30`, color: UP_COLOR, fontWeight: 700, fontSize: '0.6rem', height: 20 }} />}
              <Box component="img" src={boxUp} alt="UP" sx={{ width: 70, height: 70, objectFit: 'contain', filter: selectedSide === 'UP' ? `drop-shadow(0 0 15px ${UP_COLOR}50)` : 'brightness(0.7)' }} />
              <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '0.85rem' }}>UP Team</Typography>
              <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '1.2rem' }}>{upPct}%</Typography>
              <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: `${UP_COLOR}15` }}>
                <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '0.8rem' }}>
                  {Number.isFinite(Number(pool.odds.up)) ? <AnimatedValue value={Number(pool.odds.up)} suffix="x" decimals={2} /> : `${pool.odds.up}x`}
                </Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600 }}>{formatUSDC(pool.totalUp)}</Typography>
            </Box>
            {/* DOWN compact */}
            <Box
              component={motion.div}
              {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
              onClick={() => setSelectedSide('DOWN')}
              sx={{
                flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
                p: 1.5, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
                ...(selectedSide === 'DOWN'
                  ? { background: `${DOWN_COLOR}10`, boxShadow: `0 0 30px ${DOWN_COLOR}15` }
                  : { background: 'rgba(255,255,255,0.02)', opacity: 0.5 }),
                ...(pool.winner === 'DOWN' ? { boxShadow: `0 0 40px ${DOWN_COLOR}30` } : {}),
                ...(pool.winner === 'UP' ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
              }}
            >
              {pool.winner === 'DOWN' && <Chip label="WINNER" size="small" sx={{ bgcolor: `${DOWN_COLOR}30`, color: DOWN_COLOR, fontWeight: 700, fontSize: '0.6rem', height: 20 }} />}
              <Box component="img" src={boxDown} alt="DOWN" sx={{ width: 70, height: 70, objectFit: 'contain', filter: selectedSide === 'DOWN' ? `drop-shadow(0 0 15px ${DOWN_COLOR}50)` : 'brightness(0.7)' }} />
              <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '0.85rem' }}>DOWN Team</Typography>
              <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '1.2rem' }}>{downPct}%</Typography>
              <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: `${DOWN_COLOR}15` }}>
                <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '0.8rem' }}>
                  {Number.isFinite(Number(pool.odds.down)) ? <AnimatedValue value={Number(pool.odds.down)} suffix="x" decimals={2} /> : `${pool.odds.down}x`}
                </Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600 }}>{formatUSDC(pool.totalDown)}</Typography>
            </Box>
          </Box>

          {/* Desktop: 3-column layout */}
          <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center' }}>

            {/* UP Team (left) */}
            <Box
              component={motion.div}
              {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
              onClick={() => setSelectedSide('UP')}
              sx={{
                flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                p: 2, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
                ...(selectedSide === 'UP'
                  ? { background: `${UP_COLOR}10`, boxShadow: `0 0 60px ${UP_COLOR}15, inset 0 0 40px ${UP_COLOR}06` }
                  : { background: 'transparent', opacity: 0.5, '&:hover': { opacity: 0.75 } }),
                ...(pool.winner === 'UP' ? { boxShadow: `0 0 80px ${UP_COLOR}30` } : {}),
                ...(pool.winner === 'DOWN' ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
              }}
            >
              {pool.winner === 'UP' && <Chip label="WINNER" size="small" sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', bgcolor: `${UP_COLOR}30`, color: UP_COLOR, fontWeight: 700, fontSize: '0.65rem' }} />}
              <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '1.2rem', letterSpacing: '0.05em' }}>UP Team</Typography>
              <Box component="img" src={boxUp} alt="UP" sx={{ width: 200, height: 200, objectFit: 'contain', filter: selectedSide === 'UP' ? `drop-shadow(0 0 30px ${UP_COLOR}50)` : 'brightness(0.7)', transition: 'all 0.3s ease', transform: selectedSide === 'UP' ? 'scale(1.05)' : 'scale(0.9)' }} />
              {upPct > 65 && <Whatshot sx={{ fontSize: 18, color: '#FF6B35', animation: 'hotWobble 0.6s infinite', '@keyframes hotWobble': { '0%, 100%': { transform: 'rotate(-5deg)' }, '50%': { transform: 'rotate(5deg)' } } }} />}
              <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '2rem' }}>{upPct}%</Typography>
              <Box sx={{ px: 2, py: 0.5, borderRadius: 1, bgcolor: `${UP_COLOR}15`, display: 'inline-block', mb: 0.75 }}>
                <Typography sx={{ color: UP_COLOR, fontWeight: 700, fontSize: '1.1rem' }}>
                  {Number.isFinite(Number(pool.odds.up)) ? <AnimatedValue value={Number(pool.odds.up)} suffix="x" decimals={2} /> : `${pool.odds.up}x`}
                </Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(pool.totalUp)} pooled</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', mt: 0.75 }}>UP TEAM POWER</Typography>
            </Box>

            {/* Center: Bet Form */}
            <Box
              ref={betFormRef}
              sx={{
                flex: '0 0 420px',
                width: 420,
                px: 2,
                py: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                zIndex: 2,
              }}
            >
            {/* JOIN UP / JOIN DOWN buttons  top */}
            <Box sx={{ display: 'flex', gap: 0, width: '100%', mb: 2 }}>
              <Box
                component={motion.div}
                {...({ whileTap: { scale: 0.96 } } as Record<string, unknown>)}
                onClick={() => setSelectedSide('UP')}
                sx={{
                  flex: 1,
                  cursor: 'pointer',
                  py: { xs: 1.5, md: 2 },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  borderRadius: '12px 0 0 12px',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  ...(selectedSide === 'UP'
                    ? {
                        background: `linear-gradient(135deg, ${UP_COLOR}25, ${UP_COLOR}10)`,
                        boxShadow: `0 0 30px ${UP_COLOR}20, inset 0 1px 0 ${UP_COLOR}30`,
                      }
                    : {
                        background: 'rgba(255,255,255,0.03)',
                        '&:hover': { background: 'rgba(255,255,255,0.06)' },
                      }),
                }}
              >
                <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 22, height: 22, opacity: selectedSide === 'UP' ? 1 : 0.3 }} />
                <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.85rem', md: '0.95rem' }, color: selectedSide === 'UP' ? UP_COLOR : 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                  JOIN UP
                </Typography>
              </Box>
              <Box
                component={motion.div}
                {...({ whileTap: { scale: 0.96 } } as Record<string, unknown>)}
                onClick={() => setSelectedSide('DOWN')}
                sx={{
                  flex: 1,
                  cursor: 'pointer',
                  py: { xs: 1.5, md: 2 },
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 1,
                  borderRadius: '0 12px 12px 0',
                  transition: 'all 0.3s ease',
                  position: 'relative',
                  overflow: 'hidden',
                  ...(selectedSide === 'DOWN'
                    ? {
                        background: `linear-gradient(135deg, ${DOWN_COLOR}10, ${DOWN_COLOR}25)`,
                        boxShadow: `0 0 30px ${DOWN_COLOR}20, inset 0 1px 0 ${DOWN_COLOR}30`,
                      }
                    : {
                        background: 'rgba(255,255,255,0.03)',
                        '&:hover': { background: 'rgba(255,255,255,0.06)' },
                      }),
                }}
              >
                <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 22, height: 22, opacity: selectedSide === 'DOWN' ? 1 : 0.3 }} />
                <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.85rem', md: '0.95rem' }, color: selectedSide === 'DOWN' ? DOWN_COLOR : 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
                  JOIN DOWN
                </Typography>
              </Box>
            </Box>

            {/* Bet form card */}
            <Box
              sx={{
                width: '100%',
                background: 'rgba(255,255,255,0.02)',
                border: `1px solid ${sideColor}15`,
                borderRadius: 3,
                p: { xs: 2.5, md: 3 },
                position: 'relative',
                overflow: 'hidden',
                // Top glow line
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: 0,
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  background: `linear-gradient(90deg, transparent, ${sideColor}40, transparent)`,
                },
              }}
            >
              <BetForm
                pool={pool}
                onSubmit={handleBet}
                isSubmitting={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
                error={txState.error}
                controlledSide={selectedSide}
                hideToggle
              />
            </Box>
          </Box>

            {/* DOWN Team (right)  desktop only */}
            <Box
              component={motion.div}
              {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
              onClick={() => setSelectedSide('DOWN')}
              sx={{
                flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
                p: 2, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
                ...(selectedSide === 'DOWN'
                  ? { background: `${DOWN_COLOR}10`, boxShadow: `0 0 60px ${DOWN_COLOR}15, inset 0 0 40px ${DOWN_COLOR}06` }
                  : { background: 'transparent', opacity: 0.5, '&:hover': { opacity: 0.75 } }),
                ...(pool.winner === 'DOWN' ? { boxShadow: `0 0 80px ${DOWN_COLOR}30` } : {}),
                ...(pool.winner === 'UP' ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
              }}
            >
              {pool.winner === 'DOWN' && <Chip label="WINNER" size="small" sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', bgcolor: `${DOWN_COLOR}30`, color: DOWN_COLOR, fontWeight: 700, fontSize: '0.65rem' }} />}
              <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '1.2rem', letterSpacing: '0.05em' }}>DOWN Team</Typography>
              <Box component="img" src={boxDown} alt="DOWN" sx={{ width: 200, height: 200, objectFit: 'contain', filter: selectedSide === 'DOWN' ? `drop-shadow(0 0 30px ${DOWN_COLOR}50)` : 'brightness(0.7)', transition: 'all 0.3s ease', transform: selectedSide === 'DOWN' ? 'scale(1.05)' : 'scale(0.9)' }} />
              {downPct > 65 && <Whatshot sx={{ fontSize: 18, color: '#FF6B35', animation: 'hotWobble 0.6s infinite', '@keyframes hotWobble': { '0%, 100%': { transform: 'rotate(-5deg)' }, '50%': { transform: 'rotate(5deg)' } } }} />}
              <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '2rem' }}>{downPct}%</Typography>
              <Box sx={{ px: 2, py: 0.5, borderRadius: 1, bgcolor: `${DOWN_COLOR}15`, display: 'inline-block', mb: 0.75 }}>
                <Typography sx={{ color: DOWN_COLOR, fontWeight: 700, fontSize: '1.1rem' }}>
                  {Number.isFinite(Number(pool.odds.down)) ? <AnimatedValue value={Number(pool.odds.down)} suffix="x" decimals={2} /> : `${pool.odds.down}x`}
                </Typography>
              </Box>
              <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(pool.totalDown)} pooled</Typography>
              <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', mt: 0.75 }}>DOWN TEAM POWER</Typography>
            </Box>
          </Box>

          {/* Mobile: Bet Form (full width, below teams) */}
          <Box
            ref={betFormRef}
            sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', alignItems: 'center' }}
          >
            {/* JOIN UP / JOIN DOWN buttons */}
            <Box sx={{ display: 'flex', gap: 0, width: '100%', mb: 1.5 }}>
              <Box
                component={motion.div}
                {...({ whileTap: { scale: 0.96 } } as Record<string, unknown>)}
                onClick={() => setSelectedSide('UP')}
                sx={{
                  flex: 1, cursor: 'pointer', py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  borderRadius: '10px 0 0 10px', transition: 'all 0.3s ease',
                  ...(selectedSide === 'UP'
                    ? { background: `linear-gradient(135deg, ${UP_COLOR}25, ${UP_COLOR}10)`, boxShadow: `0 0 20px ${UP_COLOR}20` }
                    : { background: 'rgba(255,255,255,0.03)' }),
                }}
              >
                <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 18, height: 18, opacity: selectedSide === 'UP' ? 1 : 0.3 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: selectedSide === 'UP' ? UP_COLOR : 'rgba(255,255,255,0.4)' }}>JOIN UP</Typography>
              </Box>
              <Box
                component={motion.div}
                {...({ whileTap: { scale: 0.96 } } as Record<string, unknown>)}
                onClick={() => setSelectedSide('DOWN')}
                sx={{
                  flex: 1, cursor: 'pointer', py: 1.25, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  borderRadius: '0 10px 10px 0', transition: 'all 0.3s ease',
                  ...(selectedSide === 'DOWN'
                    ? { background: `linear-gradient(135deg, ${DOWN_COLOR}10, ${DOWN_COLOR}25)`, boxShadow: `0 0 20px ${DOWN_COLOR}20` }
                    : { background: 'rgba(255,255,255,0.03)' }),
                }}
              >
                <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 18, height: 18, opacity: selectedSide === 'DOWN' ? 1 : 0.3 }} />
                <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: selectedSide === 'DOWN' ? DOWN_COLOR : 'rgba(255,255,255,0.4)' }}>JOIN DOWN</Typography>
              </Box>
            </Box>
            <Box sx={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${sideColor}15`, borderRadius: 2, p: 2 }}>
              <BetForm pool={pool} onSubmit={handleBet} isSubmitting={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'} error={txState.error} controlledSide={selectedSide} hideToggle />
            </Box>
          </Box>
        </Box>

        {/* Energy Bar */}
        <Box sx={{ px: { xs: 1.5, md: 3 }, mt: { xs: 2, md: 3 } }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 16, height: 16 }} />
              <Typography sx={{ color: UP_COLOR, fontWeight: 600, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>UP {formatUSDC(pool.totalUp)}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(pool.totalPool)} total</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Typography sx={{ color: DOWN_COLOR, fontWeight: 600, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>DOWN {formatUSDC(pool.totalDown)}</Typography>
              <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 16, height: 16 }} />
            </Box>
          </Box>
          <Box sx={{ height: 10, borderRadius: 5, overflow: 'hidden', position: 'relative', background: `${DOWN_COLOR}30` }}>
            <Box
              sx={{
                position: 'absolute', top: 0, left: 0, height: '100%', width: `${upPct}%`, borderRadius: 5,
                background: `linear-gradient(90deg, ${UP_COLOR}80, ${UP_COLOR})`,
                transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: upPct > 50 ? `0 0 10px ${UP_COLOR}50, 0 0 20px ${UP_COLOR}20` : 'none',
                '&::after': {
                  content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                  backgroundSize: '200% 100%',
                  animation: 'energyFlow 2s infinite linear',
                  '@keyframes energyFlow': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
                },
              }}
            />
            {downPct > 50 && (
              <Box sx={{ position: 'absolute', top: 0, right: 0, height: '100%', width: '30%', background: `linear-gradient(270deg, ${DOWN_COLOR}40, transparent)`, animation: 'downGlow 2s infinite', '@keyframes downGlow': { '0%, 100%': { opacity: 0.5 }, '50%': { opacity: 1 } } }} />
            )}
          </Box>
        </Box>

        {/* Winner banner */}
        {pool.winner && (() => {
          const isRefund = pool.upCount === 0 || pool.downCount === 0;
          const winColor = pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR;
          return (
            <Box sx={{ mt: 3, mx: { xs: 1.5, md: 3 }, p: 3, borderRadius: 1, background: isRefund ? 'rgba(255,255,255,0.04)' : `${winColor}12`, textAlign: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                {pool.winner === 'UP'
                  ? <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 28, height: 28 }} />
                  : <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 28, height: 28 }} />}
                <Typography variant="h4" sx={{ fontWeight: 700, color: winColor }}>{pool.winner} WINS</Typography>
              </Box>
              {pool.strikePrice && pool.finalPrice && (
                <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                  ${(Number(pool.strikePrice) / USDC_DIVISOR).toFixed(2)} → ${(Number(pool.finalPrice) / USDC_DIVISOR).toFixed(2)}
                </Typography>
              )}
              {isRefund && (
                <Typography variant="body2" sx={{ mt: 1, color: ACCENT_COLOR, fontWeight: 600, fontSize: '0.8rem' }}>
                  No opponents  all bets refunded
                </Typography>
              )}
            </Box>
          );
        })()}
      </Box>

      {/* Price Chart Dialog */}
      {pool?.asset && (
        <PriceChartDialog open={chartOpen} onClose={() => setChartOpen(false)} asset={pool.asset} />
      )}

      {/* AI Analyzer Bot */}
      {pool && (
        <AiAnalyzerBot asset={pool.asset} poolStatus={pool.status} startTime={pool.startTime} endTime={pool.endTime} winner={pool.winner} priceData={priceData} />
      )}

      {/* Transaction Modal */}
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
