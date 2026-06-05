'use client';

import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { LocalFireDepartment, ShowChart, MilitaryTech, Leaderboard } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import type { Bet } from '@/lib/api';

/** Minimal shape of the fields we read off the profile aggregate. */
interface InsightsProfile {
  rank?: number | null;
  totalUsers?: number | null;
  stats?: {
    netPnl?: string | number | null;
    totalWon?: string | number | null;
    totalWagered?: string | number | null;
    volumeStaked?: string | number | null;
    winRate?: string | number | null;
  } | null;
}

interface Props {
  bets: Bet[];
  profile?: InsightsProfile | null;
}

/**
 * Compact insight tiles shown beside the P&L chart: the metrics that tell a
 * user whether they're actually GOOD, not just whether they made money —
 * ROI, current win streak, win rate. Keeps the profile feeling competitive,
 * not just a wallet. All derived from data already on the profile + bets.
 */
export function ProfileInsights({ bets, profile }: Props) {
  const t = useThemeTokens();

  const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));
  const netPnl = profile?.stats?.netPnl != null
    ? num(profile.stats.netPnl)
    : num(profile?.stats?.totalWon) - num(profile?.stats?.totalWagered);
  const wagered = profile?.stats?.volumeStaked != null
    ? num(profile.stats.volumeStaked)
    : num(profile?.stats?.totalWagered);
  const roi = wagered > 0 ? (netPnl / wagered) * 100 : 0;
  const winRate = num(profile?.stats?.winRate);

  // Current streak: consecutive most-recent RESOLVED pools that came out net
  // positive. A net-negative pool breaks it; refunds (net 0) are neutral.
  const currentStreak = useMemo(() => {
    const byPool = new Map<string, { t: number; net: number }>();
    for (const b of bets) {
      if (b.isWinner === null) continue; // unresolved
      const stake = Number(b.amount);
      const payout = b.payoutAmount ? Number(b.payoutAmount) : 0;
      const t2 = new Date(b.pool.endTime).getTime();
      const e = byPool.get(b.pool.id);
      if (e) e.net += payout - stake;
      else byPool.set(b.pool.id, { t: t2, net: payout - stake });
    }
    const sorted = [...byPool.values()].sort((a, b) => b.t - a.t);
    let streak = 0;
    for (const p of sorted) {
      if (p.net > 0) streak++;
      else if (p.net < 0) break;
      // refund (net 0): neutral, keep scanning
    }
    return streak;
  }, [bets]);

  const roiColor = roi >= 0 ? t.gain : t.down;

  const rank = profile?.rank ?? null;
  const totalUsers = profile?.totalUsers ?? null;
  const percentile = rank && totalUsers && totalUsers >= 25
    ? Math.max(0.1, Math.round((rank / totalUsers) * 1000) / 10)
    : null;

  const tiles: Array<{ icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }> = [
    ...(rank ? [{
      icon: <Leaderboard sx={{ fontSize: 18 }} />,
      label: 'Global rank',
      value: `#${rank}`,
      sub: percentile != null ? `Top ${percentile}%` : 'climbing',
      color: t.gold,
    }] : []),
    {
      icon: <ShowChart sx={{ fontSize: 18 }} />,
      label: 'ROI',
      value: `${roi >= 0 ? '+' : ''}${roi.toFixed(1)}%`,
      sub: 'return on stake',
      color: roiColor,
    },
    {
      icon: <LocalFireDepartment sx={{ fontSize: 18 }} />,
      label: 'Current streak',
      value: currentStreak > 0 ? `${currentStreak} 🔥` : '0',
      sub: currentStreak > 0 ? 'winning pools' : 'no active streak',
      color: currentStreak > 0 ? t.gain : t.text.secondary,
    },
    {
      icon: <MilitaryTech sx={{ fontSize: 18 }} />,
      label: 'Win rate',
      value: `${winRate.toFixed ? winRate.toFixed(1) : winRate}%`,
      sub: 'pools won',
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, height: '100%' }}>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>
        Insights
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1 }}>
        {tiles.map(tile => (
          <Box
            key={tile.label}
            sx={{
              display: 'flex', alignItems: 'center', gap: 1.25,
              px: 1.5, py: 1.25, borderRadius: 1.5,
              bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`,
            }}
          >
            <Box sx={{
              width: 34, height: 34, flexShrink: 0, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: t.hover.medium, color: tile.color ?? t.text.secondary,
            }}>
              {tile.icon}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {tile.label}
              </Typography>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: tile.color ?? t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {tile.value}
              </Typography>
              {tile.sub && (
                <Typography sx={{ fontSize: '0.62rem', fontWeight: 500, color: t.text.quaternary }}>
                  {tile.sub}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
