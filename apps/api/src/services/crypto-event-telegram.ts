/**
 * Fire-and-forget Telegram announcement for the Crypto Predictions weekly winner.
 * Reuses the WorldCup bot credentials; the chat can be overridden with
 * CRYPTO_TG_CHAT_ID (else falls back to WORLDCUP_TG_CHAT_ID). Off unless configured.
 *
 * PRIVACY: never expose the winner's full email/wallet here — the chat may be
 * public. The message masks the email and shortens the wallet; the full contact
 * details for the manual payout live only in the (key-protected) admin panel.
 */

const TG_API = 'https://api.telegram.org';

function creds(): { token: string; chatId: string; threadId?: number } | null {
  const token = process.env.WORLDCUP_TG_BOT_TOKEN?.trim();
  const chatId = (process.env.CRYPTO_TG_CHAT_ID || process.env.WORLDCUP_TG_CHAT_ID)?.trim();
  if (!token || !chatId) return null;
  if ((process.env.CRYPTO_TG_ENABLED ?? 'true').toLowerCase() === 'false') return null;
  // Optional forum topic (the group is a forum; without a thread id posts go to General).
  const thread = Number(process.env.CRYPTO_TG_THREAD_ID);
  return { token, chatId, threadId: Number.isFinite(thread) && thread > 0 ? thread : undefined };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtUsd = (raw: bigint) => `${raw >= 0n ? '+' : '−'}$${(Math.abs(Number(raw)) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Mask an email for public display: alejandro.f@gmail.com -> al***@gmail.com. */
function maskEmail(email: string | null): string {
  if (!email) return '—';
  const at = email.indexOf('@');
  if (at < 1 || !email.slice(at + 1).includes('.')) return '—';
  return `${email.slice(0, Math.min(2, at))}***@${email.slice(at + 1)}`;
}

/** Shorten a wallet: 9GN5xxxx...GDSs. Never post the full address publicly. */
const shortWallet = (w: string) => (w.length > 12 ? `${w.slice(0, 4)}…${w.slice(-4)}` : w);

/** Forum topic for the public "predictions feed" result posts (default thread 638). */
function resultsThread(): number | undefined {
  const t = Number(process.env.CRYPTO_TG_RESULTS_THREAD_ID ?? 638);
  return Number.isFinite(t) && t > 0 ? t : undefined;
}

const fmtPrice = (raw: bigint) => `$${(Number(raw) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const SIDE_EMOJI: Record<string, string> = { UP: '📈', DOWN: '📉', DRAW: '➖', MIX: '🔀' };

/**
 * Post a finished crypto pool's result to the public predictions feed (thread 638):
 * winner, strike→final, and every participant with their net PNL. Never throws.
 * PRIVACY: wallets are shortened; no emails ever reach this public channel.
 * Gate with CRYPTO_TG_RESULTS_ENABLED=false; thread via CRYPTO_TG_RESULTS_THREAD_ID.
 */
export async function notifyCryptoPoolResult(p: {
  asset: string;
  winner: 'UP' | 'DOWN' | 'DRAW';
  strikePrice: bigint;
  finalPrice: bigint;
  participants: { wallet: string; side: string; pnl: bigint }[];
}): Promise<void> {
  const c = creds();
  if (!c) return;
  if ((process.env.CRYPTO_TG_RESULTS_ENABLED ?? 'true').toLowerCase() === 'false') return;
  // Skip trivial pools to keep the feed meaningful (default: needs ≥2 players).
  const minPlayers = Math.max(1, Number(process.env.CRYPTO_TG_RESULTS_MIN_PLAYERS ?? 2));
  if (p.participants.length < minPlayers) return;

  const rows = [...p.participants].sort((a, b) => (b.pnl > a.pnl ? 1 : b.pnl < a.pnl ? -1 : 0));
  const MAX = 25;
  const shown = rows.slice(0, MAX);
  const dir = p.finalPrice >= p.strikePrice ? '▲' : '▼';
  const body = shown.map((r) =>
    `${r.pnl >= 0n ? '🟢' : '🔴'} <code>${esc(shortWallet(r.wallet))}</code>  ${SIDE_EMOJI[r.side] ?? ''} ${esc(r.side)}  <b>${esc(fmtUsd(r.pnl))}</b>`
  );
  const lines = [
    `📊 <b>${esc(p.asset)} 5-min pool settled</b>`,
    `${fmtPrice(p.strikePrice)} → ${fmtPrice(p.finalPrice)} ${dir} · Winner: <b>${esc(p.winner)}</b> ${SIDE_EMOJI[p.winner] ?? ''}`,
    '',
    `<b>${rows.length}</b> player${rows.length === 1 ? '' : 's'}`,
    ...body,
    rows.length > MAX ? `… and ${rows.length - MAX} more` : '',
  ].filter(Boolean).join('\n');

  try {
    await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.chatId, ...(resultsThread() ? { message_thread_id: resultsThread() } : {}), text: lines, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[CryptoTG] pool result post failed:', e instanceof Error ? e.message : e);
  }
}

/** Optional forum topic for the nightly leaderboard post (default: General = none). */
function leaderboardThread(): number | undefined {
  const t = Number(process.env.CRYPTO_TG_LEADERBOARD_THREAD_ID);
  return Number.isFinite(t) && t > 0 ? t : undefined;
}

const MEDALS = ['🥇', '🥈', '🥉'];

/**
 * Post the weekly PNL leaderboard to the public group (default General topic).
 * Fired nightly by the scheduler. Never throws. PRIVACY: wallets shortened, no
 * emails. Gate with CRYPTO_TG_LEADERBOARD_ENABLED=false.
 */
export async function notifyDailyLeaderboard(p: {
  rows: { wallet: string; displayName: string | null; pnl: bigint }[];
  players: number;
  resetLabel: string;
}): Promise<void> {
  const c = creds();
  if (!c) return;
  if ((process.env.CRYPTO_TG_LEADERBOARD_ENABLED ?? 'true').toLowerCase() === 'false') return;
  if (p.rows.length === 0) return;

  const body = p.rows.map((r, i) => {
    const rank = MEDALS[i] ?? `<b>${i + 1}.</b>`;
    const who = r.displayName && !r.displayName.includes('@') ? r.displayName : shortWallet(r.wallet);
    return `${rank} ${esc(who)}  <b>${esc(fmtUsd(r.pnl))}</b>`;
  });
  const lines = [
    '🏆 <b>Crypto Predictions — Weekly Leaderboard</b>',
    `Top players this week · resets in ${esc(p.resetLabel)}`,
    '',
    ...body,
    '',
    `<b>${p.players}</b> player${p.players === 1 ? '' : 's'} competing. Think you can top it?`,
  ].join('\n');

  try {
    await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: c.chatId,
        ...(leaderboardThread() ? { message_thread_id: leaderboardThread() } : {}),
        text: lines,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: '🎮 Play now', url: 'https://updown.my' }]] },
      }),
    });
  } catch (e) {
    console.warn('[CryptoTG] daily leaderboard post failed:', e instanceof Error ? e.message : e);
  }
}

