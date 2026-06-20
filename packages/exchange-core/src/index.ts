/**
 * exchange-core — the framework-agnostic contract for trading-exchange
 * integrations (HyperLiquid first, then Pacifica, Binance, …).
 *
 * Three faces: ExchangeReadAdapter (server reads, cacheable), ExchangeSigner
 * (client-side, chain-aware signing), ExchangeStream (normalized realtime).
 * Resolved via ExchangeProvider. See docs/Terminal-Migration/ADR-001.
 */
export * from './types';
export * from './read-adapter';
export * from './signer';
export * from './stream';
export * from './cache-store';
export * from './cached-adapter';
export * from './registry';
