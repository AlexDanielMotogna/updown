'use client';

import { Box, Typography, Dialog } from '@mui/material';
import { EmojiEvents, Block } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const fmtUsd = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/** Celebratory popup for the weekly prize winner (auto-opened by the page). */
export function WinnerDialog({ open, pnl, onClose }: { open: boolean; pnl: string; onClose: () => void }) {
  const t = useThemeTokens();
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${t.gold}55`, overflow: 'hidden', backgroundImage: 'none' } }}>
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <EmojiEvents sx={{ fontSize: 52, color: t.gold, mb: 1 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', color: t.text.primary, mb: 0.5 }}>You won the weekly prize!</Typography>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 900, color: t.gold, mb: 0.75 }}>$100</Typography>
        <Typography sx={{ fontSize: '0.82rem', color: t.text.secondary, lineHeight: 1.5, mb: 2.5 }}>
          You topped the weekly PNL leaderboard with <b style={{ color: t.gain }}>{fmtUsd(pnl)}</b>. We&apos;ll reach out to pay your $100 prize manually — keep an eye on your email / Telegram.
        </Typography>
        <Box component="button" onClick={onClose} sx={{ width: '100%', py: 1.25, borderRadius: 1, border: 'none', cursor: 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 900, fontSize: '0.9rem' }}>
          Awesome
        </Box>
      </Box>
    </Dialog>
  );
}

/** Full-screen block for banned accounts. */
export function BannedOverlay() {
  const t = useThemeTokens();
  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 3000, bgcolor: 'rgba(3,8,14,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
      <Box sx={{ maxWidth: 360, textAlign: 'center' }}>
        <Block sx={{ fontSize: 52, color: t.error, mb: 1.5 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '1.2rem', color: t.text.primary, mb: 1 }}>Account suspended</Typography>
        <Typography sx={{ fontSize: '0.85rem', color: t.text.secondary, lineHeight: 1.5 }}>
          This account has been suspended from the event, likely for multiple accounts from the same person. If you think this is a mistake, contact support.
        </Typography>
      </Box>
    </Box>
  );
}
