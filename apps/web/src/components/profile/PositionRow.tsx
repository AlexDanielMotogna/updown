'use client';

import { Box, Typography, Chip, Button, CircularProgress, Skeleton } from '@mui/material';
import { CheckCircle, Cancel, Refresh, AccessTime, OpenInNew } from '@mui/icons-material';
import Link from 'next/link';
import { formatUSDC, getExplorerTxUrl } from '@/lib/format';
import { getBoxImage } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AssetIcon } from '@/components';
import type { Bet } from '@/lib/api';

/**
 * Polymarket-style position row.
 *
 * Layout (desktop, grid):
 *   [Result chip] [Asset icon + market + side line]  [Stake $]  [Payout $ + delta]  [Action/Tx]
 *
 * Compresses to a card layout on mobile.
 */

interface PositionRowProps {
  bet: Bet;
  onClaim?: () => void;
  isClaiming?: boolean;
}

interface ResultInfo {
  label: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
}

function getResultInfo(bet: Bet, t: ReturnType<typeof useThemeTokens>): ResultInfo {
  const isRefund = bet.claimed && bet.payoutAmount != null && bet.payoutAmount === bet.amount;
  const isWinner = bet.isWinner === true && !isRefund;
  const isLoser = bet.isWinner === false;
  const isPayoutFailed = !!bet.payoutFailed && !bet.claimed;
  const isPendingPayout = isWinner && !bet.claimed && !isPayoutFailed && bet.pool.status === 'CLAIMABLE';
  const isActive = bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE';

  if (isPayoutFailed) {
    return { label: 'Claim manually', color: t.down, bg: withAlpha(t.down, 0.12), icon: <Refresh sx={{ fontSize: 14 }} /> };
  }
  if (isPendingPayout) {
    return { label: 'Paying soon', color: t.text.secondary, bg: t.hover.medium, icon: <AccessTime sx={{ fontSize: 14 }} /> };
  }
  if (bet.claimed && isRefund) {
    return { label: 'Refunded', color: t.info, bg: 'rgba(59,130,246,0.12)', icon: <Refresh sx={{ fontSize: 14 }} /> };
  }
  if (bet.claimed) {
    return { label: 'Paid', color: t.gain, bg: withAlpha(t.gain, 0.12), icon: <CheckCircle sx={{ fontSize: 14 }} /> };
  }
  if (isWinner) {
    return { label: 'Won', color: t.gain, bg: withAlpha(t.gain, 0.12), icon: <CheckCircle sx={{ fontSize: 14 }} /> };
  }
  if (isLoser) {
    return { label: 'Lost', color: t.down, bg: withAlpha(t.down, 0.10), icon: <Cancel sx={{ fontSize: 14 }} /> };
  }
  if (isActive) {
    return { label: 'Active', color: t.up, bg: withAlpha(t.up, 0.10), icon: <AccessTime sx={{ fontSize: 14 }} /> };
  }
  return { label: 'Pending', color: t.text.secondary, bg: t.hover.medium, icon: <AccessTime sx={{ fontSize: 14 }} /> };
}

function getMarketLabel(bet: Bet): { title: string; sideLabel: string } {
  const isSports = bet.pool.poolType === 'SPORTS';
  const isPM = bet.pool.league?.startsWith('PM_');
  const title = isPM
    ? (bet.pool.homeTeam || bet.pool.asset).slice(0, 80)
    : isSports
    ? `${bet.pool.homeTeam || ''} vs ${bet.pool.awayTeam || ''}`.trim()
    : `${bet.pool.asset}/USD`;
  const sideLabel = isPM
    ? (bet.side === 'UP' ? 'Yes' : 'No')
    : isSports
    ? (bet.side === 'UP' ? (bet.pool.homeTeam || 'Home') : bet.side === 'DOWN' ? (bet.pool.awayTeam || 'Away') : 'Draw')
    : bet.side;
  return { title, sideLabel };
}

