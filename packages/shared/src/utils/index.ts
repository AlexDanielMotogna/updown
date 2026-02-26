/**
 * Format a bigint price to a human-readable string
 * Assumes 6 decimal places (USDC)
 */
export function formatPrice(price: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const integerPart = price / divisor;
  const fractionalPart = price % divisor;
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  return `${integerPart}.${fractionalStr}`;
}

/**
 * Parse a string price to bigint
 * Assumes 6 decimal places (USDC)
 */
export function parsePrice(price: string, decimals = 6): bigint {
  const [integer, fractional = ''] = price.split('.');
  const paddedFractional = fractional.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(integer + paddedFractional);
}

/**
 * Calculate payout for a winning bet
 */
export function calculatePayout(
  userBet: bigint,
  totalWinningSide: bigint,
  totalPool: bigint
): bigint {
  if (totalWinningSide === 0n) return 0n;
  return (userBet * totalPool) / totalWinningSide;
}

/**
 * Calculate odds for a side
 */
export function calculateOdds(totalUp: bigint, totalDown: bigint, side: 'UP' | 'DOWN'): number {
  const total = totalUp + totalDown;
  if (total === 0n) return 1;
  const sideTotal = side === 'UP' ? totalUp : totalDown;
  if (sideTotal === 0n) return Infinity;
  return Number(total) / Number(sideTotal);
}
