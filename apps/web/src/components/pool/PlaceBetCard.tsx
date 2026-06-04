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
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { usePoolWeighting, projectWeightedPayout } from '@/hooks/usePoolWeighting';
import { AssetIcon } from '@/components/AssetIcon';
import { DeterminingCard as SharedDetermining, OutcomeCard as SharedOutcome, CancelledCard as SharedCancelled, TermsFooter } from './ResolutionCards';
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

  // Phase 1A — time-weighted payout snapshot. MUST be called before the
  // early returns below so the hook order stays stable across renders.
  // Originally I parked this next to the payout-estimate math down at
  // line ~130, but the early returns for CANCELLED / hasWinner /
  // !isPoolOpen skip the call on resolved pools and React threw error
  // #300 ("Rendered fewer hooks than expected") on the JOINING →
  // RESOLVED transition. The hook itself gates polling via `enabled`,
  // so calling it on a resolved pool is cheap (single fetch, no
  // refetchInterval).
  const { data: weighting } = usePoolWeighting(pool.id, isPoolOpen);

  // ── End-of-pool states ──────────────────────────────────────────────
  // CANCELLED takes precedence: the pool can be cancelled with winner=null
  // (PM markets retired by Polymarket where neither Gamma nor CTF could
  // resolve, or admin-cancelled sports pools). Without this branch the
  // page falls through to DeterminingCard and the user stares at the
  // determining spinner for a market that will never resolve.
  if (pool.status === 'CANCELLED') {
    return <CancelledCard pool={pool} hasUserPosition={hasUserBet(pool)} />;
  }
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

  // Phase 1A — time-weighted payout projection. `weighting` was fetched
  // by the hook at the top of the component (kept above the early
  // returns to keep hook order stable). Here we just derive the
  // projection from the cached value + the user's prospective amount.
  const weightedProjection = weighting && amountNum > 0
    ? projectWeightedPayout({
        weighting,
        amount: BigInt(Math.round(amountNum * USDC_DIVISOR)),
        side: selectedSide,
        feePercent,
      })
    : null;

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

      {/* ── Time-weight badge + Payout preview ──────────────────────
           Phase 1A: shows the live multiplier and the projected
           weighted payout side-by-side with the raw parimutuel one
           so users see what's coming when Phase 1B/2 makes it the
           canonical formula. Multiplier is the live currentMultiplier
           from /weighting — drops as lockTime approaches. */}
      {weighting && (
        <Box
          sx={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            bgcolor: withAlpha(sideColor, 0.07),
            border: `1px solid ${withAlpha(sideColor, 0.18)}`,
            borderRadius: 1.5,
            px: 1.25,
            py: 0.75,
          }}
        >
          <Tooltip
            arrow
            placement="top"
            title={`Bets placed earlier in the window earn a bigger share of the losing pool. Floor ${(weighting.config.floor * 100).toFixed(0)}%, decay exponent ${weighting.config.exponent}.`}
          >
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.text.tertiary, cursor: 'help' }}>
              Time-weight now
            </Typography>
          </Tooltip>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: sideColor, fontVariantNumeric: 'tabular-nums' }}>
            ×{weighting.currentMultiplier.toFixed(2)}
          </Typography>
        </Box>
      )}

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
        {weightedProjection && (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mt: 0.25, pt: 0.5, borderTop: `1px dashed ${t.border.subtle}` }}>
            <Tooltip
              arrow
              placement="top"
              title="Phase 1A preview — the on-chain claim still pays the raw amount until the next program update."
            >
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.quaternary, cursor: 'help' }}>
                Weighted projection
              </Typography>
            </Tooltip>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
              ${weightedProjection.payout.toFixed(2)}
              {weightedProjection.odds > 0 && (
                <Box component="span" sx={{ color: t.text.quaternary, ml: 0.5, fontWeight: 500 }}>
                  ({weightedProjection.odds.toFixed(2)}x)
                </Box>
              )}
            </Typography>
          </Box>
        )}
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

// ─── Crypto-specific adapters around the shared resolution cards ────────────
//
// The shared module (./ResolutionCards.tsx) is generic over subtitle / meta /
// outcome label so both this file and the /match/[id] sports surface use the
// exact same shell. These wrappers translate the crypto pool's asset +
// interval + prediction window into the strings the shared API expects.

function DeterminingCard({ pool }: { pool: PoolDetail }) {
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  return (
    <SharedDetermining
      subtitle={`${getAssetName(pool.asset)} Up or Down · ${intervalLabel}`}
      meta={formatPredictionWindow(pool.startTime, pool.endTime)}
    />
  );
}

function OutcomeCard({ pool, winner }: { pool: PoolDetail; winner: 'UP' | 'DOWN' }) {
  const t = useThemeTokens();
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  return (
    <SharedOutcome
      subtitle={`${getAssetName(pool.asset)} Up or Down · ${intervalLabel}`}
      meta={formatPredictionWindow(pool.startTime, pool.endTime)}
      outcomeLabel={winner === 'UP' ? 'Up' : 'Down'}
      outcomeColor={winner === 'UP' ? t.up : t.down}
    />
  );
}

function CancelledCard({ pool, hasUserPosition }: { pool: PoolDetail; hasUserPosition: boolean }) {
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  return (
    <SharedCancelled
      subtitle={`${getAssetName(pool.asset)} Up or Down · ${intervalLabel}`}
      meta={formatPredictionWindow(pool.startTime, pool.endTime)}
      hasUserPosition={hasUserPosition}
    />
  );
}

/**
 * True when the wallet has any bet on this pool. We look at total bets
 * on either side that the current user contributed to — the API doesn't
 * expose per-user totals on the pool detail directly, but the bet form
 * caller already gates rendering by `pool.status`, so by the time we're
 * here we only need a yes/no answer for the cancelled copy variant.
 *
 * Best signal we have without extra plumbing: PoolDetail surfaces the
 * user's own bet via the betsByPool map upstream; the form passes that
 * down as `userBet`. If the type ever stops carrying it, defaulting to
 * `false` keeps the public-read copy (which is the safer fallback —
 * never says "your refund landed" without knowing).
 */
function hasUserBet(pool: PoolDetail): boolean {
  const anyPool = pool as PoolDetail & { userBet?: { side?: string; refunded?: boolean } | null };
  return !!anyPool.userBet;
}
