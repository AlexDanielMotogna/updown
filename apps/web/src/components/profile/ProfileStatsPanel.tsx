'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { formatUSDC } from '@/lib/format';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import type { UserProfile } from '@/lib/api';

interface Props {
  userProfile: UserProfile | null | undefined;
}

/**
 * The four north-star metrics, stacked VERTICALLY to sit beside the P&L chart
 * (chart 70% / this 30%). Same numbers the header used to show horizontally -
 * moved here so the header strip can host the level-milestone icons instead.
 */
export function ProfileStatsPanel({ userProfile }: Props) {
  const t = useThemeTokens();
  const s = userProfile?.stats;
  const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));

  const netPnl = s?.netPnl != null ? num(s.netPnl) : num(s?.totalWon) - num(s?.totalWagered);
  const wagered = s?.volumeStaked != null ? num(s.volumeStaked) : num(s?.totalWagered);
  const pnlPositive = netPnl >= 0;
  const totalBets = num(s?.totalBets);
  const totalWins = num(s?.totalWins);
  const totalRefunded = num(s?.totalRefunded);
  const settled = Math.max(0, totalBets - totalRefunded);
  const losses = Math.max(0, totalBets - totalWins - totalRefunded);
  const coins = userProfile ? num(userProfile.coinsBalance) / UP_COINS_DIVISOR : 0;
  const bestStreak = num(s?.bestStreak);

  const tiles: Array<{ label: string; tip: string; value: string; sub?: string; color: string; icon?: React.ReactNode }> = [
    {
      label: 'Net P&L',
      tip: "Realized profit/loss from settled predictions. Active bets and refunds don't move it.",
      value: `${pnlPositive ? '+' : ''}${formatUSDC(String(netPnl), { min: 2 })}`,
      color: pnlPositive ? t.gain : t.down,
      icon: pnlPositive ? <TrendingUp sx={{ fontSize: 15 }} /> : <TrendingDown sx={{ fontSize: 15 }} />,
    },
    {
      label: 'Win Rate',
      tip: 'Share of your predictions that won',
      value: `${s?.winRate ?? '0.0'}%`,
      sub: `${totalWins}W / ${losses}L`,
      color: t.gain,
    },
    {
      label: 'Volume Staked',
      tip: "USDC put at risk across all pools. Refunded stakes don't count (they came back).",
      value: formatUSDC(String(wagered), { min: 0 }),
      sub: `${settled} prediction${settled === 1 ? '' : 's'}`,
      color: t.text.primary,
    },
    {
      label: 'UP Coins',
      tip: 'Coins earned from activity. Convert to $UP at launch',
      value: coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      sub: `best streak ${bestStreak}`,
      color: t.accent,
      icon: <Box component="img" src="/token/Token_16px_Gold.png" alt="UP" sx={{ width: 14, height: 14 }} />,
    },
  ];

  return (
    <Box sx={{
      // Desktop: vertical column beside the chart. Mobile: a compact 2×2 grid
      // below it (4 tall stacked boxes wasted vertical space).
      display: { xs: 'grid', md: 'flex' },
      gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'none' },
      flexDirection: { md: 'column' },
      gap: 1, height: '100%',
    }}>
      {tiles.map(tile => (
        <Tooltip key={tile.label} arrow placement="left" title={tile.tip}>
          <Box sx={{
            flex: { md: 1 }, minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center',
            px: 1.5, py: 1, borderRadius: 1.5,
            bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, cursor: 'help',
          }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              {tile.icon && <Box sx={{ display: 'flex', color: tile.color }}>{tile.icon}</Box>}
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {tile.label}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: tile.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {tile.value}
            </Typography>
            {tile.sub && (
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary }}>
                {tile.sub}
              </Typography>
            )}
          </Box>
        </Tooltip>
      ))}
    </Box>
  );
}
