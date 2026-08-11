import path from 'path';
import { createCanvas, loadImage, GlobalFonts, type SKRSContext2D, type Image } from '@napi-rs/canvas';

/**
 * Server-side winner banner (1200x675 PNG). Generated on the API so it never
 * depends on browser canvas rendering. Fonts/logo are bundled under apps/api/assets
 * so they exist in the Docker image (which has no system fonts). Same design as the
 * WorldCup share card, crypto-themed.
 */

const CYAN = '#5FD8EF';
const GAIN = '#4dd18f';
const GOLD = '#f2b45e';
const FONT = 'Satoshi, sans-serif';
const W = 1200;
const H = 675;
const SCALE = 2;

// apps/api/assets — from both src/services (dev) and dist/services (prod), ../../ is apps/api.
const ASSETS = path.resolve(__dirname, '../../assets');
try {
  GlobalFonts.registerFromPath(path.join(ASSETS, 'Satoshi-Variable.woff2'), 'Satoshi');
} catch (e) {
  console.warn('[WinnerCard] font register failed:', e instanceof Error ? e.message : e);
}
let logoPromise: Promise<Image | null> | null = null;
function getLogo(): Promise<Image | null> {
  if (!logoPromise) logoPromise = loadImage(path.join(ASSETS, 'Logo_cyan_text_white.png')).catch(() => null);
  return logoPromise;
}

export interface WinnerCardData {
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

/** Eyebrow label by podium place. */
function eyebrowFor(kind: 'prediction' | 'referral', rank: number): string {
  if (rank <= 1) return kind === 'prediction' ? 'WINNER OF THE WEEK' : 'TOP REFERRER OF THE WEEK';
  const ord = rank === 2 ? '2ND' : rank === 3 ? '3RD' : `${rank}TH`;
  return `${ord} PLACE`;
}

function maskEmail(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;
  return `${email.slice(0, Math.min(2, at))}***@${domain}`;
}
const shortWallet = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);
function publicName(d: WinnerCardData): string {
  if (d.displayName && !d.displayName.includes('@')) return d.displayName;
  const masked = d.email ? maskEmail(d.email) : null;
  return masked ?? shortWallet(d.walletAddress);
}
const fmtUsd = (micro: string) => {
  const n = Number(micro) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
function weekStamp(iso: string): string {
  try { return `Week of ${new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`; } catch { return ''; }
}
function rr(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function fit(ctx: SKRSContext2D, text: string, cx: number, y: number, maxWidth: number, startPx: number, weight: number) {
  let size = startPx;
  do { ctx.font = `${weight} ${size}px ${FONT}`; if (ctx.measureText(text).width <= maxWidth) break; size -= 4; } while (size > 24);
  ctx.fillText(text, cx, y);
}
function seeded(s: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function drawBackground(ctx: SKRSContext2D, seed: string) {
  ctx.fillStyle = '#05080b';
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.82, H * 0.18, 40, W * 0.82, H * 0.18, 520);
  glow.addColorStop(0, 'rgba(95,216,239,0.16)');
  glow.addColorStop(1, 'rgba(95,216,239,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const n = 26;
  const step = W / n;
  const base = H * 0.86;
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < n; i++) {
    const up = seeded(seed, i) > 0.38;
    const body = 26 + seeded(seed, i + 100) * 70;
    const wick = body + 18 + seeded(seed, i + 200) * 40;
    const x = i * step + step / 2;
    const yMid = base - (i / n) * 150;
    ctx.strokeStyle = up ? GAIN : '#ff6b6b';
    ctx.fillStyle = up ? GAIN : '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, yMid - wick / 2); ctx.lineTo(x, yMid + wick / 2); ctx.stroke();
    rr(ctx, x - 7, yMid - body / 2, 14, body, 3);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  const vB = ctx.createLinearGradient(0, H - 220, 0, H);
  vB.addColorStop(0, 'rgba(5,8,11,0)');
  vB.addColorStop(1, 'rgba(5,8,11,0.9)');
  ctx.fillStyle = vB;
  ctx.fillRect(0, H - 220, W, 220);
}

function drawCard(ctx: SKRSContext2D, d: WinnerCardData, logo: Image | null) {
  const cx = W / 2;
  const pad = 72;
  const maxW = W - pad * 2;
  const isPred = d.kind === 'prediction';
  const accent = isPred ? CYAN : GOLD;

  drawBackground(ctx, d.walletAddress);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, W, 8);
  ctx.strokeStyle = `${accent}2e`;
  ctx.lineWidth = 2;
  rr(ctx, 24, 24, W - 48, H - 48, 20);
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';

  if (logo) {
    const lh = 44;
    const lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, pad, 54, lw, lh);
  }
  ctx.textAlign = 'right';
  ctx.font = `700 20px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText('CRYPTO PREDICTIONS', W - pad, 84);

  ctx.textAlign = 'center';
  ctx.font = `700 26px ${FONT}`;
  const eyebrow = eyebrowFor(d.kind, d.rank ?? 1);
  const lsp = 5;
  const chars = eyebrow.split('');
  const textW = chars.reduce((s, c) => s + ctx.measureText(c).width + lsp, -lsp);
  const pillH = 54;
  const pillW = textW + 56;
  const pillX = cx - pillW / 2;
  const pillY = 150;
  ctx.fillStyle = `${accent}1a`;
  rr(ctx, pillX, pillY, pillW, pillH, pillH / 2); ctx.fill();
  ctx.strokeStyle = `${accent}66`; ctx.lineWidth = 1.5;
  rr(ctx, pillX, pillY, pillW, pillH, pillH / 2); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.textAlign = 'left';
  let lx = cx - textW / 2;
  chars.forEach((c) => { ctx.fillText(c, lx, pillY + pillH / 2 + 9); lx += ctx.measureText(c).width + lsp; });
  ctx.textAlign = 'center';

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 22;
  ctx.fillStyle = '#ffffff';
  fit(ctx, publicName(d), cx, 330, maxW, 92, 800);
  ctx.restore();

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
  rr(ctx, chipX, chipY, chipW, chipH, 20); ctx.fill();
  ctx.strokeStyle = `${accent}22`; ctx.lineWidth = 1.5;
  rr(ctx, chipX, chipY, chipW, chipH, 20); ctx.stroke();
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText(statLabel.toUpperCase(), cx, chipY + 42);
  ctx.font = `800 56px ${FONT}`;
  ctx.fillStyle = isPred ? GAIN : accent;
  ctx.fillText(statValue, cx, chipY + 104);

  // Week stamp sits just above the stat chip (below-the-chip would collide with the footer).
  ctx.font = `600 22px ${FONT}`;
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.fillText(weekStamp(d.weekStart), cx, chipY - 22);

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

/** Render the winner banner to a PNG buffer. */
export async function renderWinnerCard(d: WinnerCardData): Promise<Buffer> {
  const canvas = createCanvas(W * SCALE, H * SCALE);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const logo = await getLogo();
  drawCard(ctx, d, logo);
  return canvas.toBuffer('image/png');
}

/** Suggested social/Telegram caption for a winner. */
export function winnerCaption(d: WinnerCardData): string {
  const who = publicName(d);
  return d.kind === 'prediction'
    ? `🏆 We have a weekly WINNER!\n\n${who} topped the UpDown Crypto Predictions leaderboard this week and won $${d.prize}.\n\nPredict BTC, ETH & SOL every 5 minutes — real prizes: updown.my`
    : `🤝 Top referrer of the week!\n\n${who} brought the most players to UpDown Crypto Predictions and won $${d.prize}.\n\nInvite friends, win real prizes: updown.my`;
}
