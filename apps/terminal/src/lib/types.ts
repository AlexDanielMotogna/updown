/** Client-safe shared types (no server/exchange imports). Mirror exchange-core. */
export type OrderSide = 'BUY' | 'SELL';
export type OrderType =
  | 'MARKET'
  | 'LIMIT'
  | 'STOP_MARKET'
  | 'STOP_LIMIT'
  | 'TAKE_PROFIT_MARKET'
  | 'TAKE_PROFIT_LIMIT';

export interface Ticker {
  symbol: string;
  mark: string;
  index: string; // oracle price
  change24h: string; // 24h change %
  volume24h: string;
  openInterest: string; // in base units (× mark for notional)
  funding: string;
  maxLeverage: number | null;
  /** Base-size decimals (spot only) — needed to size orders without rounding to 0. */
  szDecimals?: number;
  /** Human label for spot pairs (e.g. "HYPE/USDC"); `symbol` is the HL coin ("@N"). */
  displayName?: string;
}
