'use client';

import { useQuery } from '@tanstack/react-query';
import { Box, Typography } from '@mui/material';
import { fetchCryptoLeaderboard } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';

const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
};
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

/** Weekly PNL leaderboard (left column). Resets on the Monday 00:00 UTC window. */
export function CryptoLeaderboard() {
  const t = useThemeTokens();
  const { data, isLoading } = useQuery({
    queryKey: ['crypto-leaderboard', 'week'],
    queryFn: () => fetchCryptoLeaderboard('week'),
    refetchInterval: 20_000,
  });
  const rows = data?.data ?? [];

  return (
    <Box sx={{ borderRadius: 2, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, overflow: 'hidden' }}>
      <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: t.text.primary }}>Weekly Leaderboard</Typography>
        <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary }}>By PNL · resets Monday</Typography>
      </Box>
      {isLoading ? (
        <Box sx={{ p: 2 }}><Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>Loading…</Typography></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ p: 2 }}><Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>No results yet this week. Place a bet to get on the board.</Typography></Box>
      ) : (
        <Box>
          {rows.map((r) => {
            const positive = Number(r.pnl) >= 0;
            return (
              <Box key={r.walletAddress} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}` }}>
                <Typography sx={{ width: 22, fontSize: '0.78rem', fontWeight: 700, color: r.rank <= 3 ? t.gold : t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{r.rank}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.8rem', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.displayName || short(r.walletAddress)}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: positive ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(r.pnl)}</Typography>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
