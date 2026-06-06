'use client';

import { Box, Typography, IconButton, Chip } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TrendingUp from '@mui/icons-material/TrendingUp';
import { useRouter } from 'next/navigation';
import { useBets } from '@/hooks/useBets';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { formatUSDC } from '@/lib/format';
import { AssetIcon } from '@/components/AssetIcon';
import type { Bet } from '@/lib/api';
import { kindOf } from '@/lib/poolKind';

interface Row { pool: Bet['pool']; amount: bigint; side: string; claimable: boolean }

/**
 * Right sidebar: the user's ACTIVE pools - pools they bet in that are still live
 * (JOINING/ACTIVE) or claimable (won, pending claim). One row per pool with the
 * pool image/icon, name, the user's side + staked amount, and a status badge.
 * Clicking a row opens the pool's detail page.
 */
export function ActivePoolsSidebar({ onClose }: { onClose: () => void }) {
  const t = useThemeTokens();
  const router = useRouter();
  const { connected } = useWalletBridge();
  const { data } = useBets({ limit: 100 });
  const bets = data?.data ?? [];

  // Dedup by pool, summing the user's stake; flag claimable if any bet won unclaimed.
  const byPool = new Map<string, Row>();
  for (const b of bets) {
    const claimable = b.isWinner === true && !b.claimed;
    const live = b.pool.status === 'JOINING' || b.pool.status === 'ACTIVE';
    if (!live && !claimable) continue;
    const cur = byPool.get(b.pool.id);
    if (!cur) byPool.set(b.pool.id, { pool: b.pool, amount: BigInt(b.amount), side: b.side, claimable });
    else { cur.amount += BigInt(b.amount); if (cur.side !== b.side) cur.side = 'MULTI'; if (claimable) cur.claimable = true; }
  }
  const items = [...byPool.values()].sort((a, b) => Number(b.claimable) - Number(a.claimable));

  const isSports = (p: Bet['pool']) => kindOf(p) === 'sports';
  const isPM = (p: Bet['pool']) => kindOf(p) === 'pm';
  const go = (p: Bet['pool']) => router.push(`${kindOf(p) === 'crypto' ? '/pool/' : '/match/'}${p.id}`);
  const title = (p: Bet['pool']) => (kindOf(p) !== 'crypto' ? (p.homeTeam || p.asset) : `${p.asset}/USD`);
  const sideLabel = (p: Bet['pool'], side: string) => {
    if (side === 'MULTI') return 'Both sides';
    if (side === 'DRAW') return 'Draw';
    if (isPM(p)) return side === 'UP' ? 'Yes' : 'No';
    if (isSports(p)) return side === 'UP' ? (p.homeTeam || 'Home') : (p.awayTeam || 'Away');
    return side === 'UP' ? 'Up' : 'Down';
  };

  const emptyMsg = !connected
    ? 'Connect your wallet to see your active pools.'
    : 'No active pools yet - place a prediction to see it here.';

  return (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderLeft: `1px solid ${t.border.subtle}`, bgcolor: t.bg.app }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Predictions{items.length > 0 ? ` · ${items.length}` : ''}
        </Typography>
        <IconButton size="small" onClick={onClose} sx={{ color: t.text.dimmed, '&:hover': { color: t.text.primary } }}>
          <CloseIcon sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>

      {/* List */}
      <Box sx={{ flex: 1, overflowY: 'auto', p: 1, scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
        {items.length === 0 ? (
          <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary, px: 1.5, py: 4, textAlign: 'center', lineHeight: 1.5 }}>
            {emptyMsg}
          </Typography>
        ) : items.map(({ pool, amount, side, claimable }) => (
          <Box
            key={pool.id}
            onClick={() => go(pool)}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1, p: 1, mb: 0.75,
              borderRadius: 1.5, cursor: 'pointer',
              border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surfaceAlt,
              transition: 'all 0.12s', '&:hover': { borderColor: t.border.strong, bgcolor: t.hover.light },
            }}
          >
            {/* Icon: crypto -> asset logo; sports/PM -> badge or fallback */}
            <Box sx={{ flexShrink: 0, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isSports(pool)
                ? (pool.homeTeamCrest
                    ? <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 30, height: 30, borderRadius: 1, objectFit: 'cover' }} />
                    : <Box sx={{ width: 30, height: 30, borderRadius: 1, bgcolor: t.hover.medium, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><TrendingUp sx={{ fontSize: 16, color: t.text.dimmed }} /></Box>)
                : <AssetIcon asset={pool.asset} size={30} />}
            </Box>
            {/* Info */}
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 0.5 }}>
                <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.25, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {title(pool)}
                </Typography>
                <Chip label={claimable ? 'CLAIM' : 'LIVE'} size="small"
                  sx={{ flexShrink: 0, height: 16, fontSize: '0.5rem', fontWeight: 800, borderRadius: '3px',
                    bgcolor: withAlpha(claimable ? t.gain : t.accent, 0.16), color: claimable ? t.gain : t.accent, '& .MuiChip-label': { px: 0.6 } }} />
              </Box>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, mt: 0.25 }}>
                {sideLabel(pool, side)} · ${formatUSDC(amount.toString(), { min: 2 })}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
