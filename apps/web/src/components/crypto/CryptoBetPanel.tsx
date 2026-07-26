'use client';

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Bolt } from '@mui/icons-material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePoolWeighting, projectWeightedPayout } from '@/hooks/usePoolWeighting';
import { useDeposit } from '@/hooks/useTransactions';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { USDC_DIVISOR } from '@/lib/format';
import { DEFAULT_FEE_PERCENT, FEE_BPS_DIVISOR } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import type { Pool } from '@/lib/api';

const PRESETS = [10, 25, 50, 100, 500];
const CYAN = '#5FD8EF';
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** The spacious bet panel from the mockup, wired to the real on-chain engine. */
export function CryptoBetPanel({ pool }: { pool: Pool }) {
  const t = useThemeTokens();
  const { connected, login } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: txState } = useDeposit();
  const [side, setSide] = useState<'UP' | 'DOWN'>('UP');
  const [amount, setAmount] = useState('50');
  const { data: weighting } = usePoolWeighting(pool.id, pool.status === 'JOINING');

  const strikeStr = fmtUsd(pool.strikePrice ? Number(pool.strikePrice) / USDC_DIVISOR : 0);

  // Parimutuel + time-weighted payout — same math as PlaceBetCard.
  const totalUp = Number(pool.totalUp) / USDC_DIVISOR;
  const totalDown = Number(pool.totalDown) / USDC_DIVISOR;
  const totalPool = totalUp + totalDown;
  const amountNum = parseFloat(amount) || 0;
  const newSideTotal = side === 'UP' ? totalUp + amountNum : totalDown + amountNum;
  const grossPayout = newSideTotal > 0 ? (amountNum / newSideTotal) * (totalPool + amountNum) : 0;
  const feePercent = userProfile ? userProfile.feeBps / FEE_BPS_DIVISOR : DEFAULT_FEE_PERCENT;
  const weighted = weighting && amountNum > 0
    ? projectWeightedPayout({ weighting, amount: BigInt(Math.round(amountNum * USDC_DIVISOR)), side, feePercent })
    : null;
  const payout = weighted ? weighted.payout : grossPayout * (1 - feePercent);
  const odds = weighted ? weighted.odds : (amountNum > 0 ? (grossPayout * (1 - feePercent)) / amountNum : 0);

  const isSubmitting = txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error';
  const canBet = connected && pool.status === 'JOINING' && amountNum > 0 && !isSubmitting;
  const bal = balance?.uiAmount ?? 0;

  const submit = () => {
    if (!connected) { login(); return; }
    if (canBet) deposit(pool.id, side, amountNum * USDC_DIVISOR).catch(() => { /* toast in hook */ });
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography sx={{ textAlign: 'center', fontWeight: 700, fontSize: '0.95rem', color: t.text.primary }}>
        How will {pool.asset} price close in 5 minutes?
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        {(['UP', 'DOWN'] as const).map((s) => {
          const active = side === s;
          const up = s === 'UP';
          const col = up ? t.up : t.down;
          return (
            <Box key={s} onClick={() => setSide(s)} sx={{ cursor: 'pointer', borderRadius: 1, p: 1.25, textAlign: 'center', border: `1.5px solid ${active ? col : t.border.subtle}`, bgcolor: active ? `${col}14` : t.bg.surface, transition: 'all 0.15s' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                <Box component="img" src={up ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt={s} sx={{ width: 24, height: 24 }} />
                <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: col }}>{s}</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.72rem', color: t.text.secondary, mt: 0.25 }}>{up ? 'Higher' : 'Lower'} than {strikeStr}</Typography>
            </Box>
          );
        })}
      </Box>

      {/* Time-weight: earlier bets carry more weight, so a bigger share of the pool. */}
      {weighting && pool.status === 'JOINING' && (() => {
        const pct = Math.max(0, Math.min(100, Math.round(weighting.currentMultiplier * 100)));
        return (
          <Box sx={{ p: 1, borderRadius: 1, bgcolor: t.bg.surface }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.6 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Bolt sx={{ fontSize: 15, color: CYAN }} />
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: t.text.primary }}>Early bird bonus</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: CYAN, fontVariantNumeric: 'tabular-nums' }}>{pct}%</Typography>
            </Box>
            <Box sx={{ height: 5, borderRadius: 3, bgcolor: t.hover.medium, overflow: 'hidden' }}>
              <Box sx={{ height: '100%', width: `${pct}%`, bgcolor: CYAN, transition: 'width 0.5s ease' }} />
            </Box>
            <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary, mt: 0.5, lineHeight: 1.4 }}>
              Predict earlier in the round to earn a bigger share of the pool. This drops as the round runs.
            </Typography>
          </Box>
        );
      })()}

      <Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
          <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary }}>Amount (USDC)</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: CYAN }}>Balance: {fmtUsd(bal)}</Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 1 }}>
          {PRESETS.map((p) => (
            <Box key={p} onClick={() => setAmount(String(p))} sx={{ py: 0.85, textAlign: 'center', borderRadius: 1, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 700, border: `1px solid ${amount === String(p) ? CYAN : t.border.subtle}`, color: amount === String(p) ? CYAN : t.text.primary, bgcolor: t.bg.surface }}>${p}</Box>
          ))}
          <Box component="input" value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v); }}
            placeholder="Custom" sx={{ py: 0.85, textAlign: 'center', borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, color: t.text.primary, fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit', outline: 'none', minWidth: 0, '&::placeholder': { color: t.text.tertiary } }} />
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
        <Box sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>Potential Payout</Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', color: t.gain, lineHeight: 1.3 }}>{fmtUsd(payout)}</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary }}>{odds.toFixed(2)}x your amount</Typography>
        </Box>
        <Box sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>Odds</Typography>
          <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', color: CYAN, lineHeight: 1.3 }}>{odds.toFixed(2)}x</Typography>
          <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary }}>Updated in real time</Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 1.5 }}>
        <Box component="button" onClick={submit} disabled={isSubmitting} sx={{ flex: 1, py: 1.25, borderRadius: 1, border: 'none', cursor: 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.03em', opacity: isSubmitting ? 0.6 : 1, '&:hover': { filter: 'brightness(1.05)' } }}>
          {!connected ? 'SIGN IN TO PREDICT' : isSubmitting ? 'PLACING…' : 'PLACE PREDICTION'}
        </Box>
        <Box component="button" onClick={submit} disabled={!canBet} sx={{ width: 52, borderRadius: 1, border: `1px solid ${CYAN}66`, bgcolor: 'transparent', color: CYAN, cursor: canBet ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: canBet ? 1 : 0.5 }}>
          <Bolt sx={{ fontSize: 20 }} />
        </Box>
      </Box>
    </Box>
  );
}
