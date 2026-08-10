import { IMarketDataProvider } from './providers/interface';
import { PacificaProvider } from './providers/pacifica';
import { HyperliquidProvider } from './providers/hyperliquid';

/**
 * Pick the price provider from env. Default stays `pacifica` so nothing changes
 * until MARKET_DATA_PROVIDER is flipped. Set MARKET_DATA_PROVIDER=hyperliquid
 * (or `hl`) to source pool prices from Hyperliquid instead.
 */
export function getMarketDataProvider(): IMarketDataProvider {
  const choice = (process.env.MARKET_DATA_PROVIDER || 'pacifica').toLowerCase().trim();
  if (choice === 'hyperliquid' || choice === 'hl') return new HyperliquidProvider();
  return new PacificaProvider();
}
