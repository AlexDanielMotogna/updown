import { USDC_DECIMALS, PRICE_DECIMALS } from '../constants/enums';

/**
 * Format USDC amount from lamports to display string
 */
export function formatUsdc(lamports: bigint | string | number): string {
  const value = typeof lamports === 'bigint' ? lamports : BigInt(lamports);
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = value / divisor;
  const fraction = value % divisor;

  if (fraction === BigInt(0)) {
    return whole.toString();
  }

  const fractionStr = fraction.toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '');
  return `${whole}.${fractionStr}`;
}

/**
 * Parse USDC display amount to lamports
 */
export function parseUsdc(displayAmount: string | number): bigint {
  const amount = typeof displayAmount === 'string' ? parseFloat(displayAmount) : displayAmount;
  return BigInt(Math.round(amount * 10 ** USDC_DECIMALS));
}

/**
 * Format price with proper decimals
 */
export function formatPrice(price: bigint | string | number, decimals = 2): string {
  const value = typeof price === 'bigint' ? price : BigInt(price);
  const divisor = BigInt(10 ** PRICE_DECIMALS);
  const whole = Number(value / divisor);
  const fraction = Number(value % divisor) / 10 ** PRICE_DECIMALS;

  return (whole + fraction).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Shorten wallet address for display
 */
export function shortenAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

/**
 * Format countdown time
 */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';

  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((ms % (1000 * 60)) / 1000);

  return [hours, minutes, seconds].map((v) => v.toString().padStart(2, '0')).join(':');
}

/**
 * Calculate percentage for pool distribution
 */
export function calculatePercentage(part: bigint | string, total: bigint | string): number {
  const partNum = typeof part === 'bigint' ? part : BigInt(part);
  const totalNum = typeof total === 'bigint' ? total : BigInt(total);

  if (totalNum === BigInt(0)) return 0;

  return Number((partNum * BigInt(10000)) / totalNum) / 100;
}
