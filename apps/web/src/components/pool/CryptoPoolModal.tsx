'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Box, Typography, Drawer, Button, TextField, IconButton } from '@mui/material';
import { Close, OpenInNew } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { AssetIcon } from '@/components/AssetIcon';
import { InlineChart } from '@/components/pool/InlineChart';
import { AnimatedValue } from '@/components/AnimatedValue';
import { TransactionModal } from '@/components/TransactionModal';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { usePriceStream } from '@/hooks/usePriceStream';
import { INTERVAL_LABELS, INTERVAL_TAG_IMAGES } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { Pool } from '@/lib/api';

const PRESETS = [10, 50, 100, 500];

interface Props {
  pool: Pool | null;
  onClose: () => void;
}

export function CryptoPoolModal({ pool, onClose }: Props) {
  const t = useThemeTokens();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset: resetDeposit } = useDeposit();

  const assetArr = useMemo(() => (pool ? [pool.asset] : []), [pool?.asset]);
  const { getPrice } = usePriceStream(assetArr, { enabled: !!pool });
  const livePrice = pool ? getPrice(pool.asset) : null;

  const [side, setSide] = useState<'UP' | 'DOWN' | null>(null);
  const [amount, setAmount] = useState('');
  const [showTxModal, setShowTxModal] = useState(false);
  const [bets, setBets] = useState<Array<{ wallet: string; side: string; amount: string; createdAt: string }>>([]);
  const knownBetsRef = useRef<Set<string>>(new Set());
  const [newBetKeys, setNewBetKeys] = useState<Set<string>>(new Set());
  const [liveTotals, setLiveTotals] = useState<{ totalUp: string; totalDown: string; totalPool: string } | null>(null);

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
          setLiveTotals({ totalUp: pd.data.totalUp, totalDown: pd.data.totalDown, totalPool: pd.data.totalPool });
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

  const totalUp = Number(liveTotals?.totalUp ?? pool?.totalUp ?? 0);
  const totalDown = Number(liveTotals?.totalDown ?? pool?.totalDown ?? 0);
  const tugTotal = totalUp + totalDown;

  const upPct = tugTotal > 0 ? Math.round((totalUp / tugTotal) * 100) : 50;
  const downPct = 100 - upPct;

  // Estimated payout
  const estimatedPayout = useMemo(() => {
    if (!pool || !side || amountNum <= 0) return 0;
    const tUp = Number(liveTotals?.totalUp ?? pool.totalUp);
    const tDown = Number(liveTotals?.totalDown ?? pool.totalDown);
    const totalPool = tUp + tDown + amountUsdc;
    const sideTotal = (side === 'UP' ? tUp : tDown) + amountUsdc;
    if (sideTotal === 0) return 0;
    return (amountUsdc / sideTotal) * totalPool / USDC_DIVISOR;
  }, [pool, side, amountUsdc, amountNum, liveTotals]);

  const canSubmit = connected && side && amountNum > 0 && amountNum <= balanceNum && depositState.status === 'idle';

  const handleSubmit = async () => {
    if (!pool || !side) return;
    setShowTxModal(true);
    try {
      await deposit(pool.id, side, amountUsdc);
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

  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  const intervalTagImg = INTERVAL_TAG_IMAGES[pool.interval];

  return (
    <>
      <Drawer
        anchor="bottom"
        open={!!pool}
        onClose={onClose}
        transitionDuration={250}
        sx={{
          '& .MuiDrawer-paper': {
            width: { xs: '100%', sm: 420 },
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
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <AssetIcon asset={pool.asset} size={28} />
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>
                    {pool.asset}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    {livePrice ? `$${Number(livePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  {intervalTagImg && (
                    <Box component="img" src={intervalTagImg} alt={intervalLabel} sx={{ height: 14, objectFit: 'contain' }} />
                  )}
                  <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {intervalLabel}
                  </Typography>
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
                <IconButton size="small" sx={{ color: t.text.tertiary, '&:hover': { color: t.text.primary } }}>
                  <OpenInNew sx={{ fontSize: 16 }} />
                </IconButton>
              </Link>
              <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}>
                <Close sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Mini chart — controls hidden */}
          <Box sx={{
            height: { xs: 180, sm: 300 }, overflow: 'hidden',
            '& > div': {
              height: { xs: '180px !important', sm: '300px !important' },
              '& > div:first-of-type': { display: 'none !important' },
            },
            '& text': { fontSize: '9px !important' },
          }}>
            <InlineChart asset={pool.asset} livePrice={livePrice} strikePrice={pool.strikePrice} />
          </Box>

          <Box sx={{ height: 12 }} />

          {/* UP/DOWN selector */}
          <Box sx={{ px: 2, mb: 1.5, display: 'flex', gap: '3px' }}>
            {[
              { key: 'UP' as const, label: 'UP', icon: '/assets/up-icon-64x64.png', pct: upPct, total: totalUp, color: t.up },
              { key: 'DOWN' as const, label: 'DOWN', icon: '/assets/down-icon-64x64.png', pct: downPct, total: totalDown, color: t.down },
            ].map((s) => {
              const active = side === s.key;
              return (
                <Box
                  key={s.key}
                  onClick={() => setSide(s.key)}
                  sx={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                    py: 1, cursor: 'pointer',
                    bgcolor: active ? withAlpha(s.color, 0.09) : t.hover.light,
                    borderRadius: '5px',
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: withAlpha(s.color, 0.07) },
                  }}
                >
                  <Box component="img" src={s.icon} alt={s.label} sx={{ width: 18, height: 18 }} />
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: active ? s.color : t.text.strong }}>
                    {s.label}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: active ? s.color : t.text.primary }}>
                    {s.pct}%
                  </Typography>
                  <Typography component="span" sx={{ fontSize: '0.65rem', fontWeight: 500, color: t.text.tertiary }}>
                    <AnimatedValue value={s.total / USDC_DIVISOR} prefix="$" duration={0.6} />
                  </Typography>
                </Box>
              );
            })}
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

          {/* Submit */}
          <Box sx={{ px: 2, mt: 'auto', pb: 1.5 }}>
            <Button
              fullWidth
              variant="contained"
              disabled={!canSubmit}
              onClick={handleSubmit}
              sx={{
                bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: '0.8rem',
                py: 1, borderRadius: '5px', textTransform: 'none',
                '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
                '&:disabled': { bgcolor: t.hover.medium, color: t.text.dimmed },
              }}
            >
              {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
            </Button>
            <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', width: '100%' }}>
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
