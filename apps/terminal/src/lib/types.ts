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
  change24h: string;
  volume24h: string;
  funding: string;
  maxLeverage: number | null;
}
