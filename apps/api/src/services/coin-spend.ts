import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { utcDayKey } from './emission';

/**
 * UP Coins SPEND primitive — the sink side of the ledger.
 *
 * Until now the app only EMITTED coins; `User.coinsRedeemed` was never written, so
 * the token was a pure faucet (the death spiral docs/UP-UTILITY-SPEC.md warns of).
 * `spendCoins` is the single, safe, atomic debit that every sink (streak-savers,
 * cosmetics, boosts) hangs off:
 *
 *   - Atomic overspend guard: the balance is decremented via a conditional
 *     updateMany (WHERE coinsBalance >= amount), so two concurrent spends can never
 *     drive the balance negative.
 *   - Idempotent: an optional `idempotencyKey` (unique) makes a client retry a no-op.
 *   - Auditable: writes one CoinSpend row; `burned` marks hard sinks (destroyed) vs
 *     treasury-routed coins.
 *
 * See docs/PLAN-UP-UTILITY-IMPL.md §2.
 */

export interface SpendCoinsInput {
  walletAddress: string;
  /** Stored units (display = /100). Must be > 0. */
  amount: bigint;
  /** Sink category: 'STREAK_SAVER' | 'COSMETIC' | 'BOOST' | … */
  type: string;
  /** Specific catalog item within the category. */
  sku?: string;
  /** true (default) = coins destroyed; false = routed to treasury. */
  burned?: boolean;
  metadata?: Prisma.InputJsonValue;
  /** Optional unique key; a repeat call with the same key is rejected as DUPLICATE. */
  idempotencyKey?: string;
  /**
   * Runs INSIDE the debit transaction, after the balance is decremented and the
   * CoinSpend row is written. Grant the purchased item here (increment inventory,
   * insert a UserCosmetic, create an ActiveBoost) so the grant is atomic with the
   * debit — if it throws, the whole spend rolls back and no coins are lost.
   */
  applyInTx?: (tx: Prisma.TransactionClient) => Promise<void>;
}

export type SpendResult =
  | { ok: true; balance: bigint; spendId: string }
  | { ok: false; reason: 'INSUFFICIENT_FUNDS' | 'DUPLICATE' };

export async function spendCoins(input: SpendCoinsInput): Promise<SpendResult> {
  const { walletAddress, amount, type, sku, metadata, idempotencyKey } = input;
  const burned = input.burned ?? true;
  if (amount <= 0n) throw new Error('spendCoins: amount must be positive');

  // Cheap pre-check so an obvious retry short-circuits without opening a tx. The
  // unique constraint below is the real guard against a race.
  if (idempotencyKey) {
    const existing = await prisma.coinSpend.findUnique({
      where: { idempotencyKey },
      select: { id: true },
    });
    if (existing) return { ok: false, reason: 'DUPLICATE' };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Atomic conditional decrement: only matches when the balance covers it.
      const res = await tx.user.updateMany({
        where: { walletAddress, coinsBalance: { gte: amount } },
        data: {
          coinsBalance: { decrement: amount },
          coinsRedeemed: { increment: amount },
        },
      });
      if (res.count === 0) {
        // Missing user or insufficient balance — nothing was written.
        return { ok: false, reason: 'INSUFFICIENT_FUNDS' as const };
      }

      const spend = await tx.coinSpend.create({
        data: {
          walletAddress,
          type,
          sku: sku ?? null,
          amount,
          burned,
          metadata: metadata ?? undefined,
          idempotencyKey: idempotencyKey ?? null,
        },
      });

      // Grant the purchased item atomically with the debit (throws → full rollback).
      if (input.applyInTx) await input.applyInTx(tx);

      const user = await tx.user.findUnique({
        where: { walletAddress },
        select: { coinsBalance: true },
      });
      return { ok: true as const, balance: user?.coinsBalance ?? 0n, spendId: spend.id };
    });
  } catch (e) {
    // Lost the race on the unique idempotency key → treat as duplicate.
    if ((e as { code?: string }).code === 'P2002') return { ok: false, reason: 'DUPLICATE' };
    throw e;
  }
}

export interface SinkStats {
  todaySpent: bigint;
  totalRedeemed: bigint;
  todayBurned: bigint;
}

/** Snapshot for the emission-vs-sink dashboard (spend side). */
export async function getSinkStats(): Promise<SinkStats> {
  const startOfDay = new Date(`${utcDayKey()}T00:00:00.000Z`);
  const [todayAll, todayBurn, allTime] = await Promise.all([
    prisma.coinSpend.aggregate({ _sum: { amount: true }, where: { createdAt: { gte: startOfDay } } }),
    prisma.coinSpend.aggregate({
      _sum: { amount: true },
      where: { createdAt: { gte: startOfDay }, burned: true },
    }),
    prisma.coinSpend.aggregate({ _sum: { amount: true } }),
  ]);
  return {
    todaySpent: todayAll._sum.amount ?? 0n,
    todayBurned: todayBurn._sum.amount ?? 0n,
    totalRedeemed: allTime._sum.amount ?? 0n,
  };
}
