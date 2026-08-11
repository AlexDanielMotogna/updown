'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Box, Typography, IconButton, Snackbar } from '@mui/material';
import { Close, Download, ContentCopy, Telegram } from '@mui/icons-material';
import { darkTokens as t } from '@/lib/theme';
import { adminFetch } from '../lib/adminApi';

const CYAN = '#5FD8EF';
const GAIN = '#4dd18f';
const GOLD = '#f2b45e';
const LOGO_SRC = '/updown-logos/Logo_cyan_text_white.png';
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const W = 1200;
const H = 675;
const SCALE = 2;

export interface CryptoWinnerCardData {
  kind: 'prediction' | 'referral';
  displayName: string | null;
  email: string | null;
  walletAddress: string;
  /** Prize in USD (100 or 50). */
  prize: number;
  /** ISO week-start (Monday) for the date stamp. */
  weekStart: string;
  /** Prediction winner: realized weekly PNL in micro-USDC. */
  pnl?: string;
  /** Referral winner: count of valid referrals. */
  validReferrals?: number;
}

function maskEmail(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;
  return `${email.slice(0, Math.min(2, at))}***@${domain}`;
}
const shortWallet = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

function publicName(d: CryptoWinnerCardData): string {
  if (d.displayName && !d.displayName.includes('@')) return d.displayName;
  const masked = d.email ? maskEmail(d.email) : null;
  if (masked) return masked;
  return shortWallet(d.walletAddress);
}

const fmtUsd = (micro: string) => {
  const n = Number(micro) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
function weekStamp(iso: string): string {
  try { return `Week of ${new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`; } catch { return ''; }
}
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; });
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, startPx: number, weight: number) {
  let size = startPx;
  do { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(text).width <= maxWidth) break; size -= 4; } while (size > 24);
  ctx.fillText(text, cx, y);
}
/** Deterministic 0..1 from a string + index (stable candlestick motif per winner). */
function seeded(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function drawBackground(ctx: CanvasRenderingContext2D, seed: string) {
  ctx.fillStyle = '#05080b';
  ctx.fillRect(0, 0, W, H);
  // Cyan glow from the top-right
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.18, 40, W * 0.82, H * 0.18, 520);
  glow.addColorStop(0, 'rgba(95,216,239,0.16)');
  glow.addColorStop(1, 'rgba(95,216,239,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Faint upward candlestick chart along the bottom (the "gains" motif)
  const n = 26;
  const step = W / n;
  let base = H * 0.86;
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < n; i++) {
    const up = seeded(seed, i) > 0.38; // trend up
    const body = 26 + seeded(seed, i + 100) * 70;
    const wick = body + 18 + seeded(seed, i + 200) * 40;
    const x = i * step + step / 2;
    const drift = (i / n) * 150; // rise to the right
    const yMid = base - drift;
    ctx.strokeStyle = up ? GAIN : '#ff6b6b';
    ctx.fillStyle = up ? GAIN : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, yMid - wick / 2); ctx.lineTo(x, yMid + wick / 2); ctx.stroke();
    roundedRect(ctx, x - 7, yMid - body / 2, 14, body, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Bottom scrim so the footer text stays legible over the chart
  const vB = ctx.createLinearGradient(0, H - 220, 0, H);
  vB.addColorStop(0, 'rgba(5,8,11,0)');
  vB.addColorStop(1, 'rgba(5,8,11,0.9)');
  ctx.fillStyle = vB;
  ctx.fillRect(0, H - 220, W, 220);
}

function drawCard(ctx: CanvasRenderingContext2D, d: CryptoWinnerCardData, logo: HTMLImageElement | null) {
  const cx = W / 2;
  const pad = 72;
  const maxW = W - pad * 2;
  const isPred = d.kind === 'prediction';
  const accent = isPred ? CYAN : GOLD;

  drawBackground(ctx, d.walletAddress);

  // Top accent bar + frame
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 8);
  ctx.strokeStyle = `${accent}2e`;
  ctx.lineWidth = 2;
  roundedRect(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';

  // Header: UpDown logo left, "CRYPTO PREDICTIONS" right
  if (logo) {
    const lh = 44;
    const lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, pad, 54, lw, lh);
  }
  ctx.textAlign = 'right';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('CRYPTO PREDICTIONS', W - pad, 84);

  // Eyebrow pill
  ctx.textAlign = 'center';
  ctx.font = `700 26px ${FONT}`;
  const eyebrow = isPred ? 'WINNER OF THE WEEK' : 'TOP REFERRER OF THE WEEK';
  const lsp = 5;
  const chars = eyebrow.split('');
  const textW = chars.reduce((s, c) => s + ctx.measureText(c).width + lsp, -lsp);
  const pillH = 54;
  const pillW = textW + 56;
  const pillX = cx - pillW / 2;
  const pillY = 150;
  ctx.fillStyle = `${accent}1a`;
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2); ctx.fill();
  ctx.strokeStyle = `${accent}66`; ctx.lineWidth = 1.5;
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  let lx = cx - textW / 2;
  chars.forEach((c) => { ctx.fillText(c, lx, pillY + pillH / 2 + 9); lx += ctx.measureText(c).width + lsp; });
  ctx.textAlign = 'center';

  // Winner public name (auto-shrink) with soft shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffffff';
  fitText(ctx, publicName(d), cx, 330, maxW, 92, 800);
  ctx.restore();

  // "just won $100 ..." line
  const prize = `$${d.prize}`;
  const wonPart = 'just won ';
  const tailPart = isPred ? ' this week' : ' as the top referrer';
  ctx.font = `600 40px ${FONT}`;
  const wWon = ctx.measureText(wonPart).width;
  ctx.font = `800 40px ${FONT}`;
  const wPrize = ctx.measureText(prize).width;
  ctx.font = `600 40px ${FONT}`;
  const wTail = ctx.measureText(tailPart).width;
  let sx = cx - (wWon + wPrize + wTail) / 2;
  ctx.textAlign = 'left';
  ctx.font = `600 40px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillText(wonPart, sx, 398); sx += wWon;
  ctx.font = `800 40px ${FONT}`; ctx.fillStyle = accent; ctx.fillText(prize, sx, 398); sx += wPrize;
  ctx.font = `600 40px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.82)'; ctx.fillText(tailPart, sx, 398);
  ctx.textAlign = 'center';

  // Stat chip: prediction → PNL; referral → valid referrals
  const statLabel = isPred ? 'Weekly PNL' : 'Valid referrals';
  const statValue = isPred ? fmtUsd(d.pnl ?? '0') : `${d.validReferrals ?? 0}`;
  ctx.font = `800 56px ${FONT}`;
  const svW = ctx.measureText(statValue).width;
  ctx.font = `600 24px ${FONT}`;
  const slW = ctx.measureText(statLabel).width;
  const chipW = Math.max(svW, slW) + 96;
  const chipH = 140;
  const chipX = cx - chipW / 2;
  const chipY = 452;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  roundedRect(ctx, chipX, chipY, chipW, chipH, 20); ctx.fill();
  ctx.strokeStyle = `${accent}22`; ctx.lineWidth = 1.5;
  roundedRect(ctx, chipX, chipY, chipW, chipH, 20); ctx.stroke();
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(statLabel.toUpperCase(), cx, chipY + 42);
  ctx.font = `800 56px ${FONT}`;
  ctx.fillStyle = isPred ? GAIN : accent;
  ctx.fillText(statValue, cx, chipY + 104);

  // Week stamp
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(weekStamp(d.weekStart), cx, chipY + chipH + 40);

  // Footer
  ctx.textAlign = 'left';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = accent;
  ctx.fillText('updown.my', pad, H - 48);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Predict BTC · ETH · SOL every 5 min. Real prizes.', W - pad, H - 48);
  ctx.textAlign = 'center';
}

