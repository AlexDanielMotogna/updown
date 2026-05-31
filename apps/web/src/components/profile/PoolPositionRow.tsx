'use client';

import { Box, Typography, Chip, Button, CircularProgress, Skeleton, Tooltip } from '@mui/material';
import { CheckCircle, Cancel, Refresh, AccessTime, OpenInNew } from '@mui/icons-material';
import Link from 'next/link';
import { formatUSDC, getExplorerTxUrl } from '@/lib/format';
import { getBoxImage } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AssetIcon } from '@/components';
import type { Bet } from '@/lib/api';

/**
 * One row per pool, not per bet. When a wallet holds multiple bets on the
 * same pool (hedging across sides), they collapse into a single position
 * with totals + a short sides breakdown ("Up $50 · Down $100"). This keeps
 * the table aligned with how the user thinks about their exposure and
 * removes the confusion of two rows for what is really one position.
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

interface ResultInfo {
  label: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
}

function deriveStatus(position: PoolPosition, t: ReturnType<typeof useThemeTokens>): {
  result: ResultInfo;
  isAllRefunded: boolean;
  isPending: boolean;
  isPayoutFailed: boolean;
  isActive: boolean;
  hasMixedOutcome: boolean;
} {
  const { bets, pool } = position;
  const stakes = bets.map(b => Number(b.amount));
  const totalStake = stakes.reduce((a, b) => a + b, 0);
  const payouts = bets.map(b => b.payoutAmount ? Number(b.payoutAmount) : 0);
  const totalPayout = payouts.reduce((a, b) => a + b, 0);

  // Per-bet refund check (payout == stake AND claimed). When ALL of a wallet's
  // bets on a pool sum back to exactly the stake total AND each row is a
  // refund, it's a clean refund position. This catches both the single-bettor
  // refund and the hedger refund where the scheduler picked one side as the
  // synthetic winner.
  const allRefunded = bets.length > 0 && bets.every(b =>
    b.claimed && b.payoutAmount != null && b.payoutAmount === b.amount
  );

  const anyFailed = bets.some(b => !!b.payoutFailed && !b.claimed);
  const anyPending = bets.some(b =>
    b.isWinner === true && !b.claimed && !b.payoutFailed && pool.status === 'CLAIMABLE'
  );
  const isActive = pool.status === 'JOINING' || pool.status === 'ACTIVE' || pool.status === 'UPCOMING';
  const anyClaimed = bets.some(b => b.claimed);
  const winningBets = bets.filter(b => b.isWinner === true);
  const losingBets = bets.filter(b => b.isWinner === false);
  const hasMixedOutcome = winningBets.length > 0 && losingBets.length > 0;

  let result: ResultInfo;
  if (anyFailed) {
    result = { label: 'Claim manually', color: t.down, bg: withAlpha(t.down, 0.12), icon: <Refresh sx={{ fontSize: 14 }} /> };
  } else if (anyPending) {
    result = { label: 'Paying soon', color: t.text.secondary, bg: t.hover.medium, icon: <AccessTime sx={{ fontSize: 14 }} /> };
  } else if (allRefunded) {
    result = { label: 'Refunded', color: t.info, bg: 'rgba(59,130,246,0.12)', icon: <Refresh sx={{ fontSize: 14 }} /> };
  } else if (anyClaimed && totalPayout > totalStake) {
    result = { label: 'Won', color: t.gain, bg: withAlpha(t.gain, 0.12), icon: <CheckCircle sx={{ fontSize: 14 }} /> };
  } else if (anyClaimed && totalPayout < totalStake) {
    // Hedged position where the loss exceeded the win, or a parimutuel "won"
    // that mathematically paid less than stake (rare but possible).
    result = { label: 'Lost', color: t.down, bg: withAlpha(t.down, 0.10), icon: <Cancel sx={{ fontSize: 14 }} /> };
  } else if (pool.winner && losingBets.length === bets.length) {
    result = { label: 'Lost', color: t.down, bg: withAlpha(t.down, 0.10), icon: <Cancel sx={{ fontSize: 14 }} /> };
  } else if (isActive) {
    result = { label: 'Active', color: t.up, bg: withAlpha(t.up, 0.10), icon: <AccessTime sx={{ fontSize: 14 }} /> };
  } else {
    result = { label: 'Pending', color: t.text.secondary, bg: t.hover.medium, icon: <AccessTime sx={{ fontSize: 14 }} /> };
  }

  return {
    result,
    isAllRefunded: allRefunded,
    isPending: anyPending,
    isPayoutFailed: anyFailed,
    isActive: isActive && !allRefunded,
    hasMixedOutcome,
  };
}

function sideName(bet: Bet): string {
  const isPM = bet.pool.league?.startsWith('PM_');
  const isSports = bet.pool.poolType === 'SPORTS';
  if (isPM) return bet.side === 'UP' ? 'Yes' : 'No';
  if (isSports) {
    if (bet.side === 'UP') return bet.pool.homeTeam || 'Home';
    if (bet.side === 'DOWN') return bet.pool.awayTeam || 'Away';
    return 'Draw';
  }
  // Crypto: Up / Down
  return bet.side === 'UP' ? 'Up' : bet.side === 'DOWN' ? 'Down' : 'Draw';
}

function sideColor(side: Bet['side'], t: ReturnType<typeof useThemeTokens>): string {
  return side === 'UP' ? t.up : side === 'DOWN' ? t.down : t.draw;
}

export function PoolPositionRow({ position, onClaim, isClaiming, claimingBetId }: PoolPositionRowProps) {
  const t = useThemeTokens();
  const { bets, pool } = position;

  const totalStake = bets.reduce((a, b) => a + BigInt(b.amount), 0n);
  const totalPayout = bets.reduce((a, b) => a + (b.payoutAmount ? BigInt(b.payoutAmount) : 0n), 0n);

  const totalStakeNum = Number(totalStake);
  const totalPayoutNum = Number(totalPayout);
  const profitNum = totalPayoutNum - totalStakeNum;
  const profitPct = totalStakeNum > 0 ? (profitNum / totalStakeNum) * 100 : 0;

  const { result, isAllRefunded, isPending, isPayoutFailed, isActive, hasMixedOutcome } = deriveStatus(position, t);

  // Potential payout for active positions — sum across the user's bet sides.
  const totalUp = Number(pool.totalUp ?? 0);
  const totalDown = Number(pool.totalDown ?? 0);
  const totalDraw = Number(pool.totalDraw ?? 0);
  const totalPool = totalUp + totalDown + totalDraw;
  const potentialPayoutNum =
    isActive && totalPool > 0
      ? bets.reduce((acc, b) => {
          const stake = Number(b.amount);
          const sideTotal = b.side === 'UP' ? totalUp : b.side === 'DOWN' ? totalDown : totalDraw;
          if (sideTotal <= 0) return acc;
          return acc + (stake / sideTotal) * totalPool * 0.95;
        }, 0)
      : 0;
  const potentialDelta = potentialPayoutNum - totalStakeNum;
  const potentialPct = totalStakeNum > 0 ? (potentialDelta / totalStakeNum) * 100 : 0;

  const showProfitDelta = bets.some(b => b.claimed) && !isAllRefunded && totalPayoutNum > 0;

  const isSports = pool.poolType === 'SPORTS';
  const isPM = pool.league?.startsWith('PM_');
  const boxImageUrl = !isSports ? getBoxImage(pool.asset, pool.interval) : null;
  const teamCrest = isSports && !isPM ? pool.homeTeamCrest : null;
  const title = isPM
    ? (pool.homeTeam || pool.asset).slice(0, 80)
    : isSports
    ? `${pool.homeTeam || ''} vs ${pool.awayTeam || ''}`.trim()
    : `${pool.asset}/USD`;
  const poolLink = isSports ? `/match/${pool.id}` : `/pool/${pool.id}`;

  // Pick the bet whose tx link to surface — prefer the claim of the last
  // claimed bet, falling back to the deposit of the largest stake.
  const sortedByClaim = [...bets].sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const txBet = sortedByClaim.find(b => b.claimTx) ?? sortedByClaim[0];
  const txLink = txBet?.claimTx
    ? { label: 'Payout tx', sig: txBet.claimTx }
    : txBet?.depositTx
    ? { label: 'Deposit tx', sig: txBet.depositTx }
    : null;

  // For the manual fallback button: target the first failed bet.
  const failedBet = bets.find(b => !!b.payoutFailed && !b.claimed);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '110px 1fr 130px 180px 100px' },
        alignItems: 'center',
        gap: { xs: 1, md: 2 },
        px: { xs: 1.5, md: 2 },
        py: 1.5,
        bgcolor: t.bg.surfaceAlt,
        border: `1px solid ${t.border.subtle}`,
        borderRadius: 1,
        mb: 1,
        transition: 'background 0.12s ease, border-color 0.12s ease',
        '&:hover': { background: t.hover.default, borderColor: t.border.medium },
      }}
    >
      {/* Result chip */}
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Chip
          icon={result.icon as React.ReactElement}
          label={result.label}
          size="small"
          sx={{
            height: 22,
            fontSize: '0.7rem',
            fontWeight: 700,
            bgcolor: result.bg,
            color: result.color,
            borderRadius: '4px',
            '& .MuiChip-icon': { color: 'inherit', ml: 0.5 },
            '& .MuiChip-label': { px: 0.75 },
          }}
        />
      </Box>

      {/* Market: icon + title + sides breakdown (no stake repetition) */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <Box
          sx={{
            width: 36, height: 36, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: t.hover.medium, borderRadius: '6px', overflow: 'hidden',
          }}
        >
          {boxImageUrl ? (
            <Box component="img" src={boxImageUrl} alt="" sx={{ width: '90%', height: '90%', objectFit: 'contain' }} />
          ) : teamCrest ? (
            <Box component="img" src={teamCrest} alt="" sx={{ width: '88%', height: '88%', objectFit: 'contain' }} />
          ) : (
            <AssetIcon asset={pool.asset} size={22} />
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Link href={poolLink} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography sx={{
              fontWeight: 600, fontSize: '0.85rem', color: t.text.primary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              '&:hover': { color: t.text.bright },
            }}>
              {title}
            </Typography>
          </Link>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
            {bets.map((b, i) => (
              <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                {i > 0 && <Box sx={{ color: t.text.quaternary, fontSize: '0.6rem' }}>·</Box>}
                <Box sx={{
                  fontSize: '0.68rem', fontWeight: 700, color: sideColor(b.side, t),
                  bgcolor: withAlpha(sideColor(b.side, t), 0.12), px: 0.6, py: 0.05, borderRadius: '3px',
                }}>
                  {sideName(b)}
                </Box>
                <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary }}>
                  {formatUSDC(b.amount, { min: 2 })}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Stake (total across sides) */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
          {formatUSDC(totalStake.toString(), { min: 2 })}
        </Typography>
        {bets.length > 1 && (
          <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary }}>
            {bets.length} bets
          </Typography>
        )}
      </Box>

      {/* Payout — total across sides (settled), or aggregate potential (active) */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        {totalPayoutNum > 0 ? (
          <>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
              {formatUSDC(totalPayout.toString(), { min: 2 })}
            </Typography>
            {showProfitDelta && (
              <Typography sx={{
                fontSize: '0.72rem', fontWeight: 600,
                color: profitNum >= 0 ? t.gain : t.down,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {profitNum >= 0 ? '+' : ''}{formatUSDC(String(Math.round(profitNum)), { min: 2 })} ({profitPct.toFixed(2)}%)
              </Typography>
            )}
          </>
        ) : isPending ? (
          <Typography sx={{ fontSize: '0.78rem', color: t.text.tertiary, fontStyle: 'italic' }}>
            Paying soon…
          </Typography>
        ) : isActive && potentialPayoutNum > 0 ? (
          <>
            <Typography sx={{
              fontSize: '0.95rem', fontWeight: 700, color: t.text.secondary,
              fontVariantNumeric: 'tabular-nums',
            }}>
              ~{formatUSDC(String(Math.round(potentialPayoutNum)), { min: 2 })}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, lineHeight: 1.2 }}>
              potential · {potentialDelta >= 0 ? '+' : ''}{potentialPct.toFixed(0)}%
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: t.text.quaternary }}>—</Typography>
        )}
      </Box>

      {/* Action / Tx */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        {isPayoutFailed && failedBet && onClaim && (
          <Button
            size="small"
            onClick={() => onClaim(pool.id, failedBet.id)}
            disabled={isClaiming && claimingBetId === failedBet.id}
            sx={{
              minWidth: 0, px: 1.5, py: 0.25, fontSize: '0.7rem', fontWeight: 700,
              bgcolor: t.gain, color: t.text.contrast, borderRadius: '4px', textTransform: 'none',
              '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
            }}
          >
            {isClaiming && claimingBetId === failedBet.id ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : 'Claim'}
          </Button>
        )}
        {txLink && (
          <Tooltip title={txLink.label} arrow>
            <Button
              component="a"
              href={getExplorerTxUrl(txLink.sig)}
              target="_blank"
              rel="noopener noreferrer"
              size="small"
              sx={{
                minWidth: 0, p: 0.5, color: t.text.quaternary, '&:hover': { color: t.text.primary },
              }}
            >
              <OpenInNew sx={{ fontSize: 14 }} />
            </Button>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
}

export function PoolPositionRowSkeleton() {
  const t = useThemeTokens();
  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '110px 1fr 130px 180px 100px' },
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
