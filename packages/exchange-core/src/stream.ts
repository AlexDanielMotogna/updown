/**
 * exchange-core — stream face (normalized realtime)
 *
 * Browser → exchange WebSocket, normalized to the same types as the read face.
 * Per ADR-001, price/orderbook/account streams go browser → exchange directly
 * (no backend hop) for latency. Account streams are keyed by the real account
 * address (same rule as the read face).
 */
import type { AccountEvent, ExchangeName, Orderbook, Price, RecentTrade } from './types';

export type Unsubscribe = () => void;

export interface ExchangeStream {
  readonly name: ExchangeName;

  subscribeOrderbook(symbol: string, cb: (book: Orderbook) => void): Unsubscribe;
  subscribePrices(cb: (prices: Price[]) => void): Unsubscribe;
  subscribeAccount(accountId: string, cb: (event: AccountEvent) => void): Unsubscribe;
  /** Live market trades, newest-first per batch. */
  subscribeTrades(symbol: string, cb: (trades: RecentTrade[]) => void): Unsubscribe;
}
