'use client';

import { useMemo } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { ArrowUpward, ArrowDownward, Refresh } from '@mui/icons-material';
import Link from 'next/link';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { formatUSDC, getExplorerTxUrl } from '@/lib/format';
import { getBoxImage } from '@/lib/constants';
import { AssetIcon, EmptyMessage } from '@/components';
import { OpenInNew } from '@mui/icons-material';
import type { Bet } from '@/lib/api';
import { kindOf } from '@/lib/poolKind';

type ActivityType = 'BET' | 'PAID' | 'REFUND';

interface ActivityEntry {
  id: string;
  type: ActivityType;
  betId: string;
  bet: Bet;
  timestamp: string;
  amountRaw: string;
  txSignature: string | null;
}

interface ActivityTabProps {
  bets: Bet[];
  betsLoading: boolean;
}

/**
 * Polymarket-style activity feed - every deposit and every payout/refund
 * surfaces as one row, sorted newest-first. Synthesised from the existing
 * Bet records (createdAt = deposit timestamp; updatedAt + claimTx = payout).
 */
export function ActivityTab({ bets, betsLoading }: ActivityTabProps) {
  const t = useThemeTokens();

  const entries = useMemo(() => {
    const out: ActivityEntry[] = [];
    for (const bet of bets) {
      // Deposit row
      out.push({
        id: `${bet.id}-bet`,
        type: 'BET',
        betId: bet.id,
        bet,
        timestamp: bet.createdAt,
        amountRaw: bet.amount,
        txSignature: bet.depositTx,
      });
      // Payout / refund row (if settled)
      if (bet.claimed && bet.payoutAmount && bet.payoutAmount !== '0') {
        const isRefund = bet.payoutAmount === bet.amount;
        out.push({
          id: `${bet.id}-claim`,
          type: isRefund ? 'REFUND' : 'PAID',
          betId: bet.id,
          bet,
          // The Bet model only carries `createdAt` to the API serializer;
          // we use the bet.createdAt + a small bump to ensure the claim
          // sorts after the bet when both happened in the same render.
          // updatedAt isn't surfaced today - acceptable approximation.
          timestamp: bet.createdAt,
          amountRaw: bet.payoutAmount,
          txSignature: bet.claimTx,
        });
      }
    }
    return out.sort((a, b) => {
      // Sort by timestamp desc; within the same timestamp, claim after bet.
      const cmp = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (cmp !== 0) return cmp;
      // Same timestamp → bet (deposit) first chronologically, so display claim above.
      if (a.type === 'BET' && b.type !== 'BET') return 1;
      if (b.type === 'BET' && a.type !== 'BET') return -1;
      return 0;
    });
  }, [bets]);

  if (betsLoading) {
    return (
      <Box>
        {[1, 2, 3, 4, 5].map(i => <ActivityRowSkeleton key={i} />)}
      </Box>
    );
  }

  if (entries.length === 0) {
    return <EmptyMessage py={8}>No activity yet - your bets and payouts will appear here.</EmptyMessage>;
  }

  return (
    <Box>
      {/* Column headers */}
      <Box sx={{
        display: { xs: 'none', md: 'grid' },
        gridTemplateColumns: '110px 1fr 200px 120px',
        gap: 2, px: 2, py: 1, mb: 0.5,
        borderBottom: `1px solid ${t.border.subtle}`,
      }}>
        <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Type</Typography>
        <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Market</Typography>
        <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Amount</Typography>
        <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Date</Typography>
      </Box>

      {entries.map(e => <ActivityRow key={e.id} entry={e} />)}
    </Box>
  );
}

// ---------------------------------------------------------------------------

interface TypeInfo {
  label: string;
  color: string;
  bg: string;
  icon: React.ReactNode;
}

