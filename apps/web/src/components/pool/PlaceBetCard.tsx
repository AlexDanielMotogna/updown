'use client';

/**
 * Clean Kalshi-style place-bet card for parimutuel crypto pools.
 *
 * Structure (top → bottom):
 *   - Asset tile + question line ("Bitcoin Up or Down · 5m / Pick a side")
 *   - UP / DOWN pill buttons with current parimutuel percentages
 *   - Amount input (USDC; balance is shown in the navbar, not here)
 *   - Preset chips ($10 / $50 / $100 / $500)
 *   - One-line payout preview (To win · Current odds)
 *   - Single solid action button
 *   - Fee disclaimer
 *
 * Intentionally drops the old card's EnergyBar (a duplicate of the
 * percentages already on the buttons), the SideSelector with its odds
 * dance, the multi-row PayoutPreview, the motion glow on the submit button
 * and the gradient fill - Kalshi keeps these surfaces calm so the user can
 * focus on amount + side + go.
 */

import { useEffect, useState, type RefObject } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { CheckCircle } from '@mui/icons-material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { AssetIcon } from '@/components/AssetIcon';
import { USDC_DIVISOR, formatPredictionWindow } from '@/lib/format';
import {
  DEFAULT_FEE_PERCENT,
  FEE_BPS_DIVISOR,
  INTERVAL_LABELS,
} from '@/lib/constants';
import { getAssetName } from '@/lib/assets';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { PoolDetail } from '@/lib/api';

const PRESET_AMOUNTS = [10, 50, 100, 500];

/** Returns true once the wall clock has passed `targetIso`. Single setTimeout
 *  scheduled for the exact crossing - no per-second polling - so the card
 *  swaps to the Determining state the moment the window closes. */
function useNowAfter(targetIso: string): boolean {
  const target = new Date(targetIso).getTime();
  const [crossed, setCrossed] = useState(() => Date.now() >= target);
  useEffect(() => {
    if (crossed) return;
    const ms = target - Date.now();
    if (ms <= 0) { setCrossed(true); return; }
    const id = setTimeout(() => setCrossed(true), ms + 50);
    return () => clearTimeout(id);
  }, [target, crossed]);
  return crossed;
}

interface Props {
  pool: PoolDetail;
  selectedSide: 'UP' | 'DOWN';
  onSelectSide: (side: 'UP' | 'DOWN') => void;
  onBet: (side: 'UP' | 'DOWN', amount: number) => void;
  txState: { status: string; error?: string | null };
  betFormRef: RefObject<HTMLDivElement | null>;
}

