import { getFeeBps, DEFAULT_FEE_BPS } from './fees';

interface PayoutParams {
  betAmount: bigint;
  totalUp: bigint;
  totalDown: bigint;
  totalDraw?: bigint;
  side: 'UP' | 'DOWN' | 'DRAW';
  betCount: number;
  feeBps: number;
}

interface PayoutResult {
  grossPayout: bigint;
  fee: bigint;
  payout: bigint;
}

/**
 * Calculate the payout for a winning bet using BigInt arithmetic.
 * Fee is waived when there's only one bettor (no counterparty).
 */
export function calculatePayout({
  betAmount,
  totalUp,
  totalDown,
  totalDraw,
  side,
  betCount,
  feeBps,
}: PayoutParams): PayoutResult {
  const totalPool = totalUp + totalDown + (totalDraw ?? 0n);
  const winnerPool = side === 'UP' ? totalUp : side === 'DOWN' ? totalDown : (totalDraw ?? 0n);
  const grossPayout = winnerPool > 0n
    ? (betAmount * totalPool) / winnerPool
    : 0n;
  const FEE_BASIS_DIVISOR = 10_000n;
  const fee = betCount <= 1 ? 0n : (grossPayout * BigInt(feeBps)) / FEE_BASIS_DIVISOR;
  const payout = grossPayout - fee;
  return { grossPayout, fee, payout };
}

interface WeightedPayoutParams {
  betAmount: bigint;
  /** This bet's time-weight (mirror of on-chain UserBet.weight). */
  betWeight: bigint;
  /** Σ weight of every bet on the winning side. */
  winningWeightSum: bigint;
  /** Σ raw stake on all losing sides (the pool redistributed by weight). */
  losingStakeTotal: bigint;
  betCount: number;
  feeBps: number;
}

/**
 * Time-weighted payout — mirrors the on-chain claim formula exactly:
 *   winnings = betWeight × losingStakeTotal / winningWeightSum
 *   payout   = betAmount + winnings − fee
 * The winner gets their principal back plus a share of the losing pool
 * proportional to their WEIGHT (early entry = bigger share), not their
 * raw stake. Use this for projections; for a settled claim prefer the
 * actual on-chain transfer (readOnchainClaimPayout) which already reflects
 * this formula and avoids any integer-rounding drift vs the BPF program.
 */
export function calculateWeightedPayout({
  betAmount,
  betWeight,
  winningWeightSum,
  losingStakeTotal,
  betCount,
  feeBps,
}: WeightedPayoutParams): PayoutResult {
  const winnings = winningWeightSum > 0n
    ? (betWeight * losingStakeTotal) / winningWeightSum
    : 0n;
  const grossPayout = betAmount + winnings;
  const FEE_BASIS_DIVISOR = 10_000n;
  const fee = betCount <= 1 ? 0n : (grossPayout * BigInt(feeBps)) / FEE_BASIS_DIVISOR;
  return { grossPayout, fee, payout: grossPayout - fee };
}

/**
 * Resolve fee basis points for a wallet address.
 * Looks up the user's level; falls back to default fee if not found.
 */
export async function resolveFeeBps(
  prisma: { user: { findUnique: (args: any) => Promise<{ level: number } | null> } },
  walletAddress: string,
): Promise<number> {
  const user = await prisma.user.findUnique({ where: { walletAddress } });
  return user ? getFeeBps(user.level) : DEFAULT_FEE_BPS;
}
