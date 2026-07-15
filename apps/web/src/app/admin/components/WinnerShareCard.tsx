'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, Box, Typography, IconButton, Snackbar } from '@mui/material';
import { Close, Download, ContentCopy } from '@mui/icons-material';
import { darkTokens as t } from '@/lib/theme';
import { adminFetch } from '../lib/adminApi';

const WC_X_URL = 'updown.my/worldcup';
/** Brand accent (palette.cyan) — the app's "up" colour. */
const CYAN = '#5FD8EF';
/** UpDown lockup (cyan hexagon + white "UpDown" wordmark) — an image, not typeset text. */
const LOGO_SRC = '/updown-logos/Logo_cyan_text_white.png';
/** The FIFA World Cup fanart the app uses behind its hero, + the trophy badge. Local copies so
 * the canvas stays same-origin and the PNG export works (SDB's CDN sends no CORS headers). */
const BG_SRC = '/worldcup/fanart.jpg';
const WC_BADGE_SRC = '/worldcup/wc-badge.png';

export interface WinnerCardData {
  /** Match id — used to fetch the team crests as same-origin data URIs. */
  matchId: string;
  /** X handle without the @ (preferred), else null. */
  handle: string | null;
  /** Fallback public name when there is no X handle. Never pass the email here. */
  displayName: string | null;
  homeTeam: string;
  awayTeam: string;
  round: string | null;
  /** ISO kickoff for the date stamp, or null. */
  kickoff: string | null;
  homeScore: number;
  awayScore: number;
  /** Prize per winner, e.g. 50. */
  prize: number;
}

interface CardImages {
  bg: HTMLImageElement | null;
  logo: HTMLImageElement | null;
  wcBadge: HTMLImageElement | null;
  home: HTMLImageElement | null;
  away: HTMLImageElement | null;
}

/** Draw an image cover-fit (fills the box, cropping overflow), centered. */
function coverDraw(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
// Export at 2x the 1200x675 (16:9) X card so it stays crisp when posted.
const W = 1200;
const H = 675;
const SCALE = 2;

/** Public display name for the card: @handle, else the name, else a generic label. Never an email. */
function publicName(d: WinnerCardData): string {
  if (d.handle) return `@${d.handle}`;
  if (d.displayName && !d.displayName.includes('@')) return d.displayName;
  return 'A UpDown player';
}

function dateStamp(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '';
  }
}

function loadImage(src: string | null): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
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

/** Draw text that shrinks to fit maxWidth. */
function fitText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, startPx: number, weight: number): number {
  let size = startPx;
  do {
    ctx.font = `${weight} ${size}px ${FONT}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 4;
  } while (size > 24);
  ctx.fillText(text, cx, y);
  return size;
}

/** A crest inside a size×size box, preserving aspect. Falls back to an initials disc. */
function drawCrest(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, team: string, x: number, y: number, size: number) {
  if (img && img.width > 0 && img.height > 0) {
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
    return;
  }
  const r = size / 2;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + r, y + r, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.strokeStyle = `${CYAN}55`;
  ctx.lineWidth = 2;
  ctx.stroke();
  const initials = team.split(/\s+/).map((s) => s[0]).join('').slice(0, 3).toUpperCase();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `800 ${Math.round(size * 0.34)}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, x + r, y + r + 2);
  ctx.restore();
}

