'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { EmojiEvents, Close } from '@mui/icons-material';
import { fetchCryptoLeaderboard, type CryptoLeaderRow } from '@/lib/api';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const TOP_N = 15;

const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

function Row({ r, me, tokens: t }: { r: CryptoLeaderRow; me: boolean; tokens: ReturnType<typeof useThemeTokens> }) {
  const positive = Number(r.pnl) >= 0;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}`, bgcolor: me ? `${CYAN}12` : 'transparent' }}>
      <Typography sx={{ width: 20, fontSize: '0.8rem', fontWeight: 800, color: r.rank <= 3 ? t.gold : t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{r.rank}</Typography>
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: me ? 700 : 400, color: me ? CYAN : t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {r.displayName || short(r.walletAddress)}{me && ' (you)'}
      </Typography>
      <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: positive ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(r.pnl)}</Typography>
    </Box>
  );
}

function Rows({ rows, wallet, tokens: t }: { rows: CryptoLeaderRow[]; wallet?: string | null; tokens: ReturnType<typeof useThemeTokens> }) {
  return <>{rows.map((r) => <Row key={r.walletAddress} r={r} me={!!wallet && r.walletAddress === wallet} tokens={t} />)}</>;
}

export function WeeklyLeaderboardCard() {
  const t = useThemeTokens();
  const { walletAddress } = useWalletBridge();
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ['crypto-leaderboard', 'week'], queryFn: () => fetchCryptoLeaderboard('week'), refetchInterval: 20_000 });
  const rows = data?.data ?? [];

  const top = rows.slice(0, TOP_N);
  const me = walletAddress ? rows.find((r) => r.walletAddress === walletAddress) : undefined;
  const mePinned = me && !top.some((r) => r.walletAddress === walletAddress); // ranked but outside the top window

  return (
    <Box data-tour="leaderboard" sx={{ borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden' }}>
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
        <>
          <Rows rows={top} wallet={walletAddress} tokens={t} />
          {mePinned && (
            <>
              <Box sx={{ px: 2, py: 0.4, textAlign: 'center', color: t.text.tertiary, fontSize: '0.7rem', borderBottom: `1px solid ${t.border.subtle}` }}>···</Box>
              <Row r={me!} me tokens={t} />
            </>
          )}
        </>
      )}

      <Box sx={{ px: 2, py: 1 }}>
        <Typography component="span" onClick={() => setOpen(true)} sx={{ fontSize: '0.72rem', fontWeight: 700, color: CYAN, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}>
          View full leaderboard
        </Typography>
      </Box>

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: t.text.primary }}>Weekly Leaderboard</Typography>
          <IconButton onClick={() => setOpen(false)} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
        </Box>
        <Box sx={{ maxHeight: '65vh', overflow: 'auto' }}><Rows rows={rows} wallet={walletAddress} tokens={t} /></Box>
      </Dialog>
    </Box>
  );
}
