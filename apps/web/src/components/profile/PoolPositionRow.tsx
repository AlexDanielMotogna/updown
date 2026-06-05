'use client';

import { useState } from 'react';
import { Box, Typography, Chip, Button, CircularProgress, Skeleton, Collapse } from '@mui/material';
import {
  CheckCircle, Cancel, Refresh, AccessTime, OpenInNew, ExpandMore,
  Gavel, Public, TheaterComedy, AccountBalance, TrendingUp,
} from '@mui/icons-material';
import Link from 'next/link';
import { formatUSDC, getExplorerTxUrl, formatPredictionWindow } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AssetIcon } from '@/components';
import type { Bet } from '@/lib/api';

// Polymarket category icons + colours - same mapping the legacy BetRow used,
// kept local so PM pools render with their identity icon (a question-shaped
// PM_POLITICS row falls through to AssetIcon otherwise and shows nothing).
const PM_ICONS: Record<string, React.ReactNode> = {
  PM_POLITICS: <Gavel sx={{ fontSize: 20 }} />,
  PM_GEO: <Public sx={{ fontSize: 20 }} />,
  PM_CULTURE: <TheaterComedy sx={{ fontSize: 20 }} />,
  PM_FINANCE: <AccountBalance sx={{ fontSize: 20 }} />,
};
const PM_COLOR_KEYS: Record<string, 'politics' | 'geopolitics' | 'culture' | 'finance'> = {
  PM_POLITICS: 'politics', PM_GEO: 'geopolitics', PM_CULTURE: 'culture', PM_FINANCE: 'finance',
};

/**
 * One expandable row per pool, not per bet. Because a wallet can hold bets on
 * BOTH sides of a market (you can predict every outcome), "won / lost" stops
 * being meaningful at the pool level — you can win one side and lose another
 * at once. So the row headline is a NET figure:
 *
 *   • Active pools  → a scenario split ("If Up wins +$5.20 · If Down −$3.10"),
 *     the honest representation when there's no secondary market to mark to.
 *   • Closed pools  → a net P&L chip (Net +$7.33 / Net −$2.67).
 *
 * The dropdown breaks the position down per side (stake, payout / potential,
 * per-side outcome), which is the only place a per-side win/lose is shown
 * because there it's unambiguous.
 */

export interface PoolPosition {
  poolId: string;
  pool: Bet['pool'];
  bets: Bet[];
}

interface PoolPositionRowProps {
  position: PoolPosition;
  onClaim?: (poolId: string, betId: string) => void;
  isClaiming?: boolean;
  claimingBetId?: string | null;
}

const FEE_FACTOR = 0.95; // matches the 5% payout fee used elsewhere in the UI
const SIDE_ORDER: Record<string, number> = { UP: 0, DOWN: 1, DRAW: 2 };

function sideLabel(side: Bet['side'], pool: Bet['pool']): string {
  const isPM = pool.league?.startsWith('PM_');
  const isSports = pool.poolType === 'SPORTS';
  if (isPM) return side === 'UP' ? 'Yes' : 'No';
  if (isSports) {
    if (side === 'UP') return pool.homeTeam || 'Home';
    if (side === 'DOWN') return pool.awayTeam || 'Away';
    return 'Draw';
  }
  return side === 'UP' ? 'Up' : side === 'DOWN' ? 'Down' : 'Draw';
}

function sideColor(side: Bet['side'], t: ReturnType<typeof useThemeTokens>): string {
  return side === 'UP' ? t.up : side === 'DOWN' ? t.down : t.draw;
}

/** Format a micro-USDC number (may be fractional) as a $ string. */
function fmtMicro(n: number): string {
  return formatUSDC(String(Math.round(n)), { min: 2 });
}
/** Signed $ string: +$5.20 / -$3.10 */
function fmtSigned(n: number): string {
  return `${n >= 0 ? '+' : '-'}${fmtMicro(Math.abs(n))}`;
}

