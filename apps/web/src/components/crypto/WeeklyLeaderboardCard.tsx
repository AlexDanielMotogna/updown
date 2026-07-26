'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { EmojiEvents, Close } from '@mui/icons-material';
import { fetchCryptoLeaderboard, type CryptoLeaderRow } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';

const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

function Rows({ rows, tokens: t }: { rows: CryptoLeaderRow[]; tokens: ReturnType<typeof useThemeTokens> }) {
  return (
    <>
      {rows.map((r) => {
        const positive = Number(r.pnl) >= 0;
        return (
          <Box key={r.walletAddress} sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}` }}>
            <Typography sx={{ width: 20, fontSize: '0.8rem', fontWeight: 800, color: r.rank <= 3 ? t.gold : t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{r.rank}</Typography>
            <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.82rem', color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.displayName || short(r.walletAddress)}</Typography>
            <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: positive ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(r.pnl)}</Typography>
          </Box>
        );
      })}
    </>
  );
}

export function WeeklyLeaderboardCard() {
  const t = useThemeTokens();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['crypto-leaderboard', 'week'], queryFn: () => fetchCryptoLeaderboard('week'), refetchInterval: 20_000 });
  const rows = data?.data ?? [];

  return (
    <Box sx={{ borderRadius: 2, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <EmojiEvents sx={{ fontSize: 18, color: t.gold }} />
        <Box>
          <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.05em', color: t.text.primary }}>WEEKLY LEADERBOARD</Typography>
          <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary }}>Resets Monday</Typography>
        </Box>
      </Box>

      {isLoading ? (
        <Box sx={{ p: 2 }}><Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>Loading…</Typography></Box>
      ) : rows.length === 0 ? (
        <Box sx={{ p: 2 }}><Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>No results yet this week.</Typography></Box>
      ) : (
        <Rows rows={rows.slice(0, 7)} tokens={t} />
      )}

      <Box sx={{ p: 1.5 }}>
        <Box component="button" onClick={() => setOpen(true)} sx={{ width: '100%', py: 0.9, borderRadius: 1.5, border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', '&:hover': { color: t.text.primary, borderColor: t.text.tertiary } }}>
          View full leaderboard
        </Box>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: t.text.primary }}>Weekly Leaderboard</Typography>
          <IconButton onClick={() => setOpen(false)} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
        </Box>
        <Box sx={{ maxHeight: '65vh', overflow: 'auto' }}><Rows rows={rows} tokens={t} /></Box>
      </Dialog>
    </Box>
  );
}
