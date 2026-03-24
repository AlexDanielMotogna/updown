'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, Drawer, Button, TextField, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ThreeWaySelector } from './ThreeWaySelector';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { UP_COLOR as HOME_COLOR, DOWN_COLOR as AWAY_COLOR, DRAW_COLOR } from '@/lib/constants';
import { TransactionModal } from '@/components';
import { GAIN_COLOR, UP_COLOR } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';
import type { Pool } from '@/lib/api';

const PRESETS = [10, 50, 100, 500];

function formatKickoff(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

interface Props {
  pool: Pool | null;
  onClose: () => void;
}

export function MatchBetModal({ pool, onClose }: Props) {
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset: resetDeposit } = useDeposit();

  const [side, setSide] = useState<'UP' | 'DOWN' | 'DRAW' | null>(null);
  const [amount, setAmount] = useState('');
  const [showTxModal, setShowTxModal] = useState(false);
  const [bets, setBets] = useState<Array<{ wallet: string; side: string; amount: string; createdAt: string }>>([]);
  const knownBetsRef = useRef<Set<string>>(new Set());
  const [newBetKeys, setNewBetKeys] = useState<Set<string>>(new Set());
  const [liveTotals, setLiveTotals] = useState<{ totalUp: string; totalDown: string; totalDraw: string; totalPool: string } | null>(null);

  // Fetch bets with polling every 5s
  const poolId = pool?.id;
  useEffect(() => {
    if (!poolId) { setBets([]); knownBetsRef.current.clear(); setLiveTotals(null); return; }
    let active = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const url = `${apiBase}/api/pools/${poolId}/bets`;
    const poolUrl = `${apiBase}/api/pools/${poolId}`;
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
      // Also fetch pool totals
      try {
        const pr = await fetch(poolUrl);
        const pd = await pr.json();
        if (active && pd.success && pd.data) {
          setLiveTotals({ totalUp: pd.data.totalUp, totalDown: pd.data.totalDown, totalDraw: pd.data.totalDraw, totalPool: pd.data.totalPool });
        }
      } catch { /* ignore */ }
    };
    fetchBets();
    const iv = setInterval(fetchBets, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [poolId]);

  const amountNum = parseFloat(amount) || 0;
  const amountUsdc = Math.round(amountNum * USDC_DIVISOR);
  const balanceNum = balance ? balance.uiAmount : 0;

  // Estimated payout
  const estimatedPayout = useMemo(() => {
    if (!pool || !side || amountNum <= 0) return 0;
    const totalUp = Number(liveTotals?.totalUp ?? pool.totalUp);
    const totalDown = Number(liveTotals?.totalDown ?? pool.totalDown);
    const totalDraw = Number(liveTotals?.totalDraw ?? pool.totalDraw);
    const totalPool = totalUp + totalDown + totalDraw + amountUsdc;
    const sideTotal = (side === 'UP' ? totalUp : side === 'DOWN' ? totalDown : totalDraw) + amountUsdc;
    if (sideTotal === 0) return 0;
    return (amountUsdc / sideTotal) * totalPool / USDC_DIVISOR;
  }, [pool, side, amountUsdc, amountNum]);

  const canSubmit = connected && side && amountNum > 0 && amountNum <= balanceNum && depositState.status === 'idle';

  const handleSubmit = async () => {
    if (!pool || !side) return;
    setShowTxModal(true);
    try {
      await deposit(pool.id, side!, amountUsdc);
    } catch {
      // handled in state
    }
  };

  const handleCloseTxModal = () => {
    setShowTxModal(false);
    if (depositState.status === 'success') {
      onClose();
      setSide(null);
      setAmount('');
    }
    resetDeposit();
  };

  if (!pool) return null;

  return (
    <>
      <Drawer
        anchor="bottom"
        open={!!pool}
        onClose={onClose}
        transitionDuration={250}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 400 },
            height: { xs: '55vh', sm: '100vh' },
            maxHeight: { xs: '55vh', sm: '100vh' },
            right: { sm: 0 },
            left: { sm: 'auto' },
            top: { sm: 0 },
            bottom: { sm: 0 },
            bgcolor: '#0B0F14 !important',
            backgroundImage: 'none !important',
            borderLeft: 'none',
            borderTopLeftRadius: { xs: 12, sm: 0 },
            borderTopRightRadius: { xs: 12, sm: 0 },
            overflowY: 'auto',
          },
          '& .MuiBackdrop-root': { bgcolor: 'rgba(0,0,0,0.5)' },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {pool.league === 'CL' ? 'Champions League' : pool.league}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>
                {formatKickoff(pool.startTime)}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.4)' }}>
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Teams */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, py: 3, px: 2 }}>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              {pool.homeTeamCrest && (
                <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 48, height: 48, objectFit: 'contain', mb: 1 }} />
              )}
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {pool.homeTeam}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>vs</Typography>
            <Box sx={{ textAlign: 'center', flex: 1 }}>
              {pool.awayTeamCrest && (
                <Box component="img" src={pool.awayTeamCrest} alt="" sx={{ width: 48, height: 48, objectFit: 'contain', mb: 1 }} />
              )}
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: '#fff' }}>
                {pool.awayTeam}
              </Typography>
            </Box>
          </Box>

          {/* Side selector */}
          <Box sx={{ px: 2, mb: 2 }}>
            <ThreeWaySelector
              side={side}
              onSideChange={setSide}
              totalUp={Number(liveTotals?.totalUp ?? pool.totalUp)}
              totalDown={Number(liveTotals?.totalDown ?? pool.totalDown)}
              totalDraw={Number(liveTotals?.totalDraw ?? pool.totalDraw)}
              homeTeam={pool.homeTeam || undefined}
              awayTeam={pool.awayTeam || undefined}
            />
          </Box>

          {/* Amount */}
          <Box sx={{ px: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
              {PRESETS.map(p => (
                <Button
                  key={p}
                  size="small"
                  onClick={() => setAmount(String(p))}
                  sx={{
                    flex: 1, minWidth: 0, py: 0.5,
                    fontSize: '0.75rem', fontWeight: 600,
                    bgcolor: amountNum === p ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                    color: amountNum === p ? '#fff' : 'rgba(255,255,255,0.5)',
                    textTransform: 'none', borderRadius: '5px',
                    '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                  }}
                >
                  ${p}
                </Button>
              ))}
            </Box>
            <TextField
              fullWidth
              size="small"
              placeholder="Amount (USDC)"
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              inputProps={{ min: 1, step: 'any' }}
              sx={{
                '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '5px' },
                '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                '& .MuiInputBase-input': {
                  color: '#fff', fontSize: '0.9rem',
                  MozAppearance: 'textfield',
                  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                },
              }}
            />
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)', mt: 0.75 }}>
              Balance: ${balanceNum.toFixed(2)} USDC
            </Typography>
          </Box>

          {/* Payout preview */}
          {side && amountNum > 0 && (
            <Box sx={{ px: 2, mb: 2, py: 1.5, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Estimated payout</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: GAIN_COLOR }}>
                  ${estimatedPayout.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Multiplier</Typography>
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                  {amountNum > 0 ? (estimatedPayout / amountNum).toFixed(2) : '0.00'}x
                </Typography>
              </Box>
            </Box>
          )}

          {/* Activity log */}
          {bets.length > 0 && (
            <Box sx={{ px: 2, flex: 1, overflow: 'auto', mb: 1, mt: 2, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                Activity
              </Typography>
              <AnimatePresence>
                {bets.map((b) => {
                  const key = `${b.wallet}-${b.createdAt}`;
                  const isNew = newBetKeys.has(key);
                  const sideColor = b.side === 'UP' ? HOME_COLOR : b.side === 'DOWN' ? AWAY_COLOR : DRAW_COLOR;
                  const sideLabel = b.side === 'UP' ? (pool?.homeTeam || 'Home') : b.side === 'DOWN' ? (pool?.awayTeam || 'Away') : 'Draw';
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
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.45)', width: 75, flexShrink: 0 }}>{b.wallet}</Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: sideColor, width: 55, flexShrink: 0 }}>{sideLabel}</Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: '#fff', flex: 1, textAlign: 'right' }}>${amt}</Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.25)', width: 25, textAlign: 'right', flexShrink: 0 }}>{timeStr}</Typography>
                      </Box>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </Box>
          )}

          {/* Submit */}
          <Box sx={{ px: 2, mt: 'auto', pb: 1.5 }}>
            <Button
              fullWidth
              variant="contained"
              disabled={!canSubmit}
              onClick={handleSubmit}
              sx={{
                bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.8rem',
                py: 1, borderRadius: '5px', textTransform: 'none',
                '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
              }}
            >
              {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
            </Button>
            <Link href={`/match/${pool.id}`} style={{ textDecoration: 'none' }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', mt: 1.5, '&:hover': { color: '#fff' } }}>
                View full details &rarr;
              </Typography>
            </Link>
          </Box>
        </Box>
      </Drawer>

      <TransactionModal
        open={showTxModal}
        status={depositState.status}
        title="Placing Prediction"
        txSignature={depositState.txSignature}
        error={depositState.error}
        onClose={handleCloseTxModal}
        onRetry={() => resetDeposit()}
      />
    </>
  );
}
