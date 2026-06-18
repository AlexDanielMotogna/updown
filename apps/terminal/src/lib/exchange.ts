/**
 * Server-side exchange access for the terminal.
 *
 * Importing 'exchange-hyperliquid' self-registers it with ExchangeProvider, but
 * the default factory uses mainnet; here we honor the configured endpoint
 * (HYPERLIQUID_API_URL / NEXT_PUBLIC_HYPERLIQUID_API_URL → testnet vs mainnet).
 *
 * Keep this module server-only: it pulls the full adapter (incl. the signer/SDK).
 * Client realtime should use a thin stream import, not this.
 */
import 'exchange-hyperliquid';
import {
  HyperliquidReadAdapter,
  MAINNET,
  TESTNET,
  type HlEndpoint,
} from 'exchange-hyperliquid';
import type { ExchangeReadAdapter } from 'exchange-core';
import type { Ticker } from './types';

export type { Ticker } from './types';

export function hlEndpoint(): HlEndpoint {
  const url = process.env.HYPERLIQUID_API_URL ?? process.env.NEXT_PUBLIC_HYPERLIQUID_API_URL;
  if (url) return { apiUrl: url.replace(/\/$/, '') };
  return process.env.NEXT_PUBLIC_HYPERLIQUID_TESTNET === 'true' ? TESTNET : MAINNET;
}

let cached: ExchangeReadAdapter | null = null;

/** Cached HyperLiquid read adapter bound to the configured endpoint. */
export function readAdapter(): ExchangeReadAdapter {
  if (!cached) cached = new HyperliquidReadAdapter({ endpoint: hlEndpoint() });
  return cached;
}

/** Normalized tickers (markets ⨝ prices), sorted by 24h volume desc. */
export async function getTickers(): Promise<Ticker[]> {
  const a = readAdapter();
  const [markets, prices] = await Promise.all([a.getMarkets(), a.getPrices()]);
  const lev = new Map(markets.map((m) => [m.symbol, m.maxLeverage]));
  return prices
    .map((p) => ({
      symbol: p.symbol,
      mark: p.mark,
      change24h: p.change24h,
      volume24h: p.volume24h,
      maxLeverage: lev.get(p.symbol) ?? null,
    }))
    .sort((x, y) => Number(y.volume24h) - Number(x.volume24h));
}