function drawCard(ctx: CanvasRenderingContext2D, d: WinnerCardData, imgs: CardImages) {
  const cx = W / 2;
  const pad = 72;
  const maxW = W - pad * 2;

  // Background: the app's World Cup fanart, darkened so the text stays legible
  ctx.fillStyle = '#05080b';
  ctx.fillRect(0, 0, W, H);
  if (imgs.bg) coverDraw(ctx, imgs.bg, W, H);
  // Dark scrim: heavier on the left (where the copy sits), lighter on the right (trophy peeks through)
  const scrim = ctx.createLinearGradient(0, 0, W, 0);
  scrim.addColorStop(0, 'rgba(5,8,11,0.94)');
  scrim.addColorStop(0.6, 'rgba(5,8,11,0.86)');
  scrim.addColorStop(1, 'rgba(5,8,11,0.66)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
  // Extra top/bottom darkening for the header and footer bands
  const vT = ctx.createLinearGradient(0, 0, 0, 160);
  vT.addColorStop(0, 'rgba(5,8,11,0.6)');
  vT.addColorStop(1, 'rgba(5,8,11,0)');
  ctx.fillStyle = vT;
  ctx.fillRect(0, 0, W, 160);
  const vB = ctx.createLinearGradient(0, H - 150, 0, H);
  vB.addColorStop(0, 'rgba(5,8,11,0)');
  vB.addColorStop(1, 'rgba(5,8,11,0.75)');
  ctx.fillStyle = vB;
  ctx.fillRect(0, H - 150, W, 150);

  // Top accent bar + frame
  ctx.fillStyle = CYAN;
  ctx.fillRect(0, 0, W, 8);
  ctx.strokeStyle = `${CYAN}2e`;
  ctx.lineWidth = 2;
  roundedRect(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.stroke();

  ctx.textBaseline = 'alphabetic';

  // Header: UpDown lockup (image) left, FIFA World Cup badge right
  if (imgs.logo) {
    const lh = 44;
    const lw = (imgs.logo.width / imgs.logo.height) * lh;
    ctx.drawImage(imgs.logo, pad, 56, lw, lh);
  }
  if (imgs.wcBadge) {
    const bh = 70;
    const bw = (imgs.wcBadge.width / imgs.wcBadge.height) * bh;
    ctx.drawImage(imgs.wcBadge, W - pad - bw, 44, bw, bh);
    ctx.textAlign = 'right';
    ctx.font = `700 20px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('FIFA WORLD CUP', W - pad - bw - 16, 86);
  }

  // "WINNER OF THE DAY" pill (cyan outline)
  ctx.textAlign = 'center';
  ctx.font = `800 26px ${FONT}`;
  const eyebrow = 'WINNER OF THE DAY';
  const lsp = 6;
  const chars = eyebrow.split('');
  const textW = chars.reduce((s, c) => s + ctx.measureText(c).width + lsp, -lsp);
  const pillH = 54;
  const pillW = textW + 56;
  const pillX = cx - pillW / 2;
  const pillY = 148;
  ctx.fillStyle = `${CYAN}1a`;
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.fill();
  ctx.strokeStyle = `${CYAN}66`;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  ctx.stroke();
  ctx.fillStyle = CYAN;
  ctx.textAlign = 'left';
  let lx = cx - textW / 2;
  chars.forEach((c) => {
    ctx.fillText(c, lx, pillY + pillH / 2 + 9);
    lx += ctx.measureText(c).width + lsp;
  });
  ctx.textAlign = 'center';

  // Handle (auto-shrink), with a soft shadow so it reads over the photo
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffffff';
  fitText(ctx, publicName(d), cx, 332, maxW, 92, 900);
  ctx.restore();

  // "just won $50 predicting the exact score"
  const prize = `$${d.prize}`;
  const wonPart = 'just won ';
  const tailPart = ' predicting the exact score';
  ctx.font = `700 40px ${FONT}`;
  const wWon = ctx.measureText(wonPart).width;
  ctx.font = `900 40px ${FONT}`;
  const wPrize = ctx.measureText(prize).width;
  ctx.font = `700 40px ${FONT}`;
  const wTail = ctx.measureText(tailPart).width;
  let sx = cx - (wWon + wPrize + wTail) / 2;
  ctx.textAlign = 'left';
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(wonPart, sx, 396);
  sx += wWon;
  ctx.font = `900 40px ${FONT}`;
  ctx.fillStyle = CYAN;
  ctx.fillText(prize, sx, 396);
  sx += wPrize;
  ctx.font = `700 40px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  ctx.fillText(tailPart, sx, 396);
  ctx.textAlign = 'center';

  // Score + crests block
  const crest = 88;
  const g1 = 20; // crest -> name
  const g2 = 26; // name -> score
  let teamFs = 38;
  let scoreFs = 58;
  const scoreStr = `${d.homeScore}  –  ${d.awayScore}`;
  const measure = () => {
    ctx.font = `700 ${teamFs}px ${FONT}`;
    const hW = ctx.measureText(d.homeTeam).width;
    const aW = ctx.measureText(d.awayTeam).width;
    ctx.font = `900 ${scoreFs}px ${FONT}`;
    const sW = ctx.measureText(scoreStr).width;
    return { hW, aW, sW, total: crest + g1 + hW + g2 + sW + g2 + aW + g1 + crest };
  };
  let mb = measure();
  while (mb.total > maxW && teamFs > 22) {
    teamFs -= 2;
    scoreFs -= 2;
    mb = measure();
  }

  const midY = 498;
  const chipH = 128;
  const chipX = cx - mb.total / 2 - 30;
  const chipW = mb.total + 60;
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  roundedRect(ctx, chipX, midY - chipH / 2, chipW, chipH, 20);
  ctx.fill();
  ctx.strokeStyle = `${CYAN}1f`;
  ctx.lineWidth = 1.5;
  roundedRect(ctx, chipX, midY - chipH / 2, chipW, chipH, 20);
  ctx.stroke();

  let x = cx - mb.total / 2;
  drawCrest(ctx, imgs.home, d.homeTeam, x, midY - crest / 2, crest);
  x += crest + g1;

  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `700 ${teamFs}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.homeTeam, x, midY);
  x += mb.hW + g2;

  ctx.font = `900 ${scoreFs}px ${FONT}`;
  const hs = String(d.homeScore);
  const dash = '  –  ';
  const as = String(d.awayScore);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(hs, x, midY);
  x += ctx.measureText(hs).width;
  ctx.fillStyle = CYAN;
  ctx.fillText(dash, x, midY);
  x += ctx.measureText(dash).width;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(as, x, midY);
  x += ctx.measureText(as).width + g2;

  ctx.font = `700 ${teamFs}px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.awayTeam, x, midY);
  x += mb.aW + g1;

  drawCrest(ctx, imgs.away, d.awayTeam, x, midY - crest / 2, crest);
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'center';

  // Round · date
  const meta = [d.round, dateStamp(d.kickoff)].filter(Boolean).join('  ·  ');
  if (meta) {
    ctx.font = `600 24px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText(meta, cx, 600);
  }

  // Footer
  ctx.textAlign = 'left';
  ctx.font = `700 24px ${FONT}`;
  ctx.fillStyle = CYAN;
  ctx.fillText(WC_X_URL, pad, H - 50);
  ctx.textAlign = 'right';
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText('Call the score before kickoff. Real prizes.', W - pad, H - 50);
  ctx.textAlign = 'center';
}

export function WinnerShareCard({ data, onClose }: { data: WinnerCardData; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [crests, setCrests] = useState<{ home: string | null; away: string | null }>({ home: null, away: null });

  const tweet = useMemo(() => {
    const who = publicName(data);
    return (
      `We have a WINNER!\n\n` +
      `${who} nailed the exact score of ${data.homeTeam} ${data.homeScore}-${data.awayScore} ${data.awayTeam}` +
      `${data.round ? ` (${data.round})` : ''} and won $${data.prize}.\n\n` +
      `Call the score before kickoff, win real prizes: ${WC_X_URL}\n\n#WorldCup`
    );
  }, [data]);

  // Fetch team crests as same-origin data URIs (SDB's CDN has no CORS, which would taint the canvas).
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
    Promise.all([
      loadImage(BG_SRC), loadImage(LOGO_SRC), loadImage(WC_BADGE_SRC), loadImage(crests.home), loadImage(crests.away),
    ]).then(([bg, logo, wcBadge, home, away]) => {
      if (cancelled || !canvasRef.current) return;
      const paint = () => !cancelled && drawCard(ctx, data, { bg, logo, wcBadge, home, away });
      paint();
      const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
      if (fonts?.ready) fonts.ready.then(paint).catch(() => {});
    });
    return () => { cancelled = true; };
  }, [data, crests]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const slug = (data.handle ?? data.displayName ?? 'winner').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      a.href = url;
      a.download = `updown-worldcup-winner-${slug}.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const copyTweet = async () => {
    try {
      await navigator.clipboard.writeText(tweet);
      setToast('Tweet text copied');
    } catch {
      setToast('Could not copy');
    }
  };

  const btn = (primary?: boolean) =>
    ({
      display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 2, py: 1, borderRadius: 1.5,
      fontSize: '0.82rem', fontWeight: 800, cursor: 'pointer', border: primary ? 'none' : `1px solid ${t.border.medium}`,
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
          <Box component="button" onClick={copyTweet} sx={btn(false)}><ContentCopy sx={{ fontSize: 16 }} /> Copy tweet text</Box>
        </Box>
        <Typography sx={{ mt: 1.5, fontSize: '0.72rem', color: t.text.tertiary }}>
          1200×675 (16:9) — the size X uses for link/photo cards. Email addresses are never shown.
        </Typography>
      </Box>
      <Snackbar open={!!toast} autoHideDuration={2000} onClose={() => setToast(null)} message={toast} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }} />
    </Dialog>
  );
}
