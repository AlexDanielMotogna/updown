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