export function PoolPositionRow({ position, onClaim, isClaiming, claimingBetId }: PoolPositionRowProps) {
  const t = useThemeTokens();
  const [expanded, setExpanded] = useState(false);
  const { bets, pool } = position;

  const isActive = pool.status === 'JOINING' || pool.status === 'ACTIVE' || pool.status === 'UPCOMING';

  // ── Totals ────────────────────────────────────────────────────────────
  const totalStake = bets.reduce((a, b) => a + Number(b.amount), 0);
  const totalPayout = bets.reduce((a, b) => a + (b.payoutAmount ? Number(b.payoutAmount) : 0), 0);
  const netClosed = totalPayout - totalStake;
  const netPct = totalStake > 0 ? (netClosed / totalStake) * 100 : 0;

  // ── Pool weight / stake context for the weighted projection ────────────
  const totalUp = Number(pool.totalUp ?? 0);
  const totalDown = Number(pool.totalDown ?? 0);
  const totalDraw = Number(pool.totalDraw ?? 0);
  const totalPool = totalUp + totalDown + totalDraw;
  const weightedUp = Number(pool.weightedUp ?? 0);
  const weightedDown = Number(pool.weightedDown ?? 0);
  const weightedDraw = Number(pool.weightedDraw ?? 0);
  const sideStake = (s: Bet['side']) => (s === 'UP' ? totalUp : s === 'DOWN' ? totalDown : totalDraw);
  const sideWeight = (s: Bet['side']) => (s === 'UP' ? weightedUp : s === 'DOWN' ? weightedDown : weightedDraw);

  // Gross payout for a bet IF its side wins. Time-weighted when we have the
  // weight data, plain parimutuel otherwise (continuous at uniform weights).
  const grossIfWin = (b: Bet): number => {
    const stake = Number(b.amount);
    const st = sideStake(b.side);
    if (st <= 0) return stake;
    const sw = sideWeight(b.side);
    const myW = b.weight != null ? Number(b.weight) : null;
    const losing = totalPool - st;
    const gross = myW != null && sw > 0
      ? stake + (myW / sw) * losing
      : (stake / st) * totalPool;
    return gross * FEE_FACTOR;
  };

  // Scenario split (active): for each side the user holds, the NET if that
  // side wins (its bets pay out, the others are lost). Ordered Up→Down→Draw
  // so the rows read consistently regardless of bet order.
  const userSides = [...new Set(bets.map(b => b.side))].sort((a, b) => SIDE_ORDER[a] - SIDE_ORDER[b]);
  const scenarios = userSides.map(side => {
    const winSidePayout = bets.filter(b => b.side === side).reduce((a, b) => a + grossIfWin(b), 0);
    return { side, net: winSidePayout - totalStake };
  });
  // Bets ordered the same way for the dropdown.
  const orderedBets = [...bets].sort((a, b) => SIDE_ORDER[a.side] - SIDE_ORDER[b.side]);
  const isHedged = userSides.length > 1;

  // ── Special states (still relevant; net replaces only won/lost) ────────
  const allRefunded = bets.length > 0 && bets.every(b =>
    b.claimed && b.payoutAmount != null && b.payoutAmount === b.amount,
  );
  const anyFailed = bets.some(b => !!b.payoutFailed && !b.claimed);
  const anyPending = bets.some(b =>
    b.isWinner === true && !b.claimed && !b.payoutFailed && pool.status === 'CLAIMABLE',
  );
  const failedBet = bets.find(b => !!b.payoutFailed && !b.claimed);

  // ── Market identity ────────────────────────────────────────────────────
  const isSports = pool.poolType === 'SPORTS';
  const isPM = pool.league?.startsWith('PM_');
  const marketImage = isSports ? pool.homeTeamCrest : null;
  const pmColorKey = isPM ? PM_COLOR_KEYS[pool.league || ''] : undefined;
  const pmColor = pmColorKey ? t.categoryColors[pmColorKey] : t.prediction;
  const pmIcon = isPM ? (PM_ICONS[pool.league || ''] ?? <TrendingUp sx={{ fontSize: 20 }} />) : null;
  const title = isPM
    ? (pool.homeTeam || pool.asset).slice(0, 80)
    : isSports
      ? `${pool.homeTeam || ''} vs ${pool.awayTeam || ''}`.trim()
      : `${pool.asset}/USD`;
  const poolLink = isSports ? `/match/${pool.id}` : `/pool/${pool.id}`;
  const cryptoWindow = !isSports && !isPM
    ? formatPredictionWindow(pool.startTime, pool.endTime)
    : null;
  const winnerLabel = pool.winner ? sideLabel(pool.winner, pool) : null;

  // Tx to surface: prefer a claim tx, else the latest deposit.
  const sortedByDate = [...bets].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const txBet = sortedByDate.find(b => b.claimTx) ?? sortedByDate[0];
  const txLink = txBet?.claimTx
    ? { label: 'Payout tx', sig: txBet.claimTx }
    : txBet?.depositTx
      ? { label: 'Deposit tx', sig: txBet.depositTx }
      : null;

  // ── Headline (closed): net chip, unless a special state pre-empts it ───
  let headChip: { label: string; color: string; bg: string; icon: React.ReactNode } | null = null;
  if (!isActive) {
    if (anyFailed) {
      headChip = { label: 'Claim manually', color: t.down, bg: withAlpha(t.down, 0.12), icon: <Refresh sx={{ fontSize: 14 }} /> };
    } else if (anyPending) {
      headChip = { label: 'Paying soon', color: t.text.secondary, bg: t.hover.medium, icon: <AccessTime sx={{ fontSize: 14 }} /> };
    } else if (allRefunded) {
      headChip = { label: 'Refunded', color: t.info, bg: 'rgba(59,130,246,0.12)', icon: <Refresh sx={{ fontSize: 14 }} /> };
    } else {
      const pos = netClosed >= 0;
      headChip = {
        label: `Net ${fmtSigned(netClosed)}`,
        color: pos ? t.gain : t.down,
        bg: withAlpha(pos ? t.gain : t.down, 0.12),
        icon: pos ? <CheckCircle sx={{ fontSize: 14 }} /> : <Cancel sx={{ fontSize: 14 }} />,
      };
    }
  }

  const stopToggle = (e: React.MouseEvent) => e.stopPropagation();

  // ── Cells ──────────────────────────────────────────────────────────────
  const headChipEl = headChip && (
    <Chip
      icon={headChip.icon as React.ReactElement}
      label={headChip.label}
      size="small"
      sx={{
        height: 22, fontSize: '0.72rem', fontWeight: 800,
        bgcolor: headChip.bg, color: headChip.color, borderRadius: '4px',
        '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
        '& .MuiChip-label': { px: 0.75 },
      }}
    />
  );

  const marketCell = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
      <Box sx={{
        width: 40, height: 40, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: isPM && !marketImage ? withAlpha(pmColor, 0.12) : t.hover.medium,
        color: isPM ? pmColor : 'inherit',
        borderRadius: '6px', overflow: 'hidden',
      }}>
        {marketImage ? (
          <Box component="img" src={marketImage} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : isPM ? pmIcon : <AssetIcon asset={pool.asset} size={24} />}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Link href={poolLink} style={{ textDecoration: 'none', color: 'inherit' }} onClick={stopToggle}>
          <Typography sx={{
            fontWeight: 700, fontSize: '0.9rem', color: t.text.primary,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            '&:hover': { color: t.text.bright },
          }}>
            {title}
          </Typography>
        </Link>
        {cryptoWindow && (
          <Typography suppressHydrationWarning sx={{
            fontSize: '0.68rem', fontWeight: 500, color: t.text.tertiary, mt: 0.15,
            fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {cryptoWindow}
          </Typography>
        )}
        <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.quaternary, mt: 0.15 }}>
          {bets.length} position{bets.length > 1 ? 's' : ''}
          {!isActive && winnerLabel ? ` · winner: ${winnerLabel}` : ''}
        </Typography>
      </Box>
    </Box>
  );

  const stakeCell = (
    <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
      {fmtMicro(totalStake)}
    </Typography>
  );

  // Active headline: the scenario split — net P&L per possible winning side.
  const scenarioCell = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2, alignItems: 'flex-end' }}>
      {scenarios.map(s => (
        <Box key={s.side} sx={{ display: 'flex', alignItems: 'baseline', gap: 0.6, justifyContent: 'flex-end' }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: t.text.quaternary, whiteSpace: 'nowrap' }}>
            {sideLabel(s.side, pool)} wins
          </Typography>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: s.net >= 0 ? t.gain : t.down, fontVariantNumeric: 'tabular-nums', minWidth: 64, textAlign: 'right' }}>
            {fmtSigned(s.net)}
          </Typography>
        </Box>
      ))}
      {scenarios.length === 0 && <Typography sx={{ color: t.text.quaternary }}>-</Typography>}
    </Box>
  );

  // Closed headline payout: total payout + net delta.
  const payoutCell = (
    <Box sx={{ textAlign: 'right' }}>
      {anyPending ? (
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.secondary, fontStyle: 'italic' }}>
          Paying soon…
        </Typography>
      ) : totalPayout > 0 ? (
        <>
          <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
            {fmtMicro(totalPayout)}
          </Typography>
          <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: netClosed >= 0 ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
            {fmtSigned(netClosed)} ({netPct.toFixed(1)}%)
          </Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.secondary }}>-</Typography>
      )}
    </Box>
  );

  const claimBtn = anyFailed && failedBet && onClaim && (
    <Button
      size="small"
      onClick={(e) => { stopToggle(e); onClaim(pool.id, failedBet.id); }}
      disabled={isClaiming && claimingBetId === failedBet.id}
      sx={{
        minWidth: 0, px: 1.5, py: 0.25, fontSize: '0.72rem', fontWeight: 800,
        bgcolor: t.gain, color: t.text.contrast, borderRadius: '4px', textTransform: 'none',
        '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
      }}
    >
      {isClaiming && claimingBetId === failedBet.id ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : 'Claim'}
    </Button>
  );

  const chevron = (
    <ExpandMore sx={{
      fontSize: 22, color: t.text.secondary, flexShrink: 0,
      transition: 'transform 0.18s ease', transform: expanded ? 'rotate(180deg)' : 'none',
    }} />
  );

  // ── Dropdown: per-side breakdown ───────────────────────────────────────
  const dropdown = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, px: { xs: 1.5, md: 2 }, pb: 1.5, pt: 1, borderTop: `1px solid ${t.border.subtle}` }}>
      {/* Per-side column labels so the numbers are self-explanatory. */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Side · stake
        </Typography>
        <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {isActive ? 'To win (gross)' : 'Result'}
        </Typography>
      </Box>
      {orderedBets.map(b => {
        const stake = Number(b.amount);
        const potential = grossIfWin(b);
        const won = b.isWinner === true;
        const lost = b.isWinner === false;
        const paid = b.payoutAmount ? Number(b.payoutAmount) : null;
        return (
          <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{
                fontSize: '0.72rem', fontWeight: 800, color: sideColor(b.side, t),
                bgcolor: withAlpha(sideColor(b.side, t), 0.15), px: 0.8, py: 0.2, borderRadius: '3px',
              }}>
                {sideLabel(b.side, pool)}
              </Box>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
                {fmtMicro(stake)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, textAlign: 'right' }}>
              {isActive ? (
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                  {fmtMicro(potential)}
                </Typography>
              ) : (
                <>
                  {paid != null && (
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                      {fmtMicro(paid)}
                    </Typography>
                  )}
                  {won && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: t.gain }}>
                      <CheckCircle sx={{ fontSize: 13 }} />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800 }}>Won</Typography>
                    </Box>
                  )}
                  {lost && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3, color: t.down }}>
                      <Cancel sx={{ fontSize: 13 }} />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 800 }}>Lost</Typography>
                    </Box>
                  )}
                </>
              )}
            </Box>
          </Box>
        );
      })}

      {isActive && isHedged && (
        <Typography sx={{ fontSize: '0.66rem', fontWeight: 500, color: t.text.quaternary, fontStyle: 'italic', mt: 0.25 }}>
          Only one side can win — the headline shows your net for each outcome.
        </Typography>
      )}

      {(txLink || claimBtn) && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1, mt: 0.25 }}>
          {claimBtn}
          {txLink && (
            <Button
              component="a"
              href={getExplorerTxUrl(txLink.sig)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={stopToggle}
              size="small"
              startIcon={<OpenInNew sx={{ fontSize: 14 }} />}
              sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.7rem', fontWeight: 700, color: t.text.secondary, textTransform: 'none', '&:hover': { color: t.text.primary } }}
            >
              {txLink.label}
            </Button>
          )}
        </Box>
      )}
    </Box>
  );

  return (
    <Box sx={{
      bgcolor: t.bg.surfaceAlt,
      border: `1px solid ${t.border.subtle}`,
      borderRadius: 1, mb: 1,
      transition: 'background 0.12s ease, border-color 0.12s ease',
      '&:hover': { background: t.hover.default, borderColor: t.border.medium },
    }}>
      {/* ── Desktop collapsed header ── */}
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: isActive ? '1fr 120px 200px 40px' : '150px 1fr 110px 150px 40px',
          alignItems: 'center', gap: 2, px: 2, py: 1.5, cursor: 'pointer',
        }}
      >
        {!isActive && <Box sx={{ display: 'flex', alignItems: 'center' }}>{headChipEl}</Box>}
        {marketCell}
        {stakeCell}
        {isActive ? scenarioCell : payoutCell}
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>{chevron}</Box>
      </Box>

      {/* ── Mobile collapsed header ── */}
      <Box
        onClick={() => setExpanded(e => !e)}
        sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.5, py: 1.5, cursor: 'pointer' }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, minWidth: 0, flex: 1 }}>
          {!isActive && headChipEl && <Box>{headChipEl}</Box>}
          {marketCell}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mt: 0.25 }}>
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: t.text.secondary }}>
              Stake {fmtMicro(totalStake)}
            </Typography>
            {isActive
              ? scenarios.map(s => (
                  <Typography key={s.side} sx={{ fontSize: '0.74rem', fontWeight: 700, color: s.net >= 0 ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                    {sideLabel(s.side, pool)} {fmtSigned(s.net)}
                  </Typography>
                ))
              : totalPayout > 0 && (
                  <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: netClosed >= 0 ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                    {fmtSigned(netClosed)} ({netPct.toFixed(1)}%)
                  </Typography>
                )}
          </Box>
        </Box>
        {chevron}
      </Box>

      <Collapse in={expanded} timeout={180} unmountOnExit>{dropdown}</Collapse>
    </Box>
  );
}

export function PoolPositionRowSkeleton() {
  const t = useThemeTokens();
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '150px 1fr 110px 150px 40px' },
      alignItems: 'center', gap: 2, px: 2, py: 1.5,
      bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, mb: 1,
    }}>
      <Skeleton variant="rounded" width={80} height={22} sx={{ bgcolor: t.hover.default, borderRadius: '4px' }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Skeleton variant="rounded" width={36} height={36} sx={{ bgcolor: t.hover.default, borderRadius: '6px' }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="60%" height={18} sx={{ bgcolor: t.border.default }} />
          <Skeleton variant="text" width="35%" height={14} sx={{ bgcolor: t.hover.default }} />
        </Box>
      </Box>
      <Skeleton variant="text" width={60} height={20} sx={{ bgcolor: t.border.default, ml: 'auto' }} />
      <Skeleton variant="text" width={80} height={20} sx={{ bgcolor: t.border.default, ml: 'auto' }} />
      <Skeleton variant="rounded" width={32} height={28} sx={{ bgcolor: t.hover.default, ml: 'auto' }} />
    </Box>
  );
}
