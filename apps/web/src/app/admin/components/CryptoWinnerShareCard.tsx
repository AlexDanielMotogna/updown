'use client';

import { useEffect, useState } from 'react';
import { Dialog, Box, Typography, IconButton, Snackbar, CircularProgress } from '@mui/material';
import { Close, Download, ContentCopy, Telegram } from '@mui/icons-material';
import { darkTokens as t } from '@/lib/theme';
import { adminFetch } from '../lib/adminApi';

const CYAN = '#5FD8EF';

export interface CryptoWinnerCardData {
  kind: 'prediction' | 'referral';
  rank?: number;
  displayName: string | null;
  email: string | null;
  walletAddress: string;
  prize: number;
  weekStart: string;
  pnl?: string;
  validReferrals?: number;
}

/**
 * Winner share card. The banner PNG is rendered SERVER-SIDE (POST /crypto/winner-card)
 * so it never depends on browser canvas; we just show the returned <img>, let you
 * download it, or post it to Telegram (POST /crypto/winner-card/post).
 */
export function CryptoWinnerShareCard({ data, onClose }: { data: CryptoWinnerCardData; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    let live = true;
    setImg(null); setErr(null);
    adminFetch<{ data: { image: string; caption: string } }>('/crypto/winner-card', { method: 'POST', body: JSON.stringify(data) })
      .then((r) => { if (live) { setImg(r.data.image); setCaption(r.data.caption); } })
      .catch((e) => { if (live) setErr((e as Error).message || 'Failed to render'); });
    return () => { live = false; };
  }, [data]);

  const download = () => {
    if (!img) return;
    const a = document.createElement('a');
    const slug = (data.displayName ?? data.walletAddress).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
    a.href = img;
    a.download = `updown-crypto-${data.kind}-winner-${slug}.png`;
    a.click();
  };
  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); setToast('Caption copied'); } catch { setToast('Could not copy'); }
  };
  const post = async (thread: number) => {
    if (posting) return;
    setPosting(true);
    try {
      await adminFetch('/crypto/winner-card/post', { method: 'POST', body: JSON.stringify({ ...data, thread }) });
      setToast(thread === 0 ? 'Posted to General' : 'Posted to Announcement');
    } catch (e) { setToast((e as Error).message || 'Failed to post'); } finally { setPosting(false); }
  };

  const btn = (primary?: boolean, disabled?: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: 1.5,
    fontSize: '0.82rem', fontWeight: 800, cursor: disabled ? 'default' : 'pointer',
    border: primary ? 'none' : `1px solid ${t.border.medium}`, opacity: disabled ? 0.5 : 1,
    bgcolor: primary ? CYAN : t.bg.surfaceAlt, color: primary ? '#04121a' : t.text.primary,
    '&:hover': { filter: 'brightness(1.08)' },
  }) as const;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2.5 } }}>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: t.text.primary }}>Winner share card</Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
        </Box>

        <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${t.border.subtle}`, aspectRatio: '1200 / 675', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#05080b' }}>
          {img
            ? <Box component="img" src={img} alt="Winner banner" sx={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
            : err
              ? <Typography sx={{ fontSize: '0.85rem', color: t.error, p: 2, textAlign: 'center' }}>{err}</Typography>
              : <CircularProgress size={28} sx={{ color: CYAN }} />}
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
          <Box component="button" onClick={download} sx={btn(true, !img)}><Download sx={{ fontSize: 18 }} /> Download PNG</Box>
          <Box component="button" onClick={copyCaption} sx={btn(false, !caption)}><ContentCopy sx={{ fontSize: 16 }} /> Copy caption</Box>
          <Box component="button" onClick={() => post(0)} sx={btn(false, !img || posting)}><Telegram sx={{ fontSize: 18 }} /> Post to General</Box>
          <Box component="button" onClick={() => post(644)} sx={btn(false, !img || posting)}><Telegram sx={{ fontSize: 18 }} /> Post to Announcement</Box>
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: t.text.tertiary }}>
          1200×675 — rendered on the server. Emails are shown masked (al***@…); wallets shortened.
        </Typography>
      </Box>
      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Dialog>
  );
}