export function CryptoWinnerShareCard({ data, onClose }: { data: CryptoWinnerCardData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

  const caption = useMemo(() => {
    const who = publicName(data);
    return data.kind === 'prediction'
      ? `🏆 We have a weekly WINNER!\n\n${who} topped the UpDown Crypto Predictions leaderboard this week and won $${data.prize}.\n\nPredict BTC, ETH & SOL every 5 minutes — real prizes: updown.my`
      : `🤝 Top referrer of the week!\n\n${who} brought the most players to UpDown Crypto Predictions and won $${data.prize}.\n\nInvite friends, win real prizes: updown.my`;
  }, [data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    let cancelled = false;
    let logoImg: HTMLImageElement | null = null;
    // Paint immediately so the card always appears, even if the logo request or
    // webfonts hang; re-paint (keeping the latest logo) as they resolve.
    const paint = () => { if (!cancelled) drawCard(ctx, data, logoImg); };
    paint();
    loadImage(LOGO_SRC).then((logo) => { logoImg = logo; paint(); });
    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts?.ready) fonts.ready.then(paint).catch(() => {});
    return () => { cancelled = true; };
  }, [data]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = (data.displayName ?? data.walletAddress).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
      a.href = url;
      a.download = `updown-crypto-${data.kind}-winner-${slug}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const copyCaption = async () => {
    try { await navigator.clipboard.writeText(caption); setToast('Caption copied'); } catch { setToast('Could not copy'); }
  };

  const postToTelegram = async (thread: number) => {
    const canvas = canvasRef.current;
    if (!canvas || posting) return;
    setPosting(true);
    try {
      const imageBase64 = canvas.toDataURL('image/jpeg', 0.92);
      await adminFetch('/crypto/winner-image', { method: 'POST', body: JSON.stringify({ imageBase64, caption, thread }) });
      setToast(thread === 0 ? 'Posted to General' : 'Posted to Announcement');
    } catch (e) { setToast((e as Error).message || 'Failed to post'); } finally { setPosting(false); }
  };

  const btn = (primary?: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: 1.5,
    fontSize: '0.82rem', fontWeight: 800, cursor: posting ? 'default' : 'pointer',
    border: primary ? 'none' : `1px solid ${t.border.medium}`, opacity: posting ? 0.6 : 1,
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

        <Box sx={{ borderRadius: 2, overflow: 'hidden', border: `1px solid ${t.border.subtle}`, lineHeight: 0 }}>
          <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
        </Box>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
          <Box component="button" onClick={download} sx={btn(true)}><Download sx={{ fontSize: 18 }} /> Download PNG</Box>
          <Box component="button" onClick={copyCaption} sx={btn(false)}><ContentCopy sx={{ fontSize: 16 }} /> Copy caption</Box>
          <Box component="button" onClick={() => postToTelegram(0)} sx={btn(false)}><Telegram sx={{ fontSize: 18 }} /> Post to General</Box>
          <Box component="button" onClick={() => postToTelegram(644)} sx={btn(false)}><Telegram sx={{ fontSize: 18 }} /> Post to Announcement</Box>
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: t.text.tertiary }}>
          1200×675 (16:9) — the size X/Telegram use for photo cards. Emails are shown masked (al***@…); wallets shortened.
        </Typography>
      </Box>
      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Dialog>
  );
}
