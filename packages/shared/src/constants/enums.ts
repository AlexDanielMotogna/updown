export const INTERVALS = ['15m', '1h', '24h'] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
};

export const INTERVAL_LABELS: Record<Interval, string> = {
  '15m': '15 Minutes',
  '1h': '1 Hour',
  '24h': '24 Hours',
};

export const USDC_DECIMALS = 6;
export const PRICE_DECIMALS = 8;

export const MIN_DEPOSIT_USDC = 1; // 1 USDC minimum
export const MAX_DEPOSIT_USDC = 10000; // 10,000 USDC maximum
