'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  Alert,
  Chip,
  Button,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  LinearProgress,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Circle,
  ExpandMore,
  ShowChart,
  ArrowBack,
  Person,
} from '@mui/icons-material';
import Link from 'next/link';
import { usePool, useDeposit, usePriceStream, usePacificaPrices } from '@/hooks';
import {
  Countdown,
  BetForm,
  TransactionModal,
  Header,
  PoolDetailSkeleton,
  BetFormSkeleton,
  PriceChartDialog,
  AiAnalyzerBot,
  AssetIcon,
} from '@/components';
import { formatUSDC, formatPrice, statusStyles, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR } from '@/lib/constants';

const INTERVAL_BADGE_COLORS: Record<string, { bg: string; color: string }> = {
  '1m': { bg: 'rgba(255, 152, 0, 0.15)', color: '#FFB74D' },
  '5m': { bg: 'rgba(33, 150, 243, 0.15)', color: '#64B5F6' },
  '15m': { bg: 'rgba(76, 175, 80, 0.15)', color: '#81C784' },
  '1h': { bg: 'rgba(255, 255, 255, 0.06)', color: 'rgba(255, 255, 255, 0.5)' },
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
  const betFormRef = useRef<HTMLDivElement>(null);

  const pool = data?.data;

  // Subscribe to live price stream
  const { getPrice, isConnected } = usePriceStream(
    pool?.asset ? [pool.asset] : [],
    { enabled: !!pool?.asset }
  );
  const livePrice = pool?.asset ? getPrice(pool.asset) : null;

  // Price flash
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

  // Subscribe to Pacifica market intelligence
  const { getPriceData } = usePacificaPrices(
    pool?.asset ? [pool.asset] : [],
    !!pool?.asset,
  );
  const priceData = pool?.asset ? getPriceData(pool.asset) : null;

  // Auto-scroll to bet form when side param present
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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', md: 0 } }}>
        <Header />
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
          <Grid container spacing={{ xs: 3, md: 5 }}>
            <Grid item xs={12} lg={7}>
              <PoolDetailSkeleton />
            </Grid>
            <Grid item xs={12} lg={5}>
              <BetFormSkeleton />
            </Grid>
          </Grid>
        </Container>
      </Box>
    );
  }

  if (error || !pool) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', md: 0 } }}>
        <Header />
        <Container maxWidth="lg" sx={{ py: { xs: 3, md: 6 } }}>
          <Alert
            severity="error"
            sx={{
              backgroundColor: 'rgba(248, 113, 113, 0.1)',
              border: '1px solid rgba(248, 113, 113, 0.3)',
              borderRadius: 1,
            }}
          >
            Failed to load pool details
          </Alert>
        </Container>
      </Box>
    );
  }

  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const isResolved = pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', md: 0 } }}>
      <Header />

      <Container maxWidth="lg" sx={{ py: { xs: 2, md: 4 } }}>
        {/* Top bar: Back + Asset + Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Link href="/" style={{ textDecoration: 'none', color: 'inherit' }}>
              <Button
                startIcon={<ArrowBack sx={{ fontSize: 18 }} />}
                sx={{ color: 'text.secondary', fontSize: '0.85rem', textTransform: 'none', '&:hover': { color: 'text.primary' } }}
              >
                Markets
              </Button>
            </Link>
            <AssetIcon asset={pool.asset} size={28} />
            <Typography variant="h5" sx={{ fontWeight: 500 }}>
              {pool.asset}/USD
            </Typography>
            {pool.interval && (
              <Chip
                label={INTERVAL_LABELS[pool.interval] || pool.interval}
                size="small"
                sx={{
                  fontSize: '0.7rem',
                  fontWeight: 500,
                  backgroundColor: (INTERVAL_BADGE_COLORS[pool.interval] || INTERVAL_BADGE_COLORS['1h']).bg,
                  color: (INTERVAL_BADGE_COLORS[pool.interval] || INTERVAL_BADGE_COLORS['1h']).color,
                  border: 'none',
                }}
              />
            )}
          </Box>
          <Chip
            label={pool.status}
            sx={{ ...statusStyle, fontWeight: 600, fontSize: '0.75rem', letterSpacing: '0.05em', px: 1 }}
          />
        </Box>

        {/* Live Price */}
        <Box
          sx={{
            mb: 3,
            px: 3,
            py: 2,
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Circle
                sx={{
                  fontSize: 8,
                  color: isConnected ? GAIN_COLOR : DOWN_COLOR,
                  animation: isConnected ? 'pulse 2s infinite' : 'none',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.4 },
                    '100%': { opacity: 1 },
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {isConnected ? 'LIVE' : 'CONNECTING'}
              </Typography>
            </Box>
            <Typography
              variant="h3"
              sx={{
                fontWeight: 300,
                fontVariantNumeric: 'tabular-nums',
                fontSize: { xs: '1.75rem', md: '2.5rem' },
                color: priceFlash === 'up' ? UP_COLOR : priceFlash === 'down' ? DOWN_COLOR : livePrice ? 'text.primary' : 'text.secondary',
                transition: 'color 0.15s ease',
              }}
            >
              {livePrice ? `$${Number(livePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
            </Typography>
          </Box>
          <Button
            size="small"
            variant="outlined"
            startIcon={<ShowChart sx={{ fontSize: 16 }} />}
            onClick={() => setChartOpen(true)}
            sx={{
              color: 'text.secondary',
              borderColor: 'rgba(255, 255, 255, 0.12)',
              textTransform: 'none',
              fontSize: '0.75rem',
              '&:hover': { borderColor: 'rgba(255, 255, 255, 0.3)', bgcolor: 'rgba(255, 255, 255, 0.04)' },
            }}
          >
            Chart
          </Button>
        </Box>

        <Grid container spacing={{ xs: 3, md: 4 }}>
          {/* Left column: Condensed pool info */}
          <Grid item xs={12} lg={6}>
            <Card sx={{ background: '#111820', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                {/* Countdown */}
                {(pool.status === 'JOINING' || pool.status === 'ACTIVE') && (
                  <Box sx={{ mb: 3, textAlign: 'center' }}>
                    <Countdown
                      targetDate={pool.status === 'JOINING' ? pool.lockTime : pool.endTime}
                      label={pool.status === 'JOINING' ? 'PREDICTIONS CLOSE IN' : 'RESULT IN'}
                    />
                  </Box>
                )}

                {/* Strike Price */}
                {pool.strikePrice && (pool.status === 'ACTIVE' || isResolved) && (
                  <Box
                    sx={{
                      mb: 3,
                      p: 2,
                      borderRadius: 1,
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      textAlign: 'center',
                    }}
                  >
                    <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mb: 0.5 }}>
                      STRIKE PRICE
                    </Typography>
                    <Typography variant="h4" sx={{ fontWeight: 300, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                      {formatPrice(pool.strikePrice)}
                    </Typography>
                  </Box>
                )}

                {/* Distribution bar */}
                <Box sx={{ mb: 3 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <TrendingUp sx={{ color: UP_COLOR, fontSize: 18 }} />
                      <Typography sx={{ color: UP_COLOR, fontWeight: 500, fontSize: '0.85rem' }}>
                        UP {formatUSDC(pool.totalUp)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Typography sx={{ color: DOWN_COLOR, fontWeight: 500, fontSize: '0.85rem' }}>
                        DOWN {formatUSDC(pool.totalDown)}
                      </Typography>
                      <TrendingDown sx={{ color: DOWN_COLOR, fontSize: 18 }} />
                    </Box>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={upPct}
                    sx={{
                      height: 8,
                      borderRadius: 1,
                      bgcolor: `${DOWN_COLOR}40`,
                      '& .MuiLinearProgress-bar': { bgcolor: UP_COLOR, borderRadius: 1 },
                    }}
                  />
                  <Typography sx={{ textAlign: 'center', mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                    {upPct}% / {100 - upPct}%
                  </Typography>
                </Box>

                {/* Stats grid */}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mb: 2 }}>
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>POOL SIZE</Typography>
                    <Typography sx={{ fontWeight: 600, color: GAIN_COLOR, fontSize: '1.1rem' }}>
                      {formatUSDC(pool.totalPool)}
                    </Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>PLAYERS</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
                      <Person sx={{ fontSize: 18, color: 'text.secondary' }} />
                      <Typography sx={{ fontWeight: 500, fontSize: '1.1rem' }}>{pool.betCount}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>UP ODDS</Typography>
                    <Typography sx={{ fontWeight: 500, color: UP_COLOR, fontSize: '1.1rem' }}>{pool.odds.up}x</Typography>
                  </Box>
                  <Box sx={{ p: 2, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.6rem' }}>DOWN ODDS</Typography>
                    <Typography sx={{ fontWeight: 500, color: DOWN_COLOR, fontSize: '1.1rem' }}>{pool.odds.down}x</Typography>
                  </Box>
                </Box>

                {/* Winner (if resolved) */}
                {pool.winner && (
                  <Box
                    sx={{
                      p: 3,
                      borderRadius: 1,
                      background: pool.winner === 'UP' ? `${UP_COLOR}12` : `${DOWN_COLOR}12`,
                      border: `1px solid ${pool.winner === 'UP' ? `${UP_COLOR}30` : `${DOWN_COLOR}30`}`,
                      textAlign: 'center',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                      {pool.winner === 'UP' ? (
                        <TrendingUp sx={{ color: UP_COLOR, fontSize: 28 }} />
                      ) : (
                        <TrendingDown sx={{ color: DOWN_COLOR, fontSize: 28 }} />
                      )}
                      <Typography variant="h4" sx={{ fontWeight: 700, color: pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR }}>
                        {pool.winner} WINS
                      </Typography>
                    </Box>
                    {pool.strikePrice && pool.finalPrice && (
                      <Typography variant="body1" sx={{ color: 'text.secondary' }}>
                        ${(Number(pool.strikePrice) / USDC_DIVISOR).toFixed(2)} → ${(Number(pool.finalPrice) / USDC_DIVISOR).toFixed(2)}
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Right column: Bet Form */}
          <Grid item xs={12} lg={6}>
            <Box ref={betFormRef} sx={{ position: { xs: 'static', lg: 'sticky' }, top: { lg: 80 } }}>
              <Card sx={{ background: '#111820', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                    Make Your Prediction
                  </Typography>
                  <BetForm
                    pool={pool}
                    onSubmit={handleBet}
                    isSubmitting={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
                    error={txState.error}
                    initialSide={initialSide}
                  />
                </CardContent>
              </Card>

              {/* How It Works */}
              <Accordion
                disableGutters
                sx={{
                  mt: 2,
                  background: '#111820',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  '&:before': { display: 'none' },
                  '&.Mui-expanded': { margin: 0, mt: 2 },
                }}
              >
                <AccordionSummary expandIcon={<ExpandMore sx={{ color: 'text.secondary' }} />}>
                  <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500 }}>
                    How parimutuel pools work
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>1. Choose a side</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Predict whether the price will be higher (UP) or lower (DOWN) than the strike price when the pool ends.
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>2. Deposit USDC</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        All deposits go into a shared pool. Your share of the winning side determines your payout.
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>3. Wait for the result</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        When the pool ends, the final price is compared to the strike price to determine the winning side.
                      </Typography>
                    </Box>
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, mb: 0.5 }}>4. Claim your winnings</Typography>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        Winners split the entire pool proportionally. A 5% platform fee is applied to payouts.
                      </Typography>
                    </Box>
                  </Box>
                </AccordionDetails>
              </Accordion>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Price Chart Dialog */}
      {pool?.asset && (
        <PriceChartDialog
          open={chartOpen}
          onClose={() => setChartOpen(false)}
          asset={pool.asset}
        />
      )}

      {/* AI Analyzer Bot */}
      {pool && (
        <AiAnalyzerBot
          asset={pool.asset}
          poolStatus={pool.status}
          startTime={pool.startTime}
          endTime={pool.endTime}
          winner={pool.winner}
          priceData={priceData}
        />
      )}

      {/* Transaction Modal */}
      <TransactionModal
        open={showModal}
        status={txState.status}
        title="Placing Prediction"
        txSignature={txState.txSignature}
        error={txState.error}
        onClose={handleCloseModal}
        onRetry={() => {
          resetTx();
        }}
      />
    </Box>
  );
}
