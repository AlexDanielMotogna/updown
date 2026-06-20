import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryCacheStore } from './cache-store';
import { CachedExchangeAdapter } from './cached-adapter';
import { ExchangeProvider, type ExchangeFactories } from './registry';
import type { ExchangeReadAdapter } from './read-adapter';
import type { ExchangeSigner } from './signer';
import type { ExchangeStream } from './stream';
import type { ExchangeName } from './types';

function fakeFactories(name: ExchangeName): ExchangeFactories {
  const read = {
    name,
    version: 'v1',
    getMarkets: vi.fn(async () => []),
    getPrices: vi.fn(async () => []),
    getOrderbook: vi.fn(async () => ({ symbol: 'X', bids: [], asks: [], timestamp: 0 })),
    getKlines: vi.fn(async () => []),
    getRecentTrades: vi.fn(async () => []),
    getAccount: vi.fn(async () => ({
      accountId: 'x', balance: '0', accountEquity: '0', availableToSpend: '0',
      marginUsed: '0', unrealizedPnl: '0', makerFee: '0', takerFee: '0', metadata: {},
    })),
    getPositions: vi.fn(async () => []),
    getOpenOrders: vi.fn(async () => []),
    getTradeHistory: vi.fn(async () => []),
    getAccountSettings: vi.fn(async () => []),
  } as ExchangeReadAdapter;

  const signer = {
    name,
    chain: 'evm',
    buildOrder: vi.fn(),
    signAndSubmit: vi.fn(),
    cancel: vi.fn(),
    updateLeverage: vi.fn(),
  } as unknown as ExchangeSigner;

  const stream = {
    name,
    subscribeOrderbook: vi.fn(() => () => {}),
    subscribePrices: vi.fn(() => () => {}),
    subscribeAccount: vi.fn(() => () => {}),
  } as ExchangeStream;

  return { read: () => read, signer: () => signer, stream: () => stream };
}

describe('ExchangeProvider', () => {
  beforeEach(() => {
    ExchangeProvider.configure({ cacheStore: undefined, defaultExchange: undefined, userResolver: undefined });
    ExchangeProvider.clearCache();
  });

  it('throws for an unregistered exchange', () => {
    expect(() => ExchangeProvider.read('binance')).toThrow(/not registered/);
  });

  it('resolves and memoizes the three faces', () => {
    ExchangeProvider.register('hyperliquid', fakeFactories('hyperliquid'));

    const r1 = ExchangeProvider.read('hyperliquid');
    const r2 = ExchangeProvider.read('hyperliquid');
    expect(r1).toBe(r2);
    expect(ExchangeProvider.signer('hyperliquid')).toBe(ExchangeProvider.signer('hyperliquid'));
    expect(ExchangeProvider.stream('hyperliquid')).toBe(ExchangeProvider.stream('hyperliquid'));
  });

  it('wraps the read face in CachedExchangeAdapter when a store is configured', () => {
    ExchangeProvider.register('hyperliquid', fakeFactories('hyperliquid'));
    ExchangeProvider.configure({ cacheStore: new InMemoryCacheStore() });

    expect(ExchangeProvider.read('hyperliquid')).toBeInstanceOf(CachedExchangeAdapter);
  });

  it('forUser uses the resolver, falling back to defaultExchange', async () => {
    ExchangeProvider.register('hyperliquid', fakeFactories('hyperliquid'));
    ExchangeProvider.register('pacifica', fakeFactories('pacifica'));

    ExchangeProvider.configure({ userResolver: async () => 'pacifica' });
    expect((await ExchangeProvider.forUser('u1')).read.name).toBe('pacifica');

    ExchangeProvider.configure({ userResolver: undefined, defaultExchange: 'hyperliquid' });
    expect((await ExchangeProvider.forUser('u1')).read.name).toBe('hyperliquid');
  });

  it('forUser throws when nothing can resolve the exchange', async () => {
    await expect(ExchangeProvider.forUser('u1')).rejects.toThrow(/no userResolver/);
  });
});
