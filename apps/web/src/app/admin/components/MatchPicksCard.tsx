'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Box, Typography, IconButton, Snackbar } from '@mui/material';
import { Close, Download, ContentCopy } from '@mui/icons-material';
import { darkTokens as t } from '@/lib/theme';
import { adminFetch } from '../lib/adminApi';

const CYAN = '#5FD8EF';
const LOGO_SRC = '/updown-logos/Logo_cyan_text_white.png';
const BG_SRC = '/worldcup/fanart.jpg';
const WC_BADGE_SRC = '/worldcup/wc-badge.png';
const WC_URL = 'updown.my/worldcup';
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

const W = 1200;
const SCALE = 2;
const PAD = 64;
const COLS = 3;
const ROW_H = 46;
const GRID_TOP = 320;

export interface MatchPickEntry {
  handle: string | null;
  email: string | null;
  displayName: string | null;
  homeScore: number;
  awayScore: number;
  phase: string;
}

const PHASE_TAG: Record<string, string> = { REGULATION: "90'", EXTRA_TIME: 'AET', PENALTIES: 'PEN' };
export interface MatchPicksData {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  round: string | null;
  kickoff: string | null;
  picks: MatchPickEntry[];
}

interface Imgs { bg: HTMLImageElement | null; logo: HTMLImageElement | null; wcBadge: HTMLImageElement | null; home: HTMLImageElement | null; away: HTMLImageElement | null }

function maskEmail(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;
  return `${email.slice(0, Math.min(2, at))}***@${domain}`;
}
function pickLabel(p: MatchPickEntry): string {
  if (p.handle) return `@${p.handle}`;
  const m = p.email ? maskEmail(p.email) : null;
  if (m) return m;
  if (p.displayName && !p.displayName.includes('@')) return p.displayName;
  return 'A player';
}
function dateStamp(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); } catch { return ''; }
}
function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
}
function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const s = Math.max(w / img.width, h / img.height);
  ctx.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
}
function crest(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, x: number, y: number, size: number) {
  if (img && img.width > 0) {
    const s = Math.min(size / img.width, size / img.height);
    ctx.drawImage(img, x + (size - img.width * s) / 2, y + (size - img.height * s) / 2, img.width * s, img.height * s);
  }
}
/** Truncate text with an ellipsis to fit maxWidth at the current font. */
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + '…').width > maxWidth) s = s.slice(0, -1);
  return s + '…';
}

function cardHeight(n: number): number {
  const rows = Math.max(1, Math.ceil(n / COLS));
  return GRID_TOP + rows * ROW_H + 72;
}

