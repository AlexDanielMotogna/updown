/**
 * HyperliquidStream — normalized realtime over HL's WebSocket (ADR-001).
 *
 * STUB for Phase 1 step 1 (read adapter only). The next step implements this
 * over wss://api.hyperliquid.xyz/ws subscriptions (l2Book, allMids,
 * webData2/user channels) mapped to exchange-core types.
 */
import type { AccountEvent, ExchangeStream, Orderbook, Price, Unsubscribe } from 'exchange-core';

const NOT_IMPL = 'HyperliquidStream not implemented yet (Phase 1 step 3 — WS subscriptions)';

export class HyperliquidStream implements ExchangeStream {
  readonly name = 'hyperliquid' as const;

  subscribeOrderbook(_symbol: string, _cb: (book: Orderbook) => void): Unsubscribe {
    throw new Error(NOT_IMPL);
  }

  subscribePrices(_cb: (prices: Price[]) => void): Unsubscribe {
    throw new Error(NOT_IMPL);
  }

  subscribeAccount(_accountId: string, _cb: (event: AccountEvent) => void): Unsubscribe {
    throw new Error(NOT_IMPL);
  }
}
