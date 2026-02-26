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
  AccessTime,
  Lock,
  Flag,
  Circle,
  Visibility,
  CheckCircle,
  ExpandMore,
  ShowChart,
} from '@mui/icons-material';
import { usePool, useDeposit, usePriceStream } from '@/hooks';
import { Countdown, BetForm, TransactionModal, Header, PoolDetailSkeleton, BetFormSkeleton, PriceChartDialog } from '@/components';
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

  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPercentage = total > 0 ? (totalUp / total) * 100 : 50;
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
                        ? 'Price must be above this at end time for UP to win'
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
                      label={pool.status === 'JOINING' ? 'BETTING CLOSES IN' : 'POOL ENDS IN'}
                    />
                  </Box>
                )}

                {/* Pool Timeline */}
                <Box sx={{ mb: 5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 2, display: 'block' }}
                  >
                    POOL TIMELINE
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1.5,
                      p: 2,
                      borderRadius: 1,
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                    }}
                  >
                    {/* Betting Open - when pool was created and betting started */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <AccessTime sx={{ fontSize: 18, color: pool.status === 'JOINING' ? '#FFFFFF' : 'text.secondary' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Bets Open
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDateTime(pool.createdAt)}
                      </Typography>
                      {pool.status === 'JOINING' && (
                        <Chip label="OPEN" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {(pool.status === 'ACTIVE' || pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && (
                        <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
                      )}
                    </Box>
                    {/* Betting Closes - lockTime */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Lock sx={{ fontSize: 18, color: pool.status === 'ACTIVE' ? '#FFFFFF' : 'text.secondary' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Bets Close
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDateTime(pool.lockTime)}
                      </Typography>
                      {pool.status === 'JOINING' && (
                        <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {pool.status === 'ACTIVE' && (
                        <Chip label="CLOSED" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.7)', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {(pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && (
                        <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
                      )}
                    </Box>
                    {/* Pool Monitoring - startTime */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Visibility sx={{ fontSize: 18, color: pool.status === 'ACTIVE' ? '#FFFFFF' : 'text.secondary' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Monitoring
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDateTime(pool.startTime)}
                      </Typography>
                      {pool.status === 'JOINING' && (
                        <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {pool.status === 'ACTIVE' && (
                        <Chip label="LIVE" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {(pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && (
                        <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
                      )}
                    </Box>
                    {/* Pool Resolution - endTime */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Flag sx={{ fontSize: 18, color: (pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') ? '#00E5FF' : 'text.secondary' }} />
                      <Box sx={{ flex: 1 }}>
                        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                          Result
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {formatDateTime(pool.endTime)}
                      </Typography>
                      {(pool.status === 'JOINING' || pool.status === 'ACTIVE') && (
                        <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
                      )}
                      {(pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE') && (
                        <Chip label="DONE" size="small" sx={{ bgcolor: 'rgba(0, 229, 255, 0.1)', color: '#00E5FF', height: 20, fontSize: '0.65rem' }} />
                      )}
                    </Box>
                  </Box>
                </Box>

                {/* Pool Distribution */}
                <Box sx={{ mb: 5 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 2, display: 'block' }}
                  >
                    POOL DISTRIBUTION
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUp sx={{ color: '#00E5FF', fontSize: 20 }} />
                      <Typography sx={{ color: '#00E5FF', fontWeight: 500 }}>
                        UP {formatUSDC(pool.totalUp)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ color: '#FF5252', fontWeight: 500 }}>
                        DOWN {formatUSDC(pool.totalDown)}
                      </Typography>
                      <TrendingDown sx={{ color: '#FF5252', fontSize: 20 }} />
                    </Box>
                  </Box>

                  {/* Progress bar */}
                  <Box
                    sx={{
                      position: 'relative',
                      height: 10,
                      borderRadius: 1,
                      overflow: 'hidden',
                      backgroundColor: 'rgba(255, 82, 82, 0.3)',
                      mb: 3,
                    }}
                  >
                    <Box
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        height: '100%',
                        width: `${upPercentage}%`,
                        background: '#00E5FF',
                        borderRadius: 1,
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                        Total Pool
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {formatUSDC(pool.totalPool)}
                      </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                        Participants
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        {pool.betCount}
                      </Typography>
                    </Box>
                  </Box>
                </Box>

                {/* Odds */}
                <Box sx={{ mb: 4 }}>
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', mb: 2, display: 'block' }}
                  >
                    CURRENT ODDS
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Box
                        sx={{
                          p: 3,
                          borderRadius: 1,
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.65rem' }}
                        >
                          UP MULTIPLIER
                        </Typography>
                        <Typography
                          variant="h3"
                          sx={{ color: '#00E5FF', fontWeight: 300, mt: 0.5 }}
                        >
                          {pool.odds.up}x
                        </Typography>
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Box
                        sx={{
                          p: 3,
                          borderRadius: 1,
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          textAlign: 'center',
                        }}
                      >
                        <Typography
                          variant="caption"
                          sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.65rem' }}
                        >
                          DOWN MULTIPLIER
                        </Typography>
                        <Typography
                          variant="h3"
                          sx={{ color: '#FF5252', fontWeight: 300, mt: 0.5 }}
                        >
                          {pool.odds.down}x
                        </Typography>
                      </Box>
                    </Grid>
                  </Grid>
                </Box>

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

          {/* Bet Form */}
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
                    Place Your Bet
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
                        Winners split the entire pool proportionally. For example, if you bet $100 on UP and the UP side totals $400 out of a $1,000 pool, you'd win $250 (your $100/$400 share of the $1,000 pool).
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

      {/* Transaction Modal */}
      <TransactionModal
        open={showModal}
        status={txState.status}
        title="Placing Bet"
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
