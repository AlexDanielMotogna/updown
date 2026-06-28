/**
 * HyperliquidReadAdapter — implements exchange-core's ExchangeReadAdapter over
 * HyperLiquid's public `info` endpoint. Read-only; no signing.
 *
 * Account methods lowercase the EVM address before querying (ADR-003: HL
 * recovers a different signer / returns empty on case mismatch) and use the
 * user's REAL address — never an agent address.
 */
import type {
  Account,
  AccountSetting,
  Balance,
  Candle,
  ExchangeReadAdapter,
  KlineParams,
  Market,
  Order,
  Orderbook,
  Position,
  Price,
  RecentTrade,
  TradeHistoryItem,
  TradeHistoryParams,
} from 'exchange-core';
import { InfoClient, MAINNET, type HlEndpoint, type FetchLike } from './info-client';
import {
  mapAccount,
  mapCandle,
  mapFill,
  mapMarkets,
  mapOpenOrder,
  mapOrderbook,
  mapPositions,
  mapPrices,
  mapRecentTrade,
  mapSpotMarkets,
  mapSpotBalances,
} from './mappers';
import { toHlCoin } from './symbols';

/** Interval string → milliseconds, for defaulting candle start time. */
const INTERVAL_MS: Record<string, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
  '1M': 2_592_000_000,
};

const DEFAULT_CANDLE_LIMIT = 500;

export interface HyperliquidReadAdapterOptions {
  endpoint?: HlEndpoint;
  fetchImpl?: FetchLike;
  /** Clock injection for testable default candle windows. */
  now?: () => number;
}

export class HyperliquidReadAdapter implements ExchangeReadAdapter {
  readonly name = 'hyperliquid' as const;
  readonly version = 'v1';

  private readonly info: InfoClient;
  private readonly now: () => number;

  constructor(opts: HyperliquidReadAdapterOptions = {}) {
    this.info = new InfoClient(opts.endpoint ?? MAINNET, opts.fetchImpl);
    this.now = opts.now ?? (() => Date.now());
  }

  async getMarkets(): Promise<Market[]> {
    const [meta, ctxs] = await this.info.metaAndAssetCtxs();
    return mapMarkets(meta.universe, ctxs);
  }

  async getPrices(): Promise<Price[]> {
    const [meta, ctxs] = await this.info.metaAndAssetCtxs();
    return mapPrices(meta.universe, ctxs, this.now());
  }

  async getOrderbook(symbol: string, aggLevel?: number): Promise<Orderbook> {
    // aggLevel maps to HL's nSigFigs (2..5); undefined/0 = full precision.
    const nSigFigs = aggLevel && aggLevel >= 2 && aggLevel <= 5 ? aggLevel : null;
    const book = await this.info.l2Book(toHlCoin(symbol), nSigFigs);
    return mapOrderbook(book);
  }

  async getKlines(params: KlineParams): Promise<Candle[]> {
    const intervalMs = INTERVAL_MS[params.interval] ?? INTERVAL_MS['1h'];
    const endTime = params.endTime ?? this.now();
    const startTime =
      params.startTime ?? endTime - intervalMs * (params.limit ?? DEFAULT_CANDLE_LIMIT);
    const candles = await this.info.candleSnapshot({
      coin: toHlCoin(params.symbol),
      interval: params.interval,
      startTime,
      endTime,
    });
    return candles.map(mapCandle);
  }

  async getRecentTrades(symbol: string): Promise<RecentTrade[]> {
    const trades = await this.info.recentTrades(toHlCoin(symbol));
    return trades.map(mapRecentTrade);
  }

  async getAccount(accountId: string): Promise<Account> {
    const addr = accountId.toLowerCase();
    const state = await this.info.clearinghouseState(addr);
    return mapAccount(addr, state);
  }

  async getPositions(accountId: string): Promise<Position[]> {
    const state = await this.info.clearinghouseState(accountId.toLowerCase());
    return mapPositions(state);
  }

  async getSpotMarkets(): Promise<Market[]> {
    const [meta, ctxs] = await this.info.spotMetaAndAssetCtxs();
    return mapSpotMarkets(meta, ctxs);
  }

  async getSpotBalances(accountId: string): Promise<Balance[]> {
    const [state, meta] = await Promise.all([
      this.info.spotClearinghouseState(accountId.toLowerCase()),
      this.info.spotMeta(),
    ]);
    return mapSpotBalances(state, meta);
  }

  async getOpenOrders(accountId: string): Promise<Order[]> {
    const orders = await this.info.openOrders(accountId.toLowerCase());
    return orders.map(mapOpenOrder);
  }

  async getTradeHistory(params: TradeHistoryParams): Promise<TradeHistoryItem[]> {
    const fills = await this.info.userFills(params.accountId.toLowerCase());
    let items = fills.map(mapFill);
    if (params.symbol) items = items.filter((i) => i.symbol === params.symbol);
    if (params.startTime != null) {
      const start = params.startTime;
      items = items.filter((i) => i.executedAt >= start);
    }
    if (params.limit != null) items = items.slice(0, params.limit);
    return items;
  }

  /** HL has no per-market leverage-settings endpoint; derive from open positions. */
  async getAccountSettings(accountId: string): Promise<AccountSetting[]> {
    const state = await this.info.clearinghouseState(accountId.toLowerCase());
    return state.assetPositions.map((ap) => ({
      symbol: `${ap.position.coin}-USD`,
      leverage: ap.position.leverage.value,
      metadata: { leverageType: ap.position.leverage.type },
    }));
  }
}
