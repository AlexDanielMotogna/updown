import { NormalizedPriceTick } from './types';

/**
 * Market Data Provider Interface
 *
 * All providers must implement this interface to ensure
 * consistent behavior across different data sources.
 */
export interface IMarketDataProvider {
  /**
   * Provider identifier
   */
  readonly name: string;

  /**
   * Get current spot price for an asset
   */
  getSpotPrice(symbol: string): Promise<NormalizedPriceTick>;

  /**
   * Subscribe to real-time price updates
   * Returns an unsubscribe function
   */
  subscribePrice(
    symbol: string,
    callback: (tick: NormalizedPriceTick) => void
  ): () => void;

  /**
   * Check if provider supports a given asset
   */
  supportsAsset(symbol: string): boolean;

  /**
   * Get list of supported assets
   */
  getSupportedAssets(): string[];

  /**
   * Health check
   */
  isHealthy(): Promise<boolean>;

  /**
   * Cleanup resources
   */
  disconnect(): Promise<void>;
}

/**
 * Factory function type for creating providers
 */
export type MarketDataProviderFactory = (config: ProviderConfig) => IMarketDataProvider;

export interface ProviderConfig {
  apiKey?: string;
  apiUrl?: string;
  wsUrl?: string;
  timeout?: number;
}
