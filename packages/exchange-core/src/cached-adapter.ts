/**
 * exchange-core — CachedExchangeAdapter
 *
 * Read-through cache decorator over any `ExchangeReadAdapter` (doc 18 §4).
 * Intentionally **fail-open**: every store op is wrapped in a timeout + try/catch
 * and falls through to the underlying adapter on error. Cache problems degrade
 * to direct exchange calls; they never throw.
 *
 * Account reads additionally collapse concurrent identical requests into one
 * in-flight fetch (dedup) to avoid thundering herds.
 *
 * Cache keys are namespaced by adapter name, e.g. `hyperliquid:account:<addr>`.
 */
import type { CacheStore } from './cache-store';
import type { ExchangeReadAdapter } from './read-adapter';
import type {
  Account,
  AccountSetting,
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

export interface CacheTtlConfig {
  markets: number;
  prices: number;
  orderbook: number;
  klines: number;
  recentTrades: number;
  account: number;
  positions: number;
  openOrders: number;
  tradeHistory: number;
  accountSettings: number;
}

/** Defaults mirror doc 18 §4 (seconds). */
export const DEFAULT_TTLS: CacheTtlConfig = {
  markets: 300,
  prices: 5,
  orderbook: 3,
  klines: 60,
  recentTrades: 5,
  account: 5,
  positions: 5,
  openOrders: 3,
  tradeHistory: 10,
  accountSettings: 60,
};

const STORE_TIMEOUT_MS = 1000;

export class CachedExchangeAdapter implements ExchangeReadAdapter {
  readonly name: ExchangeName;
  readonly version: string;

  private readonly ttls: CacheTtlConfig;
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly inner: ExchangeReadAdapter,
    private readonly store: CacheStore,
    ttls: Partial<CacheTtlConfig> = {}
  ) {
    this.name = inner.name;
    this.version = inner.version;
    this.ttls = { ...DEFAULT_TTLS, ...ttls };
  }

  // --- Market data ---

  getMarkets(): Promise<Market[]> {
    return this.withCache('markets:all', this.ttls.markets, () => this.inner.getMarkets());
  }

  getPrices(): Promise<Price[]> {
    return this.withCache('prices:all', this.ttls.prices, () => this.inner.getPrices());
  }

  getOrderbook(symbol: string, aggLevel?: number): Promise<Orderbook> {
    const key = `orderbook:${symbol}:${aggLevel ?? 0}`;
    return this.withCache(key, this.ttls.orderbook, () => this.inner.getOrderbook(symbol, aggLevel));
  }

  getKlines(params: KlineParams): Promise<Candle[]> {
    const key = `klines:${params.symbol}:${params.interval}:${params.startTime ?? ''}:${params.endTime ?? ''}`;
    return this.withCache(key, this.ttls.klines, () => this.inner.getKlines(params));
  }

  getRecentTrades(symbol: string): Promise<RecentTrade[]> {
    const key = `trades:recent:${symbol}`;
    return this.withCache(key, this.ttls.recentTrades, () => this.inner.getRecentTrades(symbol));
  }

  // --- Account data (deduped) ---

  getAccount(accountId: string): Promise<Account> {
    const key = `account:${accountId}`;
    return this.withCacheAndDedup(key, this.ttls.account, () => this.inner.getAccount(accountId));
  }

  getPositions(accountId: string): Promise<Position[]> {
    const key = `positions:${accountId}`;
    return this.withCacheAndDedup(key, this.ttls.positions, () => this.inner.getPositions(accountId));
  }

  getOpenOrders(accountId: string): Promise<Order[]> {
    const key = `orders:${accountId}`;
    return this.withCacheAndDedup(key, this.ttls.openOrders, () => this.inner.getOpenOrders(accountId));
  }

  getTradeHistory(params: TradeHistoryParams): Promise<TradeHistoryItem[]> {
    const key = `trades:history:${params.accountId}:${params.symbol ?? ''}:${params.startTime ?? ''}`;
    return this.withCache(key, this.ttls.tradeHistory, () => this.inner.getTradeHistory(params));
  }

  getAccountSettings(accountId: string): Promise<AccountSetting[]> {
    const key = `settings:${accountId}`;
    return this.withCache(key, this.ttls.accountSettings, () => this.inner.getAccountSettings(accountId));
  }

  // --- Invalidation (call after a write completes for an account) ---

  async invalidateAccount(accountId: string): Promise<void> {
    await this.safeStore(() =>
      this.store.del(
        this.k(`account:${accountId}`),
        this.k(`positions:${accountId}`),
        this.k(`orders:${accountId}`)
      )
    );
  }

  async invalidateAccountSettings(accountId: string): Promise<void> {
    await this.safeStore(() => this.store.del(this.k(`settings:${accountId}`)));
  }

  // --- Internals ---

  private k(key: string): string {
    return `${this.name}:${key}`;
  }

  private async withCache<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const fullKey = this.k(key);
    const cached = await this.safeStore(() => this.store.get(fullKey));
    if (cached != null) {
      try {
        return JSON.parse(cached) as T;
      } catch {
        // Corrupt entry — fall through to a live fetch.
      }
    }
    const fresh = await fetcher();
    // Fire-and-forget write; never block or throw on cache failure.
    void this.safeStore(() => this.store.setex(fullKey, ttl, JSON.stringify(fresh)));
    return fresh;
  }

  private withCacheAndDedup<T>(key: string, ttl: number, fetcher: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    const promise = this.withCache(key, ttl, fetcher).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  /** Run a store op with a timeout; swallow errors (fail-open). */
  private async safeStore<T>(op: () => Promise<T>): Promise<T | null> {
    try {
      return await this.withTimeout(op(), STORE_TIMEOUT_MS);
    } catch {
      return null;
    }
  }

  private withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cache store timeout')), ms);
      p.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        }
      );
    });
  }
}
