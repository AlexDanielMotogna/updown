'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, Drawer, Button, TextField, IconButton } from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { ThreeWaySelector } from './ThreeWaySelector';
import { MatchAnalysis } from './MatchAnalysis';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { TransactionModal } from '@/components';
import { USDC_DIVISOR } from '@/lib/format';
import type { Pool } from '@/lib/api';
import { getSocket, subscribePool, unsubscribePool } from '@/lib/socket';

const PM_CATEGORY_LABELS: Record<string, string> = {
  PM_POLITICS: 'Politics',
  PM_GEO: 'Geopolitics',
  PM_CULTURE: 'Culture & Entertainment',
  PM_FINANCE: 'Finance & Economy',
};

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
  const t = useThemeTokens();
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

    // Subscribe to WebSocket for instant updates
    const socket = getSocket();
    subscribePool(poolId);
    const onPoolUpdated = (data: { id: string; totalUp?: string; totalDown?: string; totalDraw?: string; totalPool?: string }) => {
      if (data.id !== poolId) return;
      if (data.totalUp != null) {
        setLiveTotals({ totalUp: data.totalUp!, totalDown: data.totalDown!, totalDraw: data.totalDraw ?? '0', totalPool: data.totalPool! });
      }
      // Also refetch bets list to show the new bet
      fetchBets();
    };
    socket.on('pool:updated', onPoolUpdated);

    return () => { active = false; clearInterval(iv); socket.off('pool:updated', onPoolUpdated); unsubscribePool(poolId); };
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

  const isPrediction = pool.league?.startsWith('PM_');
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const winnerLabel = isResolved ? (pool.winner === 'UP' ? (isPrediction && !pool.awayTeam ? 'Yes' : pool.homeTeam) : pool.winner === 'DOWN' ? (isPrediction && !pool.awayTeam ? 'No' : pool.awayTeam) : pool.winner === 'DRAW' ? 'Draw' : null) : null;
  const winnerColor = pool.winner === 'UP' ? t.up : pool.winner === 'DOWN' ? t.down : t.draw;
  const leagueLabel = PM_CATEGORY_LABELS[pool.league || ''] || (pool.league === 'CL' ? 'Champions League' : pool.league === 'PL' ? 'Premier League' : pool.league === 'PD' ? 'La Liga' : pool.league === 'SA' ? 'Serie A' : pool.league === 'BL1' ? 'Bundesliga' : pool.league === 'FL1' ? 'Ligue 1' : pool.league);

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
            height: { xs: '75vh', sm: '100vh' },
            maxHeight: { xs: '75vh', sm: '100vh' },
            right: { sm: 0 },
            left: { sm: 'auto' },
            top: { sm: 0 },
            bottom: { sm: 0 },
            bgcolor: `${t.bg.app} !important`,
            backgroundImage: 'none !important',
            borderLeft: 'none',
            borderTopLeftRadius: { xs: 12, sm: 0 },
            borderTopRightRadius: { xs: 12, sm: 0 },
            overflowY: 'auto',
          },
          '& .MuiBackdrop-root': { bgcolor: t.shadow.default },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {leagueLabel}
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>
                {formatKickoff(pool.startTime)}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}>
              <Close sx={{ fontSize: 18 }} />
            </IconButton>
          </Box>

          {/* Teams / Question */}
          {isPrediction ? (
            <Box sx={{ py: 3, px: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.4 }}>
                {pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, py: 3, px: 2 }}>
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                {pool.homeTeamCrest && (
                  <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 48, height: 48, objectFit: 'contain', mb: 1 }} />
                )}
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? t.up : t.text.primary }}>
                  {pool.homeTeam}
                </Typography>
              </Box>
              {isResolved && pool.homeScore != null && pool.awayScore != null ? (
                <Typography sx={{ fontSize: '1.3rem', fontWeight: 700, color: t.text.primary }}>
                  {pool.homeScore} - {pool.awayScore}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>vs</Typography>
              )}
              <Box sx={{ textAlign: 'center', flex: 1 }}>
                {pool.awayTeamCrest && (
                  <Box component="img" src={pool.awayTeamCrest} alt="" sx={{ width: 48, height: 48, objectFit: 'contain', mb: 1 }} />
                )}
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? t.down : t.text.primary }}>
                  {pool.awayTeam}
                </Typography>
              </Box>
            </Box>
          )}

          {/* Winner result */}
          {isResolved && winnerLabel && (
            <Box sx={{ mx: 2, mb: 2, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.5 }}>
                Final Result
              </Typography>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: winnerColor }}>
                {winnerLabel} wins
              </Typography>
            </Box>
          )}

          {/* Side selector (show as read-only when resolved) */}
          <Box sx={{ px: 2, mb: 2 }}>
            <ThreeWaySelector
              side={side}
              onSideChange={isResolved ? () => {} : setSide}
              totalUp={Number(liveTotals?.totalUp ?? pool.totalUp)}
              totalDown={Number(liveTotals?.totalDown ?? pool.totalDown)}
              totalDraw={Number(liveTotals?.totalDraw ?? pool.totalDraw)}
              homeTeam={isPrediction ? (pool.awayTeam ? pool.homeTeam || undefined : 'Yes') : (pool.homeTeam || undefined)}
              awayTeam={isPrediction ? (pool.awayTeam || 'No') : (pool.awayTeam || undefined)}
              disabled={isResolved}
              numSides={pool.numSides}
            />
          </Box>

          {/* Bet form - only show when pool is open */}
          {!isResolved && (
            <>
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
                        bgcolor: amountNum === p ? t.hover.emphasis : t.hover.default,
                        color: amountNum === p ? t.text.primary : t.text.secondary,
                        textTransform: 'none', borderRadius: '5px',
                        '&:hover': { bgcolor: t.hover.strong },
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
                    '& .MuiInputBase-root': { bgcolor: t.hover.default, borderRadius: '5px' },
                    '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                    '& .MuiInputBase-input': {
                      color: t.text.primary, fontSize: '0.9rem',
                      MozAppearance: 'textfield',
                      '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                    },
                  }}
                />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.strong, mt: 0.75 }}>
                  Balance: ${balanceNum.toFixed(2)} USDC
                </Typography>
              </Box>

              {/* Payout preview */}
              {side && amountNum > 0 && (
                <Box sx={{ px: 2, mb: 2, py: 1.5, bgcolor: t.hover.light }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Estimated payout</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.gain }}>
                      ${estimatedPayout.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Multiplier</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.primary }}>
                      {amountNum > 0 ? (estimatedPayout / amountNum).toFixed(2) : '0.00'}x
                    </Typography>
                  </Box>
                </Box>
              )}
            </>
          )}

          {/* Activity log */}
          {bets.length > 0 && (
            <Box sx={{ px: 2, flex: 1, overflow: 'auto', mb: 1, mt: 2, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
                Activity
              </Typography>
              <AnimatePresence>
                {bets.map((b) => {
                  const key = `${b.wallet}-${b.createdAt}`;
                  const isNew = newBetKeys.has(key);
                  const sideColor = b.side === 'UP' ? t.up : b.side === 'DOWN' ? t.down : t.draw;
                  const rawLabel = b.side === 'UP' ? (isPrediction && !pool?.awayTeam ? 'Yes' : pool?.homeTeam || 'Home') : b.side === 'DOWN' ? (isPrediction && !pool?.awayTeam ? 'No' : pool?.awayTeam || 'Away') : 'Draw';
                  const sideLabel = rawLabel.length > 6 ? rawLabel.slice(0, 5) + '…' : rawLabel;
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

          {/* Submit / Result footer */}
          <Box sx={{ px: 2, mt: 'auto', pb: 1.5 }}>
            {isResolved ? (
              <Link href={`/match/${pool.id}`} style={{ textDecoration: 'none' }}>
                <Button
                  fullWidth
                  variant="contained"
                  sx={{
                    bgcolor: t.border.default, color: t.text.primary, fontWeight: 700, fontSize: '0.8rem',
                    py: 1, borderRadius: '5px', textTransform: 'none',
                    '&:hover': { bgcolor: t.hover.emphasis },
                  }}
                >
                  View Results
                </Button>
              </Link>
            ) : (
              <>
                <Button
                  fullWidth
                  variant="contained"
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  sx={{
                    bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: '0.8rem',
                    py: 1, borderRadius: '5px', textTransform: 'none',
                    '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
                    '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
                  }}
                >
                  {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
                </Button>
                <Link href={`/match/${pool.id}`} style={{ textDecoration: 'none', width: '100%' }}>
                  <Button
                    fullWidth
                    size="small"
                    endIcon={<OpenInNew sx={{ fontSize: 13 }} />}
                    sx={{
                      mt: 1.5,
                      py: 0.75,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: t.text.secondary,
                      bgcolor: t.hover.default,
                      borderRadius: '4px',
                      textTransform: 'none',
                      '&:hover': { bgcolor: t.hover.strong, color: t.text.primary },
                    }}
                  >
                    Open Full Page
                  </Button>
                </Link>
              </>
            )}
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
