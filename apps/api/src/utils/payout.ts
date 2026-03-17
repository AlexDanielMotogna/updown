import { getFeeBps, DEFAULT_FEE_BPS } from './fees';

interface PayoutParams {
  betAmount: bigint;
  totalUp: bigint;
  totalDown: bigint;
  side: 'UP' | 'DOWN';
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
  side,
  betCount,
  feeBps,
}: PayoutParams): PayoutResult {
  const totalPool = totalUp + totalDown;
  const winnerPool = side === 'UP' ? totalUp : totalDown;
  const grossPayout = winnerPool > 0n
    ? (betAmount * totalPool) / winnerPool
    : 0n;
  const fee = betCount <= 1 ? 0n : (grossPayout * BigInt(feeBps)) / 10000n;
  const payout = grossPayout - fee;
  return { grossPayout, fee, payout };
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
