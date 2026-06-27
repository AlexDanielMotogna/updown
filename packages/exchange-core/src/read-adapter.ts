/**
 * exchange-core — read face (server-side)
 *
 * Market data + account *reads*. No signing, no writes (those live on the
 * `ExchangeSigner` face). This is the interface `CachedExchangeAdapter`
 * decorates and `ExchangeProvider.read()` returns.
 *
 * Account methods are keyed by `accountId` — the exchange's *real* account
 * address (e.g. the user's EVM address on HyperLiquid), NEVER an agent/API
 * wallet address. See ADR-003: querying with the agent address returns empty.
 */
import type {
  Account,
  AccountSetting,
  Balance,
  Candle,
  ExchangeName,
  KlineParams,
  Market,
  Order,
  Orderbook,
  Position,
  Price,
  RecentTrade,
  TradeHistoryItem,
  TradeHistoryParams,
} from './types';

export interface ExchangeReadAdapter {
  readonly name: ExchangeName;
  readonly version: string;

  // --- Public market data (no auth) ---
  getMarkets(): Promise<Market[]>;
  getPrices(): Promise<Price[]>;
  getOrderbook(symbol: string, aggLevel?: number): Promise<Orderbook>;
  getKlines(params: KlineParams): Promise<Candle[]>;
  getRecentTrades(symbol: string): Promise<RecentTrade[]>;

  // --- Account data (read; identified by the real account address) ---
  getAccount(accountId: string): Promise<Account>;
  getPositions(accountId: string): Promise<Position[]>;
  getOpenOrders(accountId: string): Promise<Order[]>;
  getTradeHistory(params: TradeHistoryParams): Promise<TradeHistoryItem[]>;
  getAccountSettings(accountId: string): Promise<AccountSetting[]>;

  // --- Spot (optional; only exchanges that support spot implement these) ---
  /** Spot markets (token pairs). `kind: 'spot'`, maxLeverage 0. */
  getSpotMarkets?(): Promise<Market[]>;
  /** Spot token balances (holdings) for the real account address. */
  getSpotBalances?(accountId: string): Promise<Balance[]>;
}
