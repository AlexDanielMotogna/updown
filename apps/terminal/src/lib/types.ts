/** Client-safe shared types (no server/exchange imports). */
export interface Ticker {
  symbol: string;
  mark: string;
  change24h: string;
  volume24h: string;
  maxLeverage: number | null;
}
