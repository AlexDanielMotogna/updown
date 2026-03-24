'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress, Button, TextField } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import Link from 'next/link';
import { usePool } from '@/hooks/usePools';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { AppShell, TransactionModal } from '@/components';
import { ThreeWaySelector } from '@/components/sports/ThreeWaySelector';
import { UP_COLOR, GAIN_COLOR } from '@/lib/constants';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';

const PRESETS = [10, 50, 100, 500];

export default function MatchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: poolData, isLoading } = usePool(id);
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset: resetDeposit } = useDeposit();

  const [side, setSide] = useState<'UP' | 'DOWN' | 'DRAW' | null>(null);
  const [amount, setAmount] = useState('');
  const [showTxModal, setShowTxModal] = useState(false);

  const pool = poolData?.data;
  const amountNum = parseFloat(amount) || 0;
  const amountUsdc = Math.round(amountNum * USDC_DIVISOR);
  const balanceNum = balance ? balance.uiAmount : 0;

  const canSubmit = connected && side && amountNum > 0 && amountNum <= balanceNum && depositState.status === 'idle';

  const handleSubmit = async () => {
    if (!pool || !side) return;
    setShowTxModal(true);
    try { await deposit(pool.id, side as 'UP' | 'DOWN', amountUsdc); } catch {}
  };

  if (isLoading) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: UP_COLOR }} />
        </Box>
      </AppShell>
    );
  }

  if (!pool) {
    return (
      <AppShell>
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>Match not found</Typography>
          <Link href="/" style={{ textDecoration: 'none' }}>
            <Typography sx={{ color: UP_COLOR, mt: 1, '&:hover': { textDecoration: 'underline' } }}>Back to Markets</Typography>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const kickoff = new Date(pool.startTime).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // Payout calc
  const totalPool = Number(pool.totalUp) + Number(pool.totalDown) + Number(pool.totalDraw) + amountUsdc;
  const sideTotal = side ? (Number(side === 'UP' ? pool.totalUp : side === 'DOWN' ? pool.totalDown : pool.totalDraw) + amountUsdc) : 0;
  const estimatedPayout = sideTotal > 0 ? (amountUsdc / sideTotal) * totalPool / USDC_DIVISOR : 0;

  return (
    <AppShell>
      <Box sx={{ maxWidth: 600, mx: 'auto', px: { xs: 2, md: 3 }, py: { xs: 2, md: 4 } }}>
        {/* Back */}
        <Link href="/?type=SPORTS" style={{ textDecoration: 'none', color: 'inherit' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 3, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' } }}>
            <ArrowBack sx={{ fontSize: 16 }} />
            <Typography sx={{ fontSize: '0.8rem' }}>Back to Sports</Typography>
          </Box>
        </Link>

        {/* Match header */}
        <Box sx={{ textAlign: 'center', mb: 1 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {pool.league === 'CL' ? 'Champions League' : pool.league}
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', mt: 0.5 }}>
            {kickoff}
          </Typography>
        </Box>

        {/* Teams */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, py: 4 }}>
          <Box sx={{ textAlign: 'center' }}>
            {pool.homeTeamCrest && (
              <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 64, height: 64, objectFit: 'contain', mb: 1 }} />
            )}
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{pool.homeTeam}</Typography>
          </Box>
          <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>vs</Typography>
          <Box sx={{ textAlign: 'center' }}>
            {pool.awayTeamCrest && (
              <Box component="img" src={pool.awayTeamCrest} alt="" sx={{ width: 64, height: 64, objectFit: 'contain', mb: 1 }} />
            )}
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 700 }}>{pool.awayTeam}</Typography>
          </Box>
        </Box>

        {/* 3-way selector */}
        <ThreeWaySelector
          side={side}
          onSideChange={setSide}
          totalUp={Number(pool.totalUp)}
          totalDown={Number(pool.totalDown)}
          totalDraw={Number(pool.totalDraw)}
          homeTeam={pool.homeTeam || undefined}
          awayTeam={pool.awayTeam || undefined}
        />

        {/* Amount */}
        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
            {PRESETS.map(p => (
              <Button key={p} size="small" onClick={() => setAmount(String(p))}
                sx={{ flex: 1, minWidth: 0, py: 0.75, fontSize: '0.8rem', fontWeight: 600, bgcolor: amountNum === p ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', color: amountNum === p ? '#fff' : 'rgba(255,255,255,0.5)', textTransform: 'none', borderRadius: 0, '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
              >${p}</Button>
            ))}
          </Box>
          <TextField fullWidth size="small" placeholder="Amount (USDC)" type="number" value={amount} onChange={e => setAmount(e.target.value)}
            sx={{ '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.04)', borderRadius: 0 }, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' }, '& .MuiInputBase-input': { color: '#fff' } }}
          />
          <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', mt: 0.5 }}>
            Balance: ${balanceNum.toFixed(2)} USDC
          </Typography>
        </Box>

        {/* Payout */}
        {side && amountNum > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(255,255,255,0.03)' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>Estimated payout</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: GAIN_COLOR }}>${estimatedPayout.toFixed(2)}</Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>Multiplier</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>{(estimatedPayout / amountNum).toFixed(2)}x</Typography>
            </Box>
          </Box>
        )}

        {/* Submit */}
        <Button fullWidth variant="contained" disabled={!canSubmit} onClick={handleSubmit}
          sx={{ mt: 3, bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.9rem', py: 1.5, borderRadius: 0, textTransform: 'none', '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' }, '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' } }}
        >
          {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
        </Button>

        {/* Pool stats */}
        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 3, mt: 3, py: 2, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>Pool</Typography>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: GAIN_COLOR }}>{formatUSDC(pool.totalPool)}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>Players</Typography>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700 }}>{pool.betCount}</Typography>
          </Box>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>Status</Typography>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: pool.status === 'JOINING' ? UP_COLOR : 'rgba(255,255,255,0.5)' }}>{pool.status}</Typography>
          </Box>
        </Box>
      </Box>

      <TransactionModal
        open={showTxModal}
        status={depositState.status}
        title="Placing Prediction"
        txSignature={depositState.txSignature}
        error={depositState.error}
        onClose={() => { setShowTxModal(false); resetDeposit(); }}
        onRetry={() => resetDeposit()}
      />
    </AppShell>
  );
}