export function PositionRow({ bet, onClaim, isClaiming }: PositionRowProps) {
  const t = useThemeTokens();
  const result = getResultInfo(bet, t);
  const { title, sideLabel } = getMarketLabel(bet);
  const isPayoutFailed = !!bet.payoutFailed && !bet.claimed;
  const isPendingPayout = bet.isWinner === true && !bet.claimed && !isPayoutFailed && bet.pool.status === 'CLAIMABLE';
  const showClaim = isPayoutFailed; // manual fallback when auto-payout exhausted
  const isSports = bet.pool.poolType === 'SPORTS';
  const isPM = bet.pool.league?.startsWith('PM_');
  const sideColor = bet.side === 'UP' ? t.up : bet.side === 'DOWN' ? t.down : t.draw;
  const boxImageUrl = !isSports ? getBoxImage(bet.pool.asset, bet.pool.interval) : null;
  const teamCrest = isSports && !isPM ? bet.pool.homeTeamCrest : null;

  const payoutNum = bet.payoutAmount ? Number(bet.payoutAmount) : 0;
  const stakeNum = Number(bet.amount);
  const profitNum = payoutNum - stakeNum;
  const profitPct = stakeNum > 0 ? (profitNum / stakeNum) * 100 : 0;
  const isRefundRow = bet.claimed && bet.payoutAmount != null && bet.payoutAmount === bet.amount;
  // Don't show "+\$0.00 (0%)" on refunds — the chip already says Refunded
  // and the delta is mathematically meaningless (you got your stake back).
  const showProfit = bet.claimed && payoutNum > 0 && !isRefundRow && bet.isWinner === true;

  // For active pools (no winner yet) show the "potential payout at current
  // odds" — straight parimutuel math, minus an approximate 5% protocol fee.
  // Re-renders whenever the bet/pool query refreshes, so the number breathes
  // with the pool's live totals.
  const totalUp = Number(bet.pool.totalUp ?? 0);
  const totalDown = Number(bet.pool.totalDown ?? 0);
  const totalDraw = Number(bet.pool.totalDraw ?? 0);
  const totalPool = totalUp + totalDown + totalDraw;
  const sideTotal = bet.side === 'UP' ? totalUp : bet.side === 'DOWN' ? totalDown : totalDraw;
  const isUnsettled = !bet.payoutAmount && (bet.pool.status === 'JOINING' || bet.pool.status === 'ACTIVE');
  const potentialPayoutNum =
    isUnsettled && sideTotal > 0 && totalPool > 0
      ? ((stakeNum / sideTotal) * totalPool) * 0.95
      : 0;
  const potentialDelta = potentialPayoutNum - stakeNum;
  const potentialPct = stakeNum > 0 ? (potentialDelta / stakeNum) * 100 : 0;

  const poolLink = isSports ? `/match/${bet.pool.id}` : `/pool/${bet.pool.id}`;

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
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

      {/* Market: icon + title + side */}
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
            <AssetIcon asset={bet.pool.asset} size={22} />
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
            <Box sx={{
              fontSize: '0.7rem', fontWeight: 700, color: sideColor,
              bgcolor: withAlpha(sideColor, 0.12), px: 0.75, py: 0.1, borderRadius: '3px',
            }}>
              {sideLabel}
            </Box>
            <Typography sx={{ fontSize: '0.7rem', color: t.text.tertiary }}>
              · {formatUSDC(bet.amount, { min: 2 })} stake
            </Typography>
          </Box>
        </Box>
      </Box>

      {/* Stake / Total negociado — header above carries the label */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
          {formatUSDC(bet.amount, { min: 2 })}
        </Typography>
      </Box>

      {/* Payout — header above carries the label.
          Settled = on-chain amount + profit delta.
          Unsettled = potential payout at current pool odds (parimutuel math).
          Pending auto-payout = "Paying soon…" italic. */}
      <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
        {bet.payoutAmount ? (
          <>
            <Typography sx={{ fontSize: '0.95rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
              {formatUSDC(bet.payoutAmount, { min: 2 })}
            </Typography>
            {showProfit && (
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: profitNum >= 0 ? t.gain : t.down, fontVariantNumeric: 'tabular-nums' }}>
                {profitNum >= 0 ? '+' : ''}{formatUSDC(String(Math.round(profitNum)), { min: 2 })} ({profitPct.toFixed(2)}%)
              </Typography>
            )}
          </>
        ) : isPendingPayout ? (
          <Typography sx={{ fontSize: '0.78rem', color: t.text.tertiary, fontStyle: 'italic' }}>
            Paying soon…
          </Typography>
        ) : isUnsettled && potentialPayoutNum > 0 ? (
          <>
            <Typography
              sx={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: t.text.secondary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              ~{formatUSDC(String(Math.round(potentialPayoutNum)), { min: 2 })}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, lineHeight: 1.2 }}>
              if {bet.side === 'UP' ? 'Up' : bet.side === 'DOWN' ? 'Down' : 'Draw'} wins · {potentialDelta >= 0 ? '+' : ''}{potentialPct.toFixed(0)}%
            </Typography>
          </>
        ) : (
          <Typography sx={{ fontSize: '0.85rem', color: t.text.quaternary }}>—</Typography>
        )}
      </Box>

      {/* Action / Tx */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
        {showClaim && onClaim && (
          <Button
            size="small"
            onClick={onClaim}
            disabled={isClaiming}
            sx={{
              minWidth: 0, px: 1.5, py: 0.25, fontSize: '0.7rem', fontWeight: 700,
              bgcolor: t.gain, color: t.text.contrast, borderRadius: '4px', textTransform: 'none',
              '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
            }}
          >
            {isClaiming ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : 'Claim'}
          </Button>
        )}
        {bet.claimTx && (
          <Button
            component="a"
            href={getExplorerTxUrl(bet.claimTx)}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            sx={{
              minWidth: 0, p: 0.5, color: t.text.quaternary, '&:hover': { color: t.text.primary },
            }}
          >
            <OpenInNew sx={{ fontSize: 14 }} />
          </Button>
        )}
      </Box>
    </Box>
  );
}

export function PositionRowSkeleton() {
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
