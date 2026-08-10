'use client';

import { useState } from 'react';
import { Box, Typography, Dialog, CircularProgress } from '@mui/material';
import { EmojiEvents, Block, CheckCircle } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const fmtUsd = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

export interface WinnerPrize { kind: 'prediction' | 'referral'; label: string; pnl?: string; validReferrals?: number }

/** Celebratory popup for any weekly prize winner (prediction and/or referral) +
 *  payout-wallet claim (like WorldCup). The SAME dialog serves both prize types. */
export function WinnerDialog({ open, prizes, totalLabel, payoutWallet, onClose, onSubmit }: {
  open: boolean;
  prizes: WinnerPrize[];
  totalLabel: string;
  payoutWallet: string | null;
  onClose: () => void;
  /** Submit the payout wallet; resolves to an error message, or null on success. */
  onSubmit: (wallet: string) => Promise<string | null>;
}) {
  const t = useThemeTokens();
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [justDone, setJustDone] = useState(false);
  const submitted = justDone || !!payoutWallet;

  const submit = async () => {
    const w = wallet.trim();
    if (!w || busy) return;
    setBusy(true); setErr(null);
    const e = await onSubmit(w);
    setBusy(false);
    if (e) setErr(e); else setJustDone(true);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${t.gold}55`, overflow: 'hidden', backgroundImage: 'none' } }}>
      <Box sx={{ p: 3, textAlign: 'center' }}>
        <EmojiEvents sx={{ fontSize: 52, color: t.gold, mb: 1 }} />
        <Typography sx={{ fontWeight: 900, fontSize: '1.2rem', color: t.text.primary, mb: 0.5 }}>You won the weekly prize{prizes.length > 1 ? 's' : ''}!</Typography>
        <Typography sx={{ fontSize: '1.5rem', fontWeight: 900, color: t.gold, mb: 1 }}>{totalLabel}</Typography>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mb: 2 }}>
          {prizes.map((p) => (
            <Box key={p.kind} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1.25, py: 0.75, borderRadius: 1, bgcolor: `${t.gold}12`, border: `1px solid ${t.gold}33` }}>
              <Typography sx={{ fontSize: '0.78rem', color: t.text.primary, textAlign: 'left' }}>
                {p.kind === 'prediction' ? 'Top the weekly PNL leaderboard' : 'Top referrer of the week'}
                {p.kind === 'prediction' && p.pnl ? <Box component="span" sx={{ color: t.gain, ml: 0.5 }}>({fmtUsd(p.pnl)})</Box> : null}
                {p.kind === 'referral' && p.validReferrals != null ? <Box component="span" sx={{ color: t.text.tertiary, ml: 0.5 }}>({p.validReferrals} referrals)</Box> : null}
              </Typography>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: t.gold, flex: 'none' }}>{p.label}</Typography>
            </Box>
          ))}
        </Box>

        {submitted ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75, mb: 2, px: 1.5, py: 1, borderRadius: 1, bgcolor: `${t.gain}14`, border: `1px solid ${t.gain}44` }}>
              <CheckCircle sx={{ fontSize: 18, color: t.gain }} />
              <Typography sx={{ fontSize: '0.82rem', color: t.text.primary }}>
                Wallet saved: <Box component="span" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>{short(payoutWallet || wallet)}</Box>
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.76rem', color: t.text.tertiary, mb: 2 }}>We&apos;ll send your {totalLabel} there. You may be contacted by email / Telegram to confirm.</Typography>
            <Box component="button" onClick={onClose} sx={{ width: '100%', py: 1.25, borderRadius: 1, border: 'none', cursor: 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 900, fontSize: '0.9rem' }}>Done</Box>
          </>
        ) : (
          <>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary, mb: 1, textAlign: 'left' }}>Enter the Solana wallet where you want your prize sent:</Typography>
            <Box component="input" value={wallet} placeholder="Your Solana wallet address" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWallet(e.target.value)}
              sx={{ width: '100%', px: 1.25, py: 1, mb: 1, borderRadius: 1, border: `1px solid ${err ? t.error : t.border.medium}`, bgcolor: t.bg.app, color: t.text.primary, fontFamily: 'monospace', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box' }} />
            {err && <Typography sx={{ fontSize: '0.74rem', color: t.error, mb: 1, textAlign: 'left' }}>{err}</Typography>}
            <Box component="button" onClick={submit} disabled={busy || !wallet.trim()} sx={{ width: '100%', py: 1.25, borderRadius: 1, border: 'none', cursor: busy || !wallet.trim() ? 'default' : 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 900, fontSize: '0.9rem', opacity: busy || !wallet.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
              {busy ? <CircularProgress size={16} sx={{ color: '#04121a' }} /> : 'Claim my $100'}
            </Box>
            <Typography component="button" onClick={onClose} sx={{ mt: 1.5, background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.75rem', color: t.text.tertiary, fontFamily: 'inherit' }}>I&apos;ll do it later</Typography>
          </>
        )}
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
