import { describe, expect, it, vi } from 'vitest';
import { CachedExchangeAdapter } from './cached-adapter';
import { InMemoryCacheStore, type CacheStore } from './cache-store';
import type { ExchangeReadAdapter } from './read-adapter';
import type { Account, Market } from './types';

const MARKET: Market = {
  symbol: 'BTC-USD',
  baseAsset: 'BTC',
  quoteAsset: 'USD',
  tickSize: '0.1',
  stepSize: '0.001',
  minOrderSize: '0.001',
  maxOrderSize: '1000',
  minNotional: '10',
  maxLeverage: 50,
  fundingRate: '0',
  fundingInterval: 8,
  metadata: {},
};

const ACCOUNT: Account = {
  accountId: '0xabc',
  balance: '100',
  accountEquity: '100',
  availableToSpend: '100',
  marginUsed: '0',
  unrealizedPnl: '0',
  makerFee: '0',
  takerFee: '0',
  metadata: {},
};

/** Minimal fake read adapter with spy-able fetchers. */
function makeAdapter(overrides: Partial<ExchangeReadAdapter> = {}): ExchangeReadAdapter {
  return {
    name: 'hyperliquid',
    version: 'v1',
    getMarkets: vi.fn(async () => [MARKET]),
    getPrices: vi.fn(async () => []),
    getOrderbook: vi.fn(async () => ({ symbol: 'BTC-USD', bids: [], asks: [], timestamp: 0 })),
    getKlines: vi.fn(async () => []),
    getRecentTrades: vi.fn(async () => []),
    getAccount: vi.fn(async () => ACCOUNT),
    getPositions: vi.fn(async () => []),
    getOpenOrders: vi.fn(async () => []),
    getTradeHistory: vi.fn(async () => []),
    getAccountSettings: vi.fn(async () => []),
    ...overrides,
  };
}

describe('CachedExchangeAdapter', () => {
  it('serves the second read from cache (fetcher called once)', async () => {
    const inner = makeAdapter();
    const cached = new CachedExchangeAdapter(inner, new InMemoryCacheStore());

    expect(await cached.getMarkets()).toEqual([MARKET]);
    expect(await cached.getMarkets()).toEqual([MARKET]);

    expect(inner.getMarkets).toHaveBeenCalledTimes(1);
  });

  it('refetches after the TTL expires', async () => {
    let now = 1_000_000;
    const inner = makeAdapter();
    const cached = new CachedExchangeAdapter(inner, new InMemoryCacheStore(() => now), {
      markets: 10,
    });

    await cached.getMarkets();
    now += 9_000; // within TTL
    await cached.getMarkets();
    expect(inner.getMarkets).toHaveBeenCalledTimes(1);

    now += 2_000; // past the 10s TTL
    await cached.getMarkets();
    expect(inner.getMarkets).toHaveBeenCalledTimes(2);
  });

  it('is fail-open when the store throws', async () => {
    const brokenStore: CacheStore = {
      get: vi.fn(async () => {
        throw new Error('redis down');
      }),
      setex: vi.fn(async () => {
        throw new Error('redis down');
      }),
      del: vi.fn(async () => {
        throw new Error('redis down');
      }),
    };
    const inner = makeAdapter();
    const cached = new CachedExchangeAdapter(inner, brokenStore);

    expect(await cached.getMarkets()).toEqual([MARKET]);
    expect(inner.getMarkets).toHaveBeenCalledTimes(1);
  });

  it('dedupes concurrent account reads into one inflight fetch', async () => {
    let resolveFetch!: (a: Account) => void;
    const getAccount = vi.fn(
      () => new Promise<Account>((res) => { resolveFetch = res; })
    );
    const inner = makeAdapter({ getAccount });
    const cached = new CachedExchangeAdapter(inner, new InMemoryCacheStore());

    const p1 = cached.getAccount('0xabc');
    const p2 = cached.getAccount('0xabc');
    // Let the cache-miss path reach the (shared) inflight fetch before resolving it.
    await new Promise((r) => setTimeout(r, 0));
    resolveFetch(ACCOUNT);

    expect(await p1).toEqual(ACCOUNT);
    expect(await p2).toEqual(ACCOUNT);
    expect(getAccount).toHaveBeenCalledTimes(1);
  });

  it('invalidateAccount forces a refetch', async () => {
    const inner = makeAdapter();
    const store = new InMemoryCacheStore();
    const cached = new CachedExchangeAdapter(inner, store);

    await cached.getAccount('0xabc');
    await cached.getAccount('0xabc');
    expect(inner.getAccount).toHaveBeenCalledTimes(1);

    await cached.invalidateAccount('0xabc');
    await cached.getAccount('0xabc');
    expect(inner.getAccount).toHaveBeenCalledTimes(2);
  });

  it('namespaces keys by adapter name', async () => {
    const store = new InMemoryCacheStore();
    const getSpy = vi.spyOn(store, 'get');
    const cached = new CachedExchangeAdapter(makeAdapter(), store);

    await cached.getMarkets();
    expect(getSpy).toHaveBeenCalledWith('hyperliquid:markets:all');
  });
});
