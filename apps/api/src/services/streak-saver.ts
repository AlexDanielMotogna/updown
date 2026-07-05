import { prisma } from '../db';
import { spendCoins, type SpendResult } from './coin-spend';

/**
 * Streak-saver sink (docs/PLAN-UP-UTILITY-IMPL.md §3, Sink 1).
 *
 * A streak-saver is a consumable bought with UP Coins that protects the user's
 * current win streak on a loss: instead of resetting the streak, one saver is
 * consumed. Proven retention sink (Duolingo streak freeze). Coins are BURNED on
 * purchase (hard sink). Consumption happens in `resetStreak` (services/rewards.ts),
 * which fires once per losing bet at pool resolution — so one saver protects one
 * losing bet.
 */

/** Price per streak-saver, stored units (display = /100 = 20 UP). Admin-tunable later. */
export const STREAK_SAVER_PRICE = 2_000n;
/** Max savers a wallet may hold, so the streak mechanic keeps meaning. */
export const STREAK_SAVER_MAX = 10;

export type BuyStreakSaverResult =
  | { ok: true; balance: bigint; streakSavers: number; spent: bigint }
  | { ok: false; reason: 'INSUFFICIENT_FUNDS' | 'DUPLICATE' | 'AT_MAX' };

/**
 * Buy `quantity` streak-savers. Debits UP Coins (burned) and increments the
 * inventory atomically via spendCoins' applyInTx hook.
 */
export async function buyStreakSaver(
  walletAddress: string,
  quantity = 1,
  idempotencyKey?: string,
): Promise<BuyStreakSaverResult> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > STREAK_SAVER_MAX) {
    throw new Error(`buyStreakSaver: quantity must be 1..${STREAK_SAVER_MAX}`);
  }

  // Reject if the purchase would exceed the hold cap (cheap pre-check; the
  // conditional increment below is the real guard against a concurrent buy).
  const current = await prisma.user.findUnique({
    where: { walletAddress },
    select: { streakSavers: true },
  });
  if ((current?.streakSavers ?? 0) + quantity > STREAK_SAVER_MAX) {
    return { ok: false, reason: 'AT_MAX' };
  }

  const cost = STREAK_SAVER_PRICE * BigInt(quantity);
  let newCount = current?.streakSavers ?? 0;

  let result: SpendResult;
  try {
    result = await spendCoins({
      walletAddress,
      amount: cost,
      type: 'STREAK_SAVER',
      sku: 'freeze',
      burned: true,
      idempotencyKey,
      metadata: { quantity },
      applyInTx: async (tx) => {
        // Conditional increment: only applies while under the cap, so a race between
        // two buys can't push the inventory past STREAK_SAVER_MAX (the loser throws,
        // rolling back the whole spend so the coins are refunded).
        const upd = await tx.user.updateMany({
          where: { walletAddress, streakSavers: { lte: STREAK_SAVER_MAX - quantity } },
          data: { streakSavers: { increment: quantity } },
        });
        if (upd.count === 0) throw new Error('AT_MAX');
        const u = await tx.user.findUnique({
          where: { walletAddress },
          select: { streakSavers: true },
        });
        newCount = u?.streakSavers ?? newCount;
      },
    });
  } catch (e) {
    if (e instanceof Error && e.message === 'AT_MAX') return { ok: false, reason: 'AT_MAX' };
    throw e;
  }

  if (!result.ok) return result;
  return { ok: true, balance: result.balance, streakSavers: newCount, spent: cost };
}
