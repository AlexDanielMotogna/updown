/**
 * exchange-hyperliquid — HyperLiquid implementation of the exchange-core
 * contract. Importing this package self-registers it with ExchangeProvider:
 *
 *   import 'exchange-hyperliquid';
 *   const markets = await ExchangeProvider.read('hyperliquid').getMarkets();
 *
 * Phase 1 status: read adapter implemented (public `info` endpoint). Signer
 * (EIP-712 agent-wallet) and stream (WS) are stubs — see ./signer, ./stream.
 */
import { ExchangeProvider } from 'exchange-core';
import { HyperliquidReadAdapter } from './read-adapter';
import { HyperliquidSigner } from './signer';
import { HyperliquidStream } from './stream';

ExchangeProvider.register('hyperliquid', {
  read: () => new HyperliquidReadAdapter(),
  signer: () => new HyperliquidSigner(),
  stream: () => new HyperliquidStream(),
});

export { HyperliquidReadAdapter } from './read-adapter';
export type { HyperliquidReadAdapterOptions } from './read-adapter';
export { HyperliquidSigner } from './signer';
export { HyperliquidStream } from './stream';
export type { HyperliquidStreamOptions } from './stream';
export { HyperliquidWsConnection, routingKey } from './ws-connection';
export type { WsLike, WsFactory, Subscription } from './ws-connection';
export { InfoClient, MAINNET, TESTNET } from './info-client';
export type { HlEndpoint, FetchLike } from './info-client';
export * as mappers from './mappers';
export * from './symbols';
export type * from './raw-types';
