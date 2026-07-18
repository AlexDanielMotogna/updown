/**
 * Posts each NEW World Cup contest prediction to a Telegram group/channel.
 * Gated by env (off unless configured); fire-and-forget so a Telegram hiccup never
 * breaks the prediction save. Banned (suspected farm) accounts are skipped.
 *
 * Env:
 *   WORLDCUP_TG_BOT_TOKEN  BotFather token (secret — set in Railway, never in repo)
 *   WORLDCUP_TG_CHAT_ID    target chat id (e.g. -1003990958454) or @username
 *   WORLDCUP_TG_ENABLED    optional kill switch ("false" to disable while configured)
 */

const TG_API = 'https://api.telegram.org';

function tgConfig(): { token: string; chatId: string } | null {
  const token = process.env.WORLDCUP_TG_BOT_TOKEN?.trim();
  const chatId = process.env.WORLDCUP_TG_CHAT_ID?.trim();
  const enabled = (process.env.WORLDCUP_TG_ENABLED ?? 'true').toLowerCase() !== 'false';
  if (!token || !chatId || !enabled) return null;
  return { token, chatId };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Mask an email for public display: alejandro.f@gmail.com -> al***@gmail.com. */
function maskEmail(email: string): string | null {
  const at = email.indexOf('@');
  if (at < 1) return null;
  const domain = email.slice(at + 1);
  if (!domain.includes('.')) return null;
  return `${email.slice(0, Math.min(2, at))}***@${domain}`;
}

/** Public identity: @handle, else masked email, else display name, else a generic label. */
function publicName(u: { xHandle: string | null; email: string | null; displayName: string | null }): string {
  if (u.xHandle) return `@${u.xHandle}`;
  const masked = u.email ? maskEmail(u.email) : null;
  if (masked) return masked;
  if (u.displayName && !u.displayName.includes('@')) return u.displayName;
  return 'A player';
}

export interface TgPredictionUser {
  xHandle: string | null;
  email: string | null;
  displayName: string | null;
  banned: boolean;
}

export interface TgPredictionMatch {
  homeTeam: string;
  awayTeam: string;
  round: string | null;
}

/** Fire-and-forget: announce a new prediction to the configured Telegram chat. */
export async function notifyWorldCupPrediction(
  user: TgPredictionUser,
  match: TgPredictionMatch,
  pred: { homeScore: number; awayScore: number },
): Promise<void> {
  const cfg = tgConfig();
  if (!cfg || user.banned) return; // disabled, or a banned farm account

  const who = escapeHtml(publicName(user));
  const round = match.round ? ` <i>(${escapeHtml(match.round)})</i>` : '';
  const text =
    `🌍 <b>New World Cup prediction</b>\n` +
    `${who}: <b>${escapeHtml(match.homeTeam)} ${pred.homeScore}-${pred.awayScore} ${escapeHtml(match.awayTeam)}</b>${round}`;

  try {
    const resp = await fetch(`${TG_API}/bot${cfg.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!resp.ok) {
      console.warn('[WorldCupTG] sendMessage HTTP', resp.status, (await resp.text()).slice(0, 200));
    }
  } catch (e) {
    console.warn('[WorldCupTG] send failed:', e instanceof Error ? e.message : e);
  }
}
