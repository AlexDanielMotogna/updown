import { prisma } from '../db';
import { cryptoProfitMap, weekStartUtc } from '../routes/crypto-predictions';
import { notifyCryptoWinner } from './crypto-event-telegram';

/**
 * Crypto Predictions weekly prize: snapshot the top-1 realized-PNL winner for a
 * week and (optionally) auto-finalize the previous week. The leaderboard itself is
 * a rolling Monday-00:00-UTC window so it resets on its own; this captures the
 * winner before the window rolls over.
 */

const WEEK_MS = 7 * 86_400_000;

/** Draw/refresh the winner for a week (Monday 00:00 UTC). Idempotent; never
 *  overwrites a paid winner. Announces on Telegram on create/update. */
export async function drawCryptoWeek(weekAnchor: Date): Promise<{ winner: unknown; note?: string }> {
  const ws = weekStartUtc(weekAnchor);
  const existing = await prisma.cryptoEventWinner.findUnique({ where: { weekStart: ws } });
  if (existing?.paid) return { winner: existing, note: 'already paid — not re-drawn' };

  const map = await cryptoProfitMap({ since: ws, until: new Date(ws.getTime() + WEEK_MS) });
  const top = [...map.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0];
  if (!top || top[1] <= 0n) return { winner: null, note: 'no positive PNL winner for this week' };

  const [wallet, pnl] = top;
  const u = await prisma.user.findUnique({ where: { walletAddress: wallet }, select: { displayName: true, email: true } });
  const winner = await prisma.cryptoEventWinner.upsert({
    where: { weekStart: ws },
    update: { walletAddress: wallet, displayName: u?.displayName ?? null, email: u?.email ?? null, pnl },
    create: { weekStart: ws, walletAddress: wallet, displayName: u?.displayName ?? null, email: u?.email ?? null, pnl },
  });
  notifyCryptoWinner({ walletAddress: wallet, email: u?.email ?? null, displayName: u?.displayName ?? null, pnl, weekStart: ws }).catch(() => {});
  return { winner };
}

/** Finalize the previous completed week's winner if it hasn't been drawn yet. */
export async function maybeDrawPreviousWeek(): Promise<void> {
  const prevWeek = new Date(weekStartUtc().getTime() - WEEK_MS);
  const existing = await prisma.cryptoEventWinner.findUnique({ where: { weekStart: prevWeek } });
  if (existing) return;
  await drawCryptoWeek(prevWeek).catch((e) => console.warn('[CryptoWeekly] auto-draw failed:', e instanceof Error ? e.message : e));
}

let timer: NodeJS.Timeout | null = null;

/** Hourly check that finalizes last week's winner once the week rolls over. */
export function startCryptoWeeklyScheduler(): void {
  const loop = async () => {
    try { await maybeDrawPreviousWeek(); } catch (e) { console.error('[CryptoWeekly] loop error:', e instanceof Error ? e.message : e); }
    timer = setTimeout(loop, 3_600_000);
  };
  console.log('[CryptoWeekly] scheduler started');
  timer = setTimeout(loop, 30_000);
}
