export const INTERVALS = ['1m', '5m', '15m', '1h'] as const;
export type Interval = (typeof INTERVALS)[number];

export const INTERVAL_MS: Record<Interval, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '15m': 15 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

export const INTERVAL_SECONDS: Record<Interval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '1h': 3600,
};

export const INTERVAL_LABELS: Record<Interval, string> = {
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

export const USDC_DECIMALS = 6;
export const PRICE_DECIMALS = 8;

export const MIN_DEPOSIT_USDC = 1; // 1 USDC minimum
export const MAX_DEPOSIT_USDC = 10000; // 10,000 USDC maximum
