import { prisma } from '../db';
import { cryptoProfitMap, weekWindowStart, weekStartUtc } from '../routes/crypto-predictions';
import { notifyDailyLeaderboard } from './crypto-event-telegram';

/**
 * Nightly leaderboard post: at a fixed local hour (default 21:00 Europe/Madrid,
 * DST-safe) push the current weekly PNL top-N to the public group. Config:
 *   CRYPTO_TG_LEADERBOARD_HOUR (0-23, default 21)
 *   CRYPTO_TG_LEADERBOARD_TZ   (IANA tz, default Europe/Madrid)
 *   CRYPTO_TG_LEADERBOARD_ENABLED=false  → off
 */

const HOUR = Math.max(0, Math.min(23, Number(process.env.CRYPTO_TG_LEADERBOARD_HOUR ?? 21)));
const MINUTE = 0;
const TZ = process.env.CRYPTO_TG_LEADERBOARD_TZ ?? 'Europe/Madrid';
const TOP_N = Math.max(1, Math.min(20, Number(process.env.CRYPTO_TG_LEADERBOARD_TOP_N ?? 5)));
const WEEK_MS = 7 * 86_400_000;

/** Offset (ms) of a timezone at a given instant: tzLocalWallClock − UTC. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const m: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) m[p.type] = p.value;
  const asUtc = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour === 24 ? 0 : +m.hour, +m.minute, +m.second);
  return asUtc - date.getTime();
}

/** UTC instant of a given wall-clock (y,m,d,h,mi) in a timezone. DST-safe. */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Correct by the offset at the guessed instant (two passes handles DST edges).
  let off = tzOffsetMs(new Date(guess), timeZone);
  let utc = guess - off;
  off = tzOffsetMs(new Date(utc), timeZone);
  return new Date(guess - off);
}

/** Next UTC instant where local time in TZ is HOUR:MINUTE, strictly after now. */
function nextRunUtc(now: Date): Date {
  for (let addDays = 0; addDays < 3; addDays++) {
    const probe = new Date(now.getTime() + addDays * 86_400_000);
    const parts: Record<string, string> = {};
    for (const p of new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(probe)) parts[p.type] = p.value;
    const run = zonedToUtc(+parts.year, +parts.month, +parts.day, HOUR, MINUTE, TZ);
    if (run.getTime() > now.getTime()) return run;
  }
  return new Date(now.getTime() + 86_400_000);
}

/** Live "Xd Yh Zm" until the weekly window rolls over (Monday 00:00 UTC). */
function resetLabel(now: Date): string {
  const nextMonday = new Date(weekStartUtc(now).getTime() + WEEK_MS);
  let ms = nextMonday.getTime() - now.getTime();
  if (ms < 0) ms = 0;
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${d > 0 ? `${d}d ` : ''}${d > 0 || h > 0 ? `${h}h ` : ''}${m}m`;
}

/** Build the weekly board + post it. Idempotent per day via an event-log guard. */
export async function postDailyLeaderboard(): Promise<{ posted: boolean; note?: string }> {
  const now = new Date();
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now); // YYYY-MM-DD local
  // Dedup: skip if we already posted today (survives restarts).
  const already = await prisma.eventLog.findFirst({ where: { eventType: 'CRYPTO_DAILY_LEADERBOARD', entityId: dayKey } });
  if (already) return { posted: false, note: 'already posted today' };

  const board = [...(await cryptoProfitMap({ since: weekWindowStart(now) })).entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0));
  if (board.length === 0) {
    await prisma.eventLog.create({ data: { eventType: 'CRYPTO_DAILY_LEADERBOARD', entityType: 'crypto', entityId: dayKey, payload: { players: '0' } } }).catch(() => {});
    return { posted: false, note: 'no players this week' };
  }

  const top = board.slice(0, TOP_N);
  const users = await prisma.user.findMany({ where: { walletAddress: { in: top.map(([w]) => w) } }, select: { walletAddress: true, displayName: true } });
  const nameOf = new Map(users.map((u) => [u.walletAddress, u.displayName]));
  const rows = top.map(([wallet, pnl]) => ({ wallet, displayName: nameOf.get(wallet) ?? null, pnl }));

  await notifyDailyLeaderboard({ rows, players: board.length, resetLabel: resetLabel(now) });
  await prisma.eventLog.create({ data: { eventType: 'CRYPTO_DAILY_LEADERBOARD', entityType: 'crypto', entityId: dayKey, payload: { players: String(board.length) } } }).catch(() => {});
  console.log(`[CryptoLeaderboard] posted nightly board (${board.length} players)`);
  return { posted: true };
}

let timer: NodeJS.Timeout | null = null;

/** Self-rescheduling daily loop at HOUR local time. */
export function startDailyLeaderboardScheduler(): void {
  const schedule = () => {
    const delay = nextRunUtc(new Date()).getTime() - Date.now();
    timer = setTimeout(async () => {
      try { await postDailyLeaderboard(); }
      catch (e) { console.error('[CryptoLeaderboard] post failed:', e instanceof Error ? e.message : e); }
      schedule();
    }, Math.max(1000, delay));
  };
  console.log(`[CryptoLeaderboard] scheduler started (daily ${String(HOUR).padStart(2, '0')}:00 ${TZ})`);
  schedule();
}