/** Announce the weekly winner to the ops Telegram chat. Never throws. */
export async function notifyCryptoWinner(w: {
  walletAddress: string;
  email: string | null;
  displayName: string | null;
  pnl: bigint;
  weekStart: Date;
}): Promise<void> {
  const c = creds();
  if (!c) return;
  const week = w.weekStart.toISOString().slice(0, 10);
  const who = w.displayName && !w.displayName.includes('@') ? w.displayName : maskEmail(w.email);
  const lines = [
    '🏆 <b>Crypto Predictions — Weekly Winner</b>',
    `Week of <b>${week}</b> (Mon 00:00 UTC)`,
    '',
    `Winner: <b>${esc(who)}</b>`,
    `Wallet: <code>${esc(shortWallet(w.walletAddress))}</code>`,
    `PNL: <b>${esc(fmtUsd(w.pnl))}</b>`,
    '',
    'Prize: <b>$100</b> — full contact details are in the admin panel.',
  ].filter(Boolean).join('\n');
  try {
    await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.chatId, ...(c.threadId ? { message_thread_id: c.threadId } : {}), text: lines, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[CryptoTG] winner announce failed:', e instanceof Error ? e.message : e);
  }
}

/** Announce the weekly REFERRAL winner. Never throws. */
export async function notifyCryptoReferralWinner(w: {
  walletAddress: string;
  email: string | null;
  displayName: string | null;
  validReferrals: number;
  weekStart: Date;
}): Promise<void> {
  const c = creds();
  if (!c) return;
  const prize = process.env.CRYPTO_REFERRAL_PRIZE_LABEL ?? '$50';
  const week = w.weekStart.toISOString().slice(0, 10);
  const who = w.displayName && !w.displayName.includes('@') ? w.displayName : maskEmail(w.email);
  const lines = [
    '🤝 <b>Crypto Predictions — Weekly Referral Winner</b>',
    `Week of <b>${week}</b> (Mon 00:00 UTC)`,
    '',
    `Top referrer: <b>${esc(who)}</b>`,
    `Wallet: <code>${esc(shortWallet(w.walletAddress))}</code>`,
    `Valid referrals: <b>${w.validReferrals}</b>`,
    '',
    `Prize: <b>${esc(prize)}</b> — full contact details are in the admin panel.`,
  ].filter(Boolean).join('\n');
  try {
    await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.chatId, ...(c.threadId ? { message_thread_id: c.threadId } : {}), text: lines, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[CryptoTG] referral winner announce failed:', e instanceof Error ? e.message : e);
  }
}