export function PlaceBetCard({ pool, selectedSide, onSelectSide, onBet, txState, betFormRef }: Props) {
  const t = useThemeTokens();
  const { connected } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const [amount, setAmount] = useState<string>('');

  // Local expiry check - short crypto pools (3m) go JOINING → RESOLVED
  // directly without sitting in ACTIVE, so for a few seconds the status is
  // still JOINING even though the countdown has hit zero. Watching the
  // wall clock against pool.endTime lets us swap the card the instant the
  // window closes instead of waiting on the scheduler's next pass.
  const isExpired = useNowAfter(pool.endTime);

  const isSubmitting = txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error';
  const isPoolOpen = pool.status === 'JOINING' && !isExpired;
  const canInteract = isPoolOpen && connected && !isSubmitting;
  const canBet = canInteract && parseFloat(amount) > 0;

  // ── End-of-pool states ──────────────────────────────────────────────
  const hasWinner = pool.winner === 'UP' || pool.winner === 'DOWN';
  if (hasWinner) {
    return <OutcomeCard pool={pool} winner={pool.winner as 'UP' | 'DOWN'} />;
  }
  if (!isPoolOpen) {
    return <DeterminingCard pool={pool} />;
  }

  // ── Parimutuel percentages + payout estimate ─────────────────────────
  const totalUp = Number(pool.totalUp) / USDC_DIVISOR;
  const totalDown = Number(pool.totalDown) / USDC_DIVISOR;
  const totalPool = totalUp + totalDown;
  const upPct = totalPool > 0 ? Math.round((totalUp / totalPool) * 100) : 50;
  const downPct = 100 - upPct;

  const amountNum = parseFloat(amount) || 0;
  const newSideTotal = selectedSide === 'UP' ? totalUp + amountNum : totalDown + amountNum;
  const newTotal = totalPool + amountNum;
  const grossPayout = newSideTotal > 0 ? (amountNum / newSideTotal) * newTotal : 0;
  const feePercent = userProfile ? userProfile.feeBps / FEE_BPS_DIVISOR : DEFAULT_FEE_PERCENT;
  const potentialPayout = grossPayout * (1 - feePercent);
  const potentialOdds = amountNum > 0 ? potentialPayout / amountNum : 0;

  const sideColor = selectedSide === 'UP' ? t.up : t.down;
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canBet) onBet(selectedSide, amountNum * USDC_DIVISOR);
  };

  // After the early returns above, the pool is guaranteed to be in JOINING,
  // so submit-label cases collapse to just connection + submission state.
  const submitLabel = !connected ? 'Connect Wallet'
    : isSubmitting ? 'Processing…'
    : `Place ${selectedSide} Prediction`;

  return (
    <Box>
    <Box
      component="form"
      onSubmit={handleSubmit}
      ref={betFormRef}
      sx={{
        bgcolor: t.bg.surfaceAlt,
        border: `1px solid ${t.border.subtle}`,
        borderRadius: 2,
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.75,
      }}
    >
      {/* ── Header ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <AssetIcon asset={pool.asset} size={36} />
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {getAssetName(pool.asset)} Up or Down · {intervalLabel}
          </Typography>
        </Box>
      </Box>

      {/* ── UP / DOWN selector - same vertical-card style sports uses in
          ThreeWaySelector: label, big % and live volume stacked. ── */}
      <Box sx={{ display: 'flex', gap: '3px', mt: 0.5 }}>
        <SideCard label="Up" pct={upPct} total={totalUp} color={t.up} selected={selectedSide === 'UP'} onClick={() => canInteract && onSelectSide('UP')} disabled={!canInteract} />
        <SideCard label="Down" pct={downPct} total={totalDown} color={t.down} selected={selectedSide === 'DOWN'} onClick={() => canInteract && onSelectSide('DOWN')} disabled={!canInteract} />
      </Box>

      {/* ── Amount ── */}
      <Box>
        <TextField
          fullWidth
          type="text"
          value={amount}
          onChange={handleAmountChange}
          placeholder="0.00"
          disabled={!canInteract}
          InputProps={{
            // Raw span instead of Typography (which forces its own block
            // line-height) and matched font-size/weight to the input. The
            // adornment now sits on the same text baseline as the number.
            startAdornment: (
              <InputAdornment position="start" sx={{ mr: 0.5, alignSelf: 'center' }} disableTypography>
                <span style={{ color: t.text.tertiary, fontWeight: 800, fontSize: '1.1rem', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>$</span>
              </InputAdornment>
            ),
            endAdornment: (
              <InputAdornment position="end" sx={{ ml: 0.5, alignSelf: 'center' }} disableTypography>
                <span style={{ color: t.text.quaternary, fontSize: '0.7rem', fontWeight: 700, lineHeight: 1 }}>USDC</span>
              </InputAdornment>
            ),
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              fontSize: '1.1rem',
              fontWeight: 800,
              fontVariantNumeric: 'tabular-nums',
              bgcolor: t.bg.input,
              borderRadius: 1.5,
              '& fieldset': { border: 'none' },
              '&:hover fieldset': { border: 'none' },
              '&.Mui-focused fieldset': { border: 'none' },
            },
            // Trim the input's own left padding so the entered amount sits
            // flush against the $ adornment, and clamp line-height to 1 so
            // the number shares the exact baseline with the $/USDC spans
            // (MUI's default ~1.4em line-height was pushing the digit down).
            '& .MuiOutlinedInput-input': {
              pl: 0,
              lineHeight: 1,
              py: 1.25,
            },
          }}
        />
      </Box>

      {/* ── Preset chips ── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.6 }}>
        {PRESET_AMOUNTS.map((p) => {
          const active = amount === String(p);
          return (
            <Button
              key={p}
              size="small"
              onClick={() => canInteract && setAmount(String(p))}
              disabled={!canInteract}
              sx={{
                minWidth: 0,
                py: 0.55,
                fontSize: '0.78rem',
                fontWeight: 700,
                color: active ? t.text.primary : t.text.secondary,
                bgcolor: active ? t.hover.emphasis : t.hover.default,
                textTransform: 'none',
                borderRadius: 1.5,
                '&:hover': { bgcolor: t.hover.strong },
                '&:disabled': { bgcolor: t.hover.subtle, color: t.text.muted },
              }}
            >
              ${p}
            </Button>
          );
        })}
      </Box>

      {/* ── Payout preview ── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.tertiary }}>
            Payout if {selectedSide === 'UP' ? 'Up' : 'Down'}
          </Typography>
          <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: amountNum > 0 ? t.gain : t.text.quaternary, fontVariantNumeric: 'tabular-nums' }}>
            ${potentialPayout.toFixed(2)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.quaternary }}>Current odds</Typography>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
            {potentialOdds > 0 ? `${potentialOdds.toFixed(2)}x` : '-'}
          </Typography>
        </Box>
      </Box>

      {/* ── Error ── */}
      {txState.error && (
        <Alert
          severity="error"
          sx={{
            bgcolor: withAlpha(t.down, 0.08),
            border: 'none',
            borderRadius: 1,
            py: 0,
            '& .MuiAlert-message': { fontSize: '0.75rem' },
          }}
        >
          {txState.error}
        </Alert>
      )}

      {/* ── Submit ── */}
      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={!canBet}
        sx={{
          py: 1.25,
          fontSize: '0.85rem',
          fontWeight: 800,
          letterSpacing: '0.04em',
          borderRadius: 1.5,
          textTransform: 'uppercase',
          bgcolor: sideColor,
          color: t.text.contrast,
          boxShadow: 'none',
          '&:hover': { bgcolor: sideColor, filter: 'brightness(1.1)', boxShadow: 'none' },
          '&:disabled': { bgcolor: t.hover.medium, color: t.text.muted },
        }}
      >
        {submitLabel}
      </Button>

    </Box>
      <TermsFooter />
    </Box>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

/** "By trading, you agree to the Terms of Use." footer used by every state
 *  of the card (open / determining / outcome). Rendered OUTSIDE the card box
 *  so it floats under the bordered surface like the disclosure copy on
 *  Polymarket / Kalshi, not inside the action area. Hover surfaces the full
 *  jurisdictional disclaimer via tooltip. */
function TermsFooter() {
  const t = useThemeTokens();
  return (
    <Tooltip
      title="By trading, you agree to the Terms of Use, including that you are not (i) a U.S. person and (ii) located in the United States, France or other restricted territory."
      arrow placement="top"
      slotProps={{
        tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.72rem', maxWidth: 280, lineHeight: 1.4, p: 1.2 } },
        arrow: { sx: { color: t.bg.tooltip } },
      }}
    >
      <Typography
        sx={{
          fontSize: '0.78rem',
          color: t.text.secondary,
          fontWeight: 600,
          textAlign: 'center',
          mt: 1.5,
          cursor: 'help',
          '&:hover': { color: t.text.primary },
          transition: 'color 0.15s',
        }}
      >
        By trading, you agree to the <Box component="span" sx={{ textDecoration: 'underline' }}>Terms of Use</Box>.
      </Typography>
    </Tooltip>
  );
}


/** Vertical card cell - same shape as ThreeWaySelector on the sports page
 *  so the place-bet UI feels consistent across both pool types. */
function SideCard({ label, pct, total, color, selected, onClick, disabled }: {
  label: string;
  pct: number;
  total: number;
  color: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const t = useThemeTokens();
  return (
    <Box
      onClick={() => !disabled && onClick()}
      sx={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        py: 1.5,
        cursor: disabled ? 'default' : 'pointer',
        bgcolor: selected ? withAlpha(color, 0.09) : t.hover.light,
        borderRadius: '5px',
        transition: 'all 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        '&:hover': disabled ? {} : { bgcolor: withAlpha(color, 0.07) },
      }}
    >
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: selected ? color : t.text.bright, lineHeight: 1 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: selected ? color : t.text.primary, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
        {pct}%
      </Typography>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.soft, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        ${total.toFixed(2)}
      </Typography>
    </Box>
  );
}

// ─── End-of-pool states ──────────────────────────────────────────────────────
//
// EndedCard is the shared shell - same border / padding / Terms of Use footer
// the active card has, so swapping the body in doesn't shift the layout. The
// active card is a column flex with `gap`, so the two states below render
// inside that same shell-shape.

function EndedCard({ pool, children }: { pool: PoolDetail; children: React.ReactNode }) {
  const t = useThemeTokens();
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  return (
    <Box>
      <Box
        sx={{
          bgcolor: t.bg.surfaceAlt,
          border: `1px solid ${t.border.subtle}`,
          borderRadius: 2,
          p: { xs: 2, md: 2.5 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.25,
          alignItems: 'center',
          textAlign: 'center',
        }}
      >
        {children}
        <Typography suppressHydrationWarning sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.tertiary, lineHeight: 1.45 }}>
          {getAssetName(pool.asset)} Up or Down · {intervalLabel}
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: t.text.quaternary, fontVariantNumeric: 'tabular-nums', mt: 0.25 }}>
            {formatPredictionWindow(pool.startTime, pool.endTime)}
          </Box>
        </Typography>
      </Box>
      <TermsFooter />
    </Box>
  );
}

