'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Button, TextField, CircularProgress } from '@mui/material';
import { ThreeWaySelector } from '@/components/sports/ThreeWaySelector';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import type { Pool } from '@/lib/api';

const PRESETS = [10, 50, 100, 500];

/**
 * Inline bet panel for the Live page (Kalshi-style right rail). Reuses the
 * shared useDeposit flow + ThreeWaySelector so betting here is identical to the
 * match page. Sports-only (3-way), so no PM/crypto special-casing.
 */
export function LiveBetPanel({ pool }: { pool: Pool | null }) {
  const t = useThemeTokens();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset } = useDeposit();
  const [side, setSide] = useState<'UP' | 'DOWN' | 'DRAW' | null>(null);
  const [amount, setAmount] = useState('');

  // Reset selection whenever a different market is picked.
  useEffect(() => { setSide(null); setAmount(''); }, [pool?.id]);

  const panelSx = {
    bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2,
    p: 2, display: 'flex', flexDirection: 'column', gap: 1.5,
  } as const;

  if (!pool) {
    return (
      <Box sx={{ ...panelSx, alignItems: 'center', justifyContent: 'center', minHeight: 220, textAlign: 'center' }}>
        <Typography sx={{ color: t.text.tertiary, fontSize: '0.85rem' }}>Select a market to place a bet</Typography>
      </Box>
    );
  }

  const balanceNum = balance ? balance.uiAmount : 0;
  const amountNum = parseFloat(amount) || 0;
  const amountUsdc = Math.round(amountNum * USDC_DIVISOR);
  const tUp = Number(pool.totalUp), tDown = Number(pool.totalDown), tDraw = Number(pool.totalDraw);
  const isOpen = pool.status === 'JOINING';

  const estPayout = (() => {
    if (!side || amountNum <= 0) return 0;
    const totalPool = tUp + tDown + tDraw + amountUsdc;
    const sideTotal = (side === 'UP' ? tUp : side === 'DOWN' ? tDown : tDraw) + amountUsdc;
    return sideTotal > 0 ? (amountUsdc / sideTotal) * totalPool / USDC_DIVISOR : 0;
  })();

  const canSubmit = connected && !!side && amountNum > 0 && amountNum <= balanceNum && isOpen && depositState.status === 'idle';
  const isSubmitting =
    depositState.status === 'preparing' ||
    depositState.status === 'signing' ||
    depositState.status === 'confirming';

  // No modal: the button shows "Placing…" + a toast confirms. Reset to idle
  // afterwards so re-betting works; clear the amount on success.
  const submit = async () => {
    if (!side || amountNum <= 0) return;
    try {
      await deposit(pool.id, side as 'UP' | 'DOWN', amountUsdc);
      setAmount('');
    } catch { /* surfaced via toast */ }
    reset();
  };

  return (
    <Box sx={panelSx}>
      <Typography sx={{ fontSize: '0.92rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.3 }}>
        {pool.homeTeam || 'Home'} vs {pool.awayTeam || 'Away'}
      </Typography>

      <ThreeWaySelector
        side={side}
        onSideChange={isOpen ? setSide : () => {}}
        totalUp={tUp}
        totalDown={tDown}
        totalDraw={tDraw}
        homeTeam={pool.homeTeam || undefined}
        awayTeam={pool.awayTeam || undefined}
        disabled={!isOpen}
        numSides={pool.numSides}
      />

      {isOpen ? (
        <>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {PRESETS.map(p => (
              <Button key={p} size="small" onClick={() => setAmount(String(p))}
                sx={{ flex: 1, minWidth: 0, py: 0.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', borderRadius: '5px',
                  bgcolor: amountNum === p ? t.hover.emphasis : t.border.subtle, color: amountNum === p ? t.text.primary : t.text.secondary,
                  '&:hover': { bgcolor: t.hover.strong } }}>
                ${p}
              </Button>
            ))}
          </Box>

          <TextField fullWidth size="small" placeholder="Amount (USDC)" type="number" value={amount}
            onChange={e => setAmount(e.target.value)} inputProps={{ min: 1, step: 'any' }}
            sx={{ '& .MuiInputBase-root': { bgcolor: t.border.subtle, borderRadius: '5px' },
              '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
              '& .MuiInputBase-input': { color: t.text.primary, fontSize: '0.9rem', MozAppearance: 'textfield',
                '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 } } }} />

          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.strong }}>
            Balance: ${balanceNum.toFixed(2)} USDC
          </Typography>

          {side && amountNum > 0 && (
            <Box sx={{ py: 1.5, px: 1.5, bgcolor: t.hover.light, borderRadius: '5px' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Estimated payout</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.gain }}>${estPayout.toFixed(2)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Multiplier</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.primary }}>
                  {amountNum > 0 ? (estPayout / amountNum).toFixed(2) : '0.00'}x
                </Typography>
              </Box>
            </Box>
          )}

          <Button fullWidth variant="contained" disabled={!canSubmit} onClick={submit}
            startIcon={isSubmitting ? <CircularProgress size={15} thickness={5} sx={{ color: 'inherit' }} /> : null}
            sx={{ bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: '0.85rem', py: 1.1, borderRadius: '5px', textTransform: 'none',
              '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' }, '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed } }}>
            {!connected ? 'Connect Wallet' : isSubmitting ? 'Placing…' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : amountNum > balanceNum ? 'Insufficient Balance' : 'Place Prediction'}
          </Button>
        </>
      ) : (
        <Box sx={{ textAlign: 'center', py: 2, bgcolor: t.hover.subtle, borderRadius: '5px' }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.muted }}>Predictions closed</Typography>
        </Box>
      )}
    </Box>
  );
}
