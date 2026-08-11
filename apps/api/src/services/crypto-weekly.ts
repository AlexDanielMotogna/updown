import { prisma } from '../db';
import { cryptoProfitMap, weekStartUtc, CRYPTO_LAUNCH_EPOCH, REFERRAL_MIN_REFERRERS, PREDICTION_MIN_PLAYERS, PREDICTION_PRIZES, REFERRAL_PRIZES } from '../routes/crypto-predictions';
import { getReferralLeaderboard } from './referrals';
import { notifyCryptoPodium } from './crypto-event-telegram';

/**
 * Crypto Predictions weekly prize: snapshot the top-1 realized-PNL winner for a
 * week and (optionally) auto-finalize the previous week. The leaderboard itself is
 * a rolling Monday-00:00-UTC window so it resets on its own; this captures the
 * winner before the window rolls over.
 */

const WEEK_MS = 7 * 86_400_000;

/** Window bounds for a week, honoring the launch epoch on the launch week. */
function weekWindow(ws: Date) {
  const weekEnd = new Date(ws.getTime() + WEEK_MS);
  const since = CRYPTO_LAUNCH_EPOCH > ws && CRYPTO_LAUNCH_EPOCH < weekEnd ? CRYPTO_LAUNCH_EPOCH : ws;
  return { since, weekEnd };
}

/** Draw/refresh the PNL podium for a week (top-N with tiered prizes). Idempotent;
 *  never overwrites a paid rank. Announces the podium on Telegram. */
export async function drawCryptoWeek(weekAnchor: Date): Promise<{ winners: unknown[]; note?: string }> {
  const ws = weekStartUtc(weekAnchor);
  const { since, weekEnd } = weekWindow(ws);
  const map = await cryptoProfitMap({ since, until: weekEnd });
  if (map.size < PREDICTION_MIN_PLAYERS) return { winners: [], note: `not enough players yet (${map.size}/${PREDICTION_MIN_PLAYERS})` };

  const sorted = [...map.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  const winners: unknown[] = [];
  const announce: Array<{ rank: number; prize: number; walletAddress: string; email: string | null; displayName: string | null; pnl: bigint }> = [];
  for (let i = 0; i < PREDICTION_PRIZES.length; i++) {
    const entry = sorted[i];
    if (!entry || entry[1] <= 0n) break; // only positive-PNL players get a prize
    const [wallet, pnl] = entry;
    const rank = i + 1;
    const prize = PREDICTION_PRIZES[i];
    const existing = await prisma.cryptoEventWinner.findUnique({ where: { weekStart_rank: { weekStart: ws, rank } } });
    if (existing?.paid) { winners.push(existing); continue; }
    const u = await prisma.user.findUnique({ where: { walletAddress: wallet }, select: { displayName: true, email: true } });
    const row = await prisma.cryptoEventWinner.upsert({
      where: { weekStart_rank: { weekStart: ws, rank } },
      update: { walletAddress: wallet, displayName: u?.displayName ?? null, email: u?.email ?? null, pnl, prize },
      create: { weekStart: ws, rank, prize, walletAddress: wallet, displayName: u?.displayName ?? null, email: u?.email ?? null, pnl },
    });
    winners.push(row);
    announce.push({ rank, prize, walletAddress: wallet, email: u?.email ?? null, displayName: u?.displayName ?? null, pnl });
  }
  if (winners.length === 0) return { winners: [], note: 'no positive PNL winner for this week' };
  if (announce.length > 0) notifyCryptoPodium({ kind: 'prediction', weekStart: ws, entries: announce }).catch(() => {});
  return { winners };
}

/** Draw/refresh the referral podium for a week (top-N with tiered prizes). */
export async function drawCryptoReferralWeek(weekAnchor: Date): Promise<{ winners: unknown[]; note?: string }> {
  const ws = weekStartUtc(weekAnchor);
  const { since, weekEnd } = weekWindow(ws);
  const board = await getReferralLeaderboard({ since, until: weekEnd });
  const activeReferrers = board.filter((b) => b.validReferrals > 0).length;
  if (activeReferrers < REFERRAL_MIN_REFERRERS) {
    return { winners: [], note: `not enough referrers yet (${activeReferrers}/${REFERRAL_MIN_REFERRERS} distinct)` };
  }

  const winners: unknown[] = [];
  const announce: Array<{ rank: number; prize: number; walletAddress: string; email: string | null; displayName: string | null; validReferrals: number }> = [];
  for (let i = 0; i < REFERRAL_PRIZES.length; i++) {
    const entry = board[i];
    if (!entry || entry.validReferrals <= 0) break; // only real referrers get a prize
    const rank = i + 1;
    const prize = REFERRAL_PRIZES[i];
    const existing = await prisma.cryptoReferralWinner.findUnique({ where: { weekStart_rank: { weekStart: ws, rank } } });
    if (existing?.paid) { winners.push(existing); continue; }
    const u = await prisma.user.findUnique({ where: { walletAddress: entry.walletAddress }, select: { displayName: true, email: true } });
    const row = await prisma.cryptoReferralWinner.upsert({
      where: { weekStart_rank: { weekStart: ws, rank } },
      update: { walletAddress: entry.walletAddress, displayName: u?.displayName ?? null, email: u?.email ?? null, validReferrals: entry.validReferrals, prize },
      create: { weekStart: ws, rank, prize, walletAddress: entry.walletAddress, displayName: u?.displayName ?? null, email: u?.email ?? null, validReferrals: entry.validReferrals },
    });
    winners.push(row);
    announce.push({ rank, prize, walletAddress: entry.walletAddress, email: u?.email ?? null, displayName: u?.displayName ?? null, validReferrals: entry.validReferrals });
  }
  if (winners.length === 0) return { winners: [], note: 'no valid referrals this week' };
  if (announce.length > 0) notifyCryptoPodium({ kind: 'referral', weekStart: ws, entries: announce }).catch(() => {});
  return { winners };
}

/** Finalize the previous completed week's podiums (PNL + referral) if not drawn yet. */
export async function maybeDrawPreviousWeek(): Promise<void> {
  const prevWeek = new Date(weekStartUtc().getTime() - WEEK_MS);
  const existing = await prisma.cryptoEventWinner.findFirst({ where: { weekStart: prevWeek } });
  if (!existing) await drawCryptoWeek(prevWeek).catch((e) => console.warn('[CryptoWeekly] auto-draw failed:', e instanceof Error ? e.message : e));

  const existingRef = await prisma.cryptoReferralWinner.findFirst({ where: { weekStart: prevWeek } });
  if (!existingRef) await drawCryptoReferralWeek(prevWeek).catch((e) => console.warn('[CryptoWeekly] referral auto-draw failed:', e instanceof Error ? e.message : e));
}

let timer: NodeJS.Timeout | null = null;

/** Hourly check that finalizes last week's winners once the week rolls over. */
export function startCryptoWeeklyScheduler(): void {
  const loop = async () => {
    try { await maybeDrawPreviousWeek(); } catch (e) { console.error('[CryptoWeekly] loop error:', e instanceof Error ? e.message : e); }
    timer = setTimeout(loop, 3_600_000);
  };
  console.log('[CryptoWeekly] scheduler started');
  timer = setTimeout(loop, 30_000);
}