/** "Hold on, determining winner…" - window has closed but the on-chain final
 *  price hasn't been committed yet. Auto-resolution will swap this to the
 *  OutcomeCard as soon as the scheduler picks up the result. */
function DeterminingCard({ pool }: { pool: PoolDetail }) {
  const t = useThemeTokens();
  return (
    <EndedCard pool={pool}>
      <CircularProgress size={28} sx={{ color: t.text.secondary, mt: 0.5 }} />
      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: t.text.primary, lineHeight: 1.3 }}>
        Hold on, determining winner…
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: t.text.tertiary, lineHeight: 1.45, maxWidth: 280 }}>
        This market has ended. Final resolution will appear automatically as soon as it is available on-chain.
      </Typography>
    </EndedCard>
  );
}

/** Final outcome state - large check tile + "Outcome: Up / Down". */
function OutcomeCard({ pool, winner }: { pool: PoolDetail; winner: 'UP' | 'DOWN' }) {
  const t = useThemeTokens();
  const color = winner === 'UP' ? t.up : t.down;
  return (
    <EndedCard pool={pool}>
      <Box
        sx={{
          width: 52, height: 52, borderRadius: '50%',
          bgcolor: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          mt: 0.5,
        }}
      >
        <CheckCircle sx={{ fontSize: 36, color: t.text.contrast }} />
      </Box>
      <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color, lineHeight: 1.3 }}>
        Outcome: {winner === 'UP' ? 'Up' : 'Down'}
      </Typography>
    </EndedCard>
  );
}
