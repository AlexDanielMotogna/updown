'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, Dialog, IconButton, CircularProgress } from '@mui/material';
import { Close, KeyboardArrowUp, KeyboardArrowDown } from '@mui/icons-material';
import { fetchBets, type Bet } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const SETTLED = ['RESOLVED', 'CLAIMABLE', 'CANCELLED'];
const fmtUsd = (n: number) => `$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`;
  return `${Math.floor(d / 7)}w`;
}

/** The signed-in user's own event predictions (crypto bets), as a simple modal. */
export function MyActivityModal({ open, onClose, wallet }: { open: boolean; onClose: () => void; wallet: string | null }) {
  const t = useThemeTokens();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { if (!open) return; const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ['crypto-my-bets', wallet],
    queryFn: () => (wallet ? fetchBets(wallet, { limit: 50 }) : Promise.resolve(null)),
    enabled: open && !!wallet,
    refetchInterval: open ? 10_000 : false,
  });
  const bets: Bet[] = (data?.data ?? []).filter((b) => b.pool?.poolType === 'CRYPTO');

  const row = (b: Bet) => {
    const up = b.side === 'UP';
    const col = up ? t.up : t.down;
    const amount = Number(b.amount) / 1_000_000;
    const settled = SETTLED.includes(b.pool.status);
    const payout = b.payoutAmount != null ? Number(b.payoutAmount) / 1_000_000 : null;
    const wonSide = b.pool.winner != null ? b.pool.winner === b.side : b.isWinner === true;

    // Net PNL = payout − stake. A loss with no payout row is −stake; a settled win
    // whose payout hasn't been written yet is unknown (pnl null → "Won", no number).
    let pnl: number | null = null;
    if (settled) pnl = payout != null ? payout - amount : (wonSide ? null : -amount);

    let badge: { text: string; color: string };
    if (!settled) badge = { text: 'Active', color: t.text.tertiary };
    else if (pnl == null) badge = { text: 'Won', color: t.gain };            // won, payout pending
    else if (pnl > 0.005) badge = { text: 'Won', color: t.gain };
    else if (pnl < -0.005) badge = { text: 'Lost', color: t.error };
    else badge = { text: 'Refund', color: t.text.secondary };                // net ~0 → stake returned (no counterparty / void)
    const showPnl = pnl != null && Math.abs(pnl) > 0.005;

    return (
      <Box key={b.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ width: 26, height: 26, borderRadius: '50%', bgcolor: `${col}1f`, color: col, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {up ? <KeyboardArrowUp sx={{ fontSize: 18 }} /> : <KeyboardArrowDown sx={{ fontSize: 18 }} />}
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: '0.8rem', color: t.text.primary }}>
            <Box component="span" sx={{ color: col, fontWeight: 700 }}>{b.side}</Box> on {b.pool.asset} · {fmtUsd(amount)}
          </Typography>
          <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary }}>{ago(b.createdAt, now)} ago</Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: badge.color }}>{badge.text}</Typography>
          {showPnl && pnl != null && (
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: pnl >= 0 ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{pnl >= 0 ? '+' : '−'}{fmtUsd(pnl)}</Typography>
          )}
        </Box>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${t.border.subtle}`, overflow: 'hidden', backgroundImage: 'none' } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: t.text.primary }}>My activity</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
      </Box>
      <Box sx={{ px: 2, py: 1, maxHeight: '65vh', overflow: 'auto' }}>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={26} sx={{ color: CYAN }} /></Box>
        ) : bets.length === 0 ? (
          <Typography sx={{ fontSize: '0.82rem', color: t.text.tertiary, textAlign: 'center', py: 4 }}>No predictions yet. Place your first one!</Typography>
        ) : (
          bets.map(row)
        )}
      </Box>
    </Dialog>
  );
}
