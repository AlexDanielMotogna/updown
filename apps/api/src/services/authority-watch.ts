import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getConnection, getAuthorityKeypair } from '../utils/solana';
import { AUTHORITY_SOL_RESERVE } from './test-funds';

/**
 * Authority SOL watchdog.
 *
 * The authority pays for everything the platform does on-chain: pool creation,
 * resolutions, payouts, the gasless deposits and the new-user funding. When it
 * runs dry the API keeps answering 200 on /api/health while nothing works, which
 * is exactly how the event sat dead for two days without a single alert.
 *
 * Config:
 *   AUTHORITY_MIN_SOL          warn below this balance (default 1 SOL)
 *   AUTHORITY_WATCH_MINUTES    check cadence (default 10)
 *   OPS_TG_CHAT_ID             private ops chat for the alert (optional). NEVER
 *                              the public event chat: this reports operational
 *                              state, not player-facing content.
 *   WORLDCUP_TG_BOT_TOKEN      bot token, reused from the existing integration
 */

const MIN_SOL = Number(process.env.AUTHORITY_MIN_SOL ?? 1);
const EVERY_MIN = Math.max(1, Number(process.env.AUTHORITY_WATCH_MINUTES ?? 10));
const TG_API = 'https://api.telegram.org';

/** Alert only on state changes, so a dry authority doesn't spam every cycle. */
let wasLow = false;

async function alert(text: string): Promise<void> {
  const token = process.env.WORLDCUP_TG_BOT_TOKEN?.trim();
  const chatId = process.env.OPS_TG_CHAT_ID?.trim();
  if (!token || !chatId) return;
  try {
    await fetch(`${TG_API}/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
  } catch (e) {
    console.warn('[AuthorityWatch] alert failed:', e instanceof Error ? e.message : e);
  }
}

/** One balance check. Returns the balance in SOL, or null when it can't be read. */
export async function checkAuthorityBalance(): Promise<number | null> {
  try {
    const authority = getAuthorityKeypair();
    const sol = (await getConnection().getBalance(authority.publicKey)) / LAMPORTS_PER_SOL;
    const addr = authority.publicKey.toBase58();
    const low = sol < MIN_SOL;

    if (low && !wasLow) {
      console.error(`[AuthorityWatch] LOW BALANCE: ${sol.toFixed(4)} SOL (min ${MIN_SOL}) on ${addr}`);
      await alert(
        `⚠️ <b>Authority low on SOL</b>\n<code>${addr}</code>\nBalance: <b>${sol.toFixed(4)} SOL</b> (min ${MIN_SOL})\n` +
        `Below ${AUTHORITY_SOL_RESERVE} SOL new users stop being funded and pools stop being created.`,
      );
    } else if (!low && wasLow) {
      console.log(`[AuthorityWatch] balance recovered: ${sol.toFixed(4)} SOL`);
      await alert(`✅ <b>Authority refilled</b>\nBalance: <b>${sol.toFixed(4)} SOL</b>`);
    }
    wasLow = low;
    return sol;
  } catch (e) {
    console.warn('[AuthorityWatch] balance check failed:', e instanceof Error ? e.message : e);
    return null;
  }
}

let timer: NodeJS.Timeout | null = null;

export function startAuthorityWatch(): void {
  if (timer) return;
  void checkAuthorityBalance();
  timer = setInterval(() => { void checkAuthorityBalance(); }, EVERY_MIN * 60_000);
  console.log(`[AuthorityWatch] started (every ${EVERY_MIN} min, min ${MIN_SOL} SOL)`);
}

export function stopAuthorityWatch(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
