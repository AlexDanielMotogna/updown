/**
 * Normalized price tick - standard format for all providers
 */
export interface NormalizedPriceTick {
  /** Asset symbol (e.g., "BTC", "ETH") */
  symbol: string;

  /** Price in USDC with 6 decimal precision (as bigint) */
  price: bigint;

  /** Timestamp of the price */
  timestamp: Date;

  /** Provider source identifier */
  source: string;

  /** Hash of raw response for audit trail */
  rawHash?: string;
}

/**
 * Price snapshot for storage
 */
export interface PriceSnapshotData {
  symbol: string;
  price: string;
  timestamp: Date;
  source: string;
  rawResponseHash: string | null;
  rawResponse?: string;
}

/**
 * Market data error types
 */
export enum MarketDataErrorCode {
  ASSET_NOT_SUPPORTED = 'ASSET_NOT_SUPPORTED',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED = 'RATE_LIMITED',
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}

export class MarketDataError extends Error {
  constructor(
    public code: MarketDataErrorCode,
    message: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'MarketDataError';
  }
}
