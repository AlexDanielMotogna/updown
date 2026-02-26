'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
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
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  Circle,
  ExpandMore,
  ShowChart,
} from '@mui/icons-material';
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
  MarketIntelligence,
  PoolTimeline,
  PoolDistribution,
  OddsDisplay,
  OrderbookDepth,
} from '@/components';
import { formatUSDC, formatPrice, formatDateTime, statusStyles, USDC_DIVISOR } from '@/lib/format';

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = params.id as string;

  const { data, isLoading, error } = usePool(poolId);
  const { deposit, state: txState, reset: resetTx } = useDeposit();
  const [showModal, setShowModal] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);

  const pool = data?.data;

  // Subscribe to live price stream
  const { getPrice, isConnected } = usePriceStream(
    pool?.asset ? [pool.asset] : [],
    { enabled: !!pool?.asset }
  );
  const livePrice = pool?.asset ? getPrice(pool.asset) : null;

  // Subscribe to Pacifica market intelligence
  const { getPriceData } = usePacificaPrices(
    pool?.asset ? [pool.asset] : [],
    !!pool?.asset,
  );
  const priceData = pool?.asset ? getPriceData(pool.asset) : null;

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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Header showBackButton />
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Grid container spacing={5}>
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
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <Header showBackButton />
        <Container maxWidth="lg" sx={{ py: 6 }}>
          <Alert
            severity="error"
            sx={{
              backgroundColor: 'rgba(255, 82, 82, 0.1)',
              border: '1px solid rgba(255, 82, 82, 0.3)',
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

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <Header showBackButton />

      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Grid container spacing={5}>
          {/* Pool Info */}
          <Grid item xs={12} lg={7}>
            <Card
              sx={{
                background: '#141414',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <CardContent sx={{ p: 4 }}>
                {/* Title & Status */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
                  <Typography variant="h3" sx={{ fontWeight: 400 }}>
                    {pool.asset}/USD
                  </Typography>
                  <Chip
                    label={pool.status}
                    sx={{
                      ...statusStyle,
                      fontWeight: 500,
                      fontSize: '0.75rem',
                      letterSpacing: '0.05em',
                      px: 1,
                    }}
                  />
                </Box>

                {/* Live Price */}
                <Box
                  sx={{
                    mb: 4,
                    p: 3,
                    borderRadius: 1,
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Circle
                        sx={{
                          fontSize: 8,
                          color: isConnected ? '#00E5FF' : '#FF5252',
                          animation: isConnected ? 'pulse 2s infinite' : 'none',
                          '@keyframes pulse': {
                            '0%': { opacity: 1 },
                            '50%': { opacity: 0.4 },
                            '100%': { opacity: 1 },
                          },
                        }}
                      />
                      <Typography
                        variant="caption"
                        sx={{ color: 'text.secondary' }}
                      >
                        {isConnected ? 'LIVE PRICE' : 'CONNECTING...'}
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
                        fontSize: '0.7rem',
                        py: 0.25,
                        px: 1,
                        minWidth: 0,
                        '&:hover': {
                          borderColor: 'rgba(255, 255, 255, 0.3)',
                          bgcolor: 'rgba(255, 255, 255, 0.04)',
                        },
                      }}
                    >
                      View Chart
                    </Button>
                  </Box>
                  <Typography
                    variant="h2"
                    sx={{
                      fontWeight: 300,
                      fontVariantNumeric: 'tabular-nums',
                      color: livePrice ? 'text.primary' : 'text.secondary',
                    }}
                  >
                    {livePrice ? `$${livePrice}` : '---'}
                  </Typography>
                </Box>

                {/* Market Intelligence */}
                <MarketIntelligence asset={pool.asset} priceData={priceData} />

                {/* Strike Price (when ACTIVE or RESOLVED) */}
                {pool.strikePrice && (pool.status === 'ACTIVE' || pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && (
                  <Box
                    sx={{
                      mb: 4,
                      p: 3,
                      borderRadius: 1,
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 1, display: 'block' }}
                    >
                      STRIKE PRICE (LOCKED)
                    </Typography>
                    <Typography variant="h3" sx={{ color: '#FFFFFF', fontWeight: 300 }}>
                      {formatPrice(pool.strikePrice)}
                    </Typography>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
                      {pool.status === 'ACTIVE'
                        ? 'Above = UP wins, Below = DOWN wins'
                        : pool.finalPrice
                          ? `Final: ${formatPrice(pool.finalPrice)}`
                          : ''
                      }
                    </Typography>
                  </Box>
                )}

                {/* Countdown */}
                {(pool.status === 'JOINING' || pool.status === 'ACTIVE') && (
                  <Box
                    sx={{
                      mb: 4,
                      p: 3,
                      borderRadius: 1,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    <Countdown
                      targetDate={pool.status === 'JOINING' ? pool.lockTime : pool.endTime}
                      label={pool.status === 'JOINING' ? 'PREDICTIONS CLOSE IN' : 'RESULT IN'}
                    />
                  </Box>
                )}

                {/* Pool Timeline */}
                <PoolTimeline
                  status={pool.status as 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE'}
                  createdAt={pool.createdAt}
                  lockTime={pool.lockTime}
                  startTime={pool.startTime}
                  endTime={pool.endTime}
                />

                {/* Pool Distribution */}
                <PoolDistribution
                  totalUp={pool.totalUp}
                  totalDown={pool.totalDown}
                  totalPool={pool.totalPool}
                  betCount={pool.betCount}
                />

                {/* Odds */}
                <OddsDisplay oddsUp={pool.odds.up} oddsDown={pool.odds.down} />

                {/* Orderbook Depth */}
                <OrderbookDepth asset={pool.asset} />

                {/* Winner (if resolved) */}
                {pool.winner && (
                  <Box
                    sx={{
                      p: 3,
                      borderRadius: 1,
                      background: pool.winner === 'UP'
                        ? 'rgba(0, 229, 255, 0.08)'
                        : 'rgba(255, 82, 82, 0.08)',
                      border: pool.winner === 'UP'
                        ? '1px solid rgba(0, 229, 255, 0.2)'
                        : '1px solid rgba(255, 82, 82, 0.2)',
                      textAlign: 'center',
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
                      {pool.winner === 'UP' ? (
                        <TrendingUp sx={{ color: '#00E5FF' }} />
                      ) : (
                        <TrendingDown sx={{ color: '#FF5252' }} />
                      )}
                      <Typography
                        variant="h5"
                        sx={{
                          fontWeight: 600,
                          color: pool.winner === 'UP' ? '#00E5FF' : '#FF5252',
                        }}
                      >
                        {pool.winner} WINS
                      </Typography>
                    </Box>
                    {pool.strikePrice && pool.finalPrice && (
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        ${(Number(pool.strikePrice) / USDC_DIVISOR).toFixed(2)} → $
                        {(Number(pool.finalPrice) / USDC_DIVISOR).toFixed(2)}
                      </Typography>
                    )}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Prediction Form */}
          <Grid item xs={12} lg={5}>
            <Box sx={{ position: 'sticky', top: 100 }}>
              <Card
                sx={{
                  background: '#141414',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <CardContent sx={{ p: 4 }}>
                  <Typography
                    variant="h5"
                    sx={{ fontWeight: 500, mb: 4 }}
                  >
                    Make Your Prediction
                  </Typography>
                  <BetForm
                    pool={pool}
                    onSubmit={handleBet}
                    isSubmitting={txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error'}
                    error={txState.error}
                  />
                </CardContent>
              </Card>

              {/* How It Works */}
              <Accordion
                disableGutters
                sx={{
                  mt: 2,
                  background: '#141414',
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
                        Winners split the entire pool proportionally. For example, if you predict $100 on UP and the UP side totals $400 out of a $1,000 pool, you'd win $250 (your $100/$400 share of the $1,000 pool).
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