function drawCard(ctx: CanvasRenderingContext2D, d: MatchPicksData, imgs: Imgs, H: number) {
  const cx = W / 2;

  // Background + scrim
  ctx.fillStyle = '#05080b'; ctx.fillRect(0, 0, W, H);
  if (imgs.bg) coverDraw(ctx, imgs.bg, W, H);
  ctx.fillStyle = 'rgba(5,8,11,0.90)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = CYAN; ctx.fillRect(0, 0, W, 8);
  ctx.strokeStyle = `${CYAN}2e`; ctx.lineWidth = 2; roundedRect(ctx, 24, 24, W - 48, H - 48, 20); ctx.stroke();
  ctx.textBaseline = 'alphabetic';

  // Header: UpDown lockup + FIFA badge
  if (imgs.logo) { const lh = 42; ctx.drawImage(imgs.logo, PAD, 54, (imgs.logo.width / imgs.logo.height) * lh, lh); }
  if (imgs.wcBadge) {
    const bh = 66, bw = (imgs.wcBadge.width / imgs.wcBadge.height) * bh;
    ctx.drawImage(imgs.wcBadge, W - PAD - bw, 42, bw, bh);
    ctx.textAlign = 'right'; ctx.font = `700 19px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('FIFA WORLD CUP', W - PAD - bw - 14, 82);
  }

  // Title: crests + "Home vs Away"
  ctx.textAlign = 'center';
  const cs = 60;
  ctx.font = `900 46px ${FONT}`;
  const title = `${d.homeTeam}  vs  ${d.awayTeam}`;
  const tW = Math.min(ctx.measureText(title).width, W - PAD * 2 - cs * 2 - 40);
  const blockW = cs + 20 + tW + 20 + cs;
  let x = cx - blockW / 2;
  crest(ctx, imgs.home, x, 150, cs); x += cs + 20;
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle';
  ctx.fillText(ellipsize(ctx, title, tW), x, 180); ctx.textBaseline = 'alphabetic';
  x += tW + 20;
  crest(ctx, imgs.away, x, 150, cs);

  // Round · date
  ctx.textAlign = 'center';
  const meta = [d.round, dateStamp(d.kickoff)].filter(Boolean).join('  ·  ');
  if (meta) { ctx.font = `600 24px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(meta, cx, 236); }

  // "Community picks (N)"
  ctx.font = `800 26px ${FONT}`; ctx.fillStyle = CYAN;
  ctx.fillText(`COMMUNITY PICKS · ${d.picks.length}`, cx, 284);

  // Picks grid (3 columns): "@handle ...... 2-1"
  const colGap = 24;
  const colW = (W - PAD * 2 - (COLS - 1) * colGap) / COLS;
  d.picks.forEach((p, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const gx = PAD + col * (colW + colGap);
    const gy = GRID_TOP + row * ROW_H;
    const midY = gy + (ROW_H - 8) / 2 + 1;
    // row chip
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundedRect(ctx, gx, gy, colW, ROW_H - 8, 8); ctx.fill();
    ctx.textBaseline = 'middle';
    // phase tag (rightmost, small + muted)
    const phase = PHASE_TAG[p.phase] ?? '';
    ctx.font = `600 15px ${FONT}`;
    const phaseW = phase ? ctx.measureText(phase).width : 0;
    if (phase) {
      ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillText(phase, gx + colW - 14, midY + 1);
    }
    // score (cyan bold, left of the phase tag)
    const score = `${p.homeScore}-${p.awayScore}`;
    ctx.font = `800 24px ${FONT}`;
    const scoreW = ctx.measureText(score).width;
    const scoreRight = gx + colW - 14 - (phaseW ? phaseW + 8 : 0);
    ctx.textAlign = 'right'; ctx.fillStyle = CYAN;
    ctx.fillText(score, scoreRight, midY);
    // handle / masked email (left, truncated to what's left)
    ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 22px ${FONT}`;
    const labelMax = colW - 28 - scoreW - (phaseW ? phaseW + 8 : 0) - 10;
    ctx.fillText(ellipsize(ctx, pickLabel(p), labelMax), gx + 14, midY);
    ctx.textBaseline = 'alphabetic';
  });

  // Footer
  ctx.textAlign = 'left'; ctx.font = `700 24px ${FONT}`; ctx.fillStyle = CYAN;
  ctx.fillText(WC_URL, PAD, H - 40);
  ctx.textAlign = 'right'; ctx.font = `600 22px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Call the score before kickoff.', W - PAD, H - 40);
  ctx.textAlign = 'center';
}

export function MatchPicksCard({ data, onClose }: { data: MatchPicksData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [crests, setCrests] = useState<{ home: string | null; away: string | null }>({ home: null, away: null });

  const H = useMemo(() => cardHeight(data.picks.length), [data.picks.length]);
  const tweet = useMemo(
    () => `${data.picks.length} predictions in for ${data.homeTeam} vs ${data.awayTeam}${data.round ? ` (${data.round})` : ''}.\nCall the score before kickoff: ${WC_URL}\n#WorldCup`,
    [data],
  );

  useEffect(() => {
    let live = true;
    adminFetch<{ data: { homeCrest: string | null; awayCrest: string | null } }>(`/worldcup/match/${data.matchId}/card-assets`)
      .then((r) => { if (live) setCrests({ home: r.data.homeCrest, away: r.data.awayCrest }); })
      .catch(() => {});
    return () => { live = false; };
  }, [data.matchId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    let cancelled = false;
    Promise.all([loadImage(BG_SRC), loadImage(LOGO_SRC), loadImage(WC_BADGE_SRC), loadImage(crests.home), loadImage(crests.away)])
      .then(([bg, logo, wcBadge, home, away]) => {
        if (cancelled || !canvasRef.current) return;
        const paint = () => !cancelled && drawCard(ctx, data, { bg, logo, wcBadge, home, away }, H);
        paint();
        const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
        if (fonts?.ready) fonts.ready.then(paint).catch(() => {});
      });
    return () => { cancelled = true; };
  }, [data, crests, H]);

  const download = () => {
    canvasRef.current?.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = `${data.homeTeam}-${data.awayTeam}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.href = url; a.download = `updown-worldcup-picks-${slug}.png`; a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  const copyTweet = async () => {
    try { await navigator.clipboard.writeText(tweet); setToast('Tweet text copied'); } catch { setToast('Could not copy'); }
  };

  const btn = (primary?: boolean) => ({
    display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: 1.5, fontSize: '0.82rem', fontWeight: 800,
    cursor: 'pointer', border: primary ? 'none' : `1px solid ${t.border.medium}`, bgcolor: primary ? CYAN : t.bg.surfaceAlt,
    color: primary ? '#04121a' : t.text.primary, '&:hover': { filter: 'brightness(1.08)' },
  }) as const;

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2.5 } }}>
      <Box sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: t.text.primary }}>Match picks card</Typography>
          <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
        </Box>
        {data.picks.length === 0 ? (
          <Typography sx={{ color: t.text.tertiary, fontSize: '0.85rem' }}>No picks to show (banned accounts are excluded).</Typography>
        ) : (
          <Box sx={{ maxHeight: '60vh', overflow: 'auto', borderRadius: 2, border: `1px solid ${t.border.subtle}` }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
          </Box>
        )}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 2 }}>
          <Box component="button" onClick={download} sx={btn(true)}><Download sx={{ fontSize: 18 }} /> Download PNG</Box>
          <Box component="button" onClick={copyTweet} sx={btn(false)}><ContentCopy sx={{ fontSize: 16 }} /> Copy tweet text</Box>
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: t.text.tertiary }}>
          {data.picks.length} picks · banned accounts excluded · emails masked. Tall image grows with the number of picks.
        </Typography>
      </Box>
      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Dialog>
  );
}