function getTypeInfo(type: ActivityType, t: ReturnType<typeof useThemeTokens>): TypeInfo {
  switch (type) {
    case 'BET':
      return { label: 'Bet', color: t.text.primary, bg: t.hover.medium, icon: <ArrowDownward sx={{ fontSize: 14 }} /> };
    case 'PAID':
      return { label: 'Payout', color: t.gain, bg: withAlpha(t.gain, 0.12), icon: <ArrowUpward sx={{ fontSize: 14 }} /> };
    case 'REFUND':
      return { label: 'Refund', color: t.info, bg: 'rgba(59,130,246,0.12)', icon: <Refresh sx={{ fontSize: 14 }} /> };
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const t = useThemeTokens();
  const info = getTypeInfo(entry.type, t);
  const bet = entry.bet;
  const kind = kindOf(bet.pool);
  const isSports = kind === 'sports';
  const isPM = kind === 'pm';
  const sideColor = bet.side === 'UP' ? t.up : bet.side === 'DOWN' ? t.down : t.draw;
  const boxImageUrl = kind === 'crypto' ? getBoxImage(bet.pool.asset, bet.pool.interval) : null;
  const teamCrest = isSports ? bet.pool.homeTeamCrest : null;
  const sideLabel = isPM
    ? (bet.side === 'UP' ? 'Yes' : 'No')
    : isSports
    ? (bet.side === 'UP' ? (bet.pool.homeTeam || 'Home') : bet.side === 'DOWN' ? (bet.pool.awayTeam || 'Away') : 'Draw')
    : bet.side;
  const title = isPM
    ? (bet.pool.homeTeam || bet.pool.asset).slice(0, 80)
    : isSports
    ? `${bet.pool.homeTeam || ''} vs ${bet.pool.awayTeam || ''}`.trim()
    : `${bet.pool.asset}/USD`;
  const poolLink = kind === 'crypto' ? `/pool/${bet.pool.id}` : `/match/${bet.pool.id}`;
  const amountColor = entry.type === 'PAID' || entry.type === 'REFUND' ? t.gain : t.text.primary;

  return (
    <Box sx={{
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '110px 1fr 200px 120px' },
      alignItems: 'center', gap: { xs: 1, md: 2 }, px: { xs: 1.5, md: 2 }, py: 1.25,
      bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, mb: 1,
      transition: 'background 0.12s ease, border-color 0.12s ease',
      '&:hover': { background: t.hover.default, borderColor: t.border.medium },
    }}>
      {/* Type chip */}
      <Box sx={{
        display: 'inline-flex', alignItems: 'center', gap: 0.5,
        bgcolor: info.bg, color: info.color,
        px: 1, py: 0.4, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700,
        width: 'fit-content',
      }}>
        {info.icon}
        {info.label}
      </Box>

      {/* Market */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
        <Box sx={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          bgcolor: t.hover.medium, borderRadius: '5px', overflow: 'hidden',
        }}>
          {boxImageUrl ? (
            <Box component="img" src={boxImageUrl} alt="" sx={{ width: '90%', height: '90%', objectFit: 'contain' }} />
          ) : teamCrest ? (
            <Box component="img" src={teamCrest} alt="" sx={{ width: '88%', height: '88%', objectFit: 'contain' }} />
          ) : (
            <AssetIcon asset={bet.pool.asset} size={20} />
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Link href={poolLink} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Typography sx={{
              fontWeight: 600, fontSize: '0.82rem', color: t.text.primary,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              '&:hover': { color: t.text.bright },
            }}>
              {title}
            </Typography>
          </Link>
          <Box sx={{
            display: 'inline-flex', mt: 0.25,
            fontSize: '0.68rem', fontWeight: 700, color: sideColor,
            bgcolor: withAlpha(sideColor, 0.12), px: 0.6, py: 0.05, borderRadius: '3px',
          }}>
            {sideLabel}
          </Box>
        </Box>
      </Box>

      {/* Amount */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: { xs: 'flex-start', md: 'flex-end' }, gap: 0.75 }}>
        <Typography sx={{
          fontSize: '0.95rem', fontWeight: 700, color: amountColor,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {entry.type === 'BET' ? '−' : '+'}{formatUSDC(entry.amountRaw, { min: 2 })}
        </Typography>
        {entry.txSignature && (
          <Box
            component="a"
            href={getExplorerTxUrl(entry.txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            sx={{
              display: 'inline-flex', color: t.text.quaternary,
              '&:hover': { color: t.text.primary },
            }}
          >
            <OpenInNew sx={{ fontSize: 14 }} />
          </Box>
        )}
      </Box>

      {/* Date */}
      <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
        <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>
          {relativeTime(entry.timestamp)}
        </Typography>
      </Box>
    </Box>
  );
}

function ActivityRowSkeleton() {
  const t = useThemeTokens();
  return (
    <Box sx={{
      display: 'grid', gridTemplateColumns: { xs: '1fr', md: '110px 1fr 200px 120px' },
      alignItems: 'center', gap: 2, px: 2, py: 1.25,
      bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, mb: 1,
    }}>
      <Skeleton variant="rounded" width={80} height={22} sx={{ bgcolor: t.hover.default }} />
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Skeleton variant="rounded" width={32} height={32} sx={{ bgcolor: t.hover.default, borderRadius: '5px' }} />
        <Box sx={{ flex: 1 }}>
          <Skeleton variant="text" width="65%" height={16} sx={{ bgcolor: t.border.default }} />
          <Skeleton variant="rounded" width={40} height={14} sx={{ bgcolor: t.hover.default, mt: 0.4, borderRadius: '3px' }} />
        </Box>
      </Box>
      <Skeleton variant="text" width={70} height={20} sx={{ bgcolor: t.border.default, ml: 'auto' }} />
      <Skeleton variant="text" width={60} height={16} sx={{ bgcolor: t.hover.default, ml: 'auto' }} />
    </Box>
  );
}
