/**
 * Fire-and-forget Telegram announcement for the Crypto Predictions weekly winner.
 * Reuses the WorldCup bot credentials; the chat can be overridden with
 * CRYPTO_TG_CHAT_ID (else falls back to WORLDCUP_TG_CHAT_ID). Off unless configured.
 * The message carries the full email + wallet so ops can pay the winner manually.
 */

const TG_API = 'https://api.telegram.org';

function creds(): { token: string; chatId: string } | null {
  const token = process.env.WORLDCUP_TG_BOT_TOKEN?.trim();
  const chatId = (process.env.CRYPTO_TG_CHAT_ID || process.env.WORLDCUP_TG_CHAT_ID)?.trim();
  if (!token || !chatId) return null;
  if ((process.env.CRYPTO_TG_ENABLED ?? 'true').toLowerCase() === 'false') return null;
  return { token, chatId };
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const fmtUsd = (raw: bigint) => `${raw >= 0n ? '+' : '−'}$${(Math.abs(Number(raw)) / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

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
  const lines = [
    '🏆 <b>Crypto Predictions — Weekly Winner</b>',
    `Week of <b>${week}</b> (Mon 00:00 UTC)`,
    '',
    `PNL: <b>${esc(fmtUsd(w.pnl))}</b>`,
    w.displayName ? `Name: ${esc(w.displayName)}` : null,
    `Email: <code>${esc(w.email ?? '—')}</code>`,
    `Wallet: <code>${esc(w.walletAddress)}</code>`,
    '',
    'Prize: <b>$100</b> — pay manually, then mark as paid in the admin.',
  ].filter(Boolean).join('\n');
  try {
    await fetch(`${TG_API}/bot${c.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: c.chatId, text: lines, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[CryptoTG] winner announce failed:', e instanceof Error ? e.message : e);
  }
}
