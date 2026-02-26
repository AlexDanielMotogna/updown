import { NormalizedPriceTick } from '../types';

/**
 * Market data provider interface
 * All price providers must implement this interface
 */
export interface IMarketDataProvider {
  /**
   * Get the current spot price for a symbol
   */
  getSpotPrice(symbol: string): Promise<NormalizedPriceTick>;

  /**
   * Get all available prices (optional)
   */
  getAllPrices?(): Promise<NormalizedPriceTick[]>;

  /**
   * Get cached price for a symbol (optional, from WebSocket updates)
   */
  getCachedPrice?(symbol: string): NormalizedPriceTick | null;

  /**
   * Subscribe to real-time price updates
   */
  subscribe(symbol: string, callback: (tick: NormalizedPriceTick) => void): void;

  /**
   * Unsubscribe from price updates
   */
  unsubscribe(symbol: string): void;

  /**
   * Get provider name
   */
  getName(): string;

  /**
   * Check if provider is healthy
   */
  isHealthy(): Promise<boolean>;

  /**
   * Disconnect and cleanup (optional)
   */
  disconnect?(): void;
}
