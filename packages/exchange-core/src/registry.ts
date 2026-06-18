/**
 * exchange-core — registry / provider
 *
 * Resolves the read / signer / stream faces for an exchange by name. Uses a
 * **registration** model rather than a hard-coded switch: each exchange package
 * (e.g. exchange-hyperliquid) calls `ExchangeProvider.register('hyperliquid', …)`
 * on import. This keeps the golden rule from ADR-001 — exchange-core never
 * imports a concrete adapter, and apps/terminal depends only on this contract.
 *
 * Adding Binance = a new package that registers itself + import it for side
 * effects. Zero changes here, zero UI changes.
 */
import { CachedExchangeAdapter, type CacheTtlConfig } from './cached-adapter';
import type { CacheStore } from './cache-store';
import type { ExchangeReadAdapter } from './read-adapter';
import type { ExchangeSigner } from './signer';
import type { ExchangeStream } from './stream';
import type { ExchangeName } from './types';

/** Lazy factories so nothing is constructed until first use. */
export interface ExchangeFactories {
  read: () => ExchangeReadAdapter;
  signer: () => ExchangeSigner;
  stream: () => ExchangeStream;
}

export interface ProviderConfig {
  /** Inject a cache store to enable read caching. Omit = no caching. */
  cacheStore?: CacheStore;
  cacheTtls?: Partial<CacheTtlConfig>;
  /** Fallback exchange when no per-user resolver is set (or it returns nothing). */
  defaultExchange?: ExchangeName;
  /** Maps an app userId → the exchange they trade on (reads the DB in the app). */
  userResolver?: (userId: string) => Promise<ExchangeName>;
}

export interface UserExchange {
  read: ExchangeReadAdapter;
  signer: ExchangeSigner;
  stream: ExchangeStream;
}

class Registry {
  private readonly factories = new Map<ExchangeName, ExchangeFactories>();
  private readonly readCache = new Map<ExchangeName, ExchangeReadAdapter>();
  private readonly signerCache = new Map<ExchangeName, ExchangeSigner>();
  private readonly streamCache = new Map<ExchangeName, ExchangeStream>();
  private config: ProviderConfig = {};

  register(name: ExchangeName, factories: ExchangeFactories): void {
    this.factories.set(name, factories);
  }

  configure(config: ProviderConfig): void {
    this.config = { ...this.config, ...config };
    // Cache settings changed → drop memoized read adapters so the new store applies.
    this.readCache.clear();
  }

  /** Read face, wrapped in CachedExchangeAdapter when a cache store is configured. */
  read(name: ExchangeName): ExchangeReadAdapter {
    const memo = this.readCache.get(name);
    if (memo) return memo;

    let adapter = this.factoriesFor(name).read();
    if (this.config.cacheStore) {
      adapter = new CachedExchangeAdapter(adapter, this.config.cacheStore, this.config.cacheTtls);
    }
    this.readCache.set(name, adapter);
    return adapter;
  }

  signer(name: ExchangeName): ExchangeSigner {
    const memo = this.signerCache.get(name);
    if (memo) return memo;
    const signer = this.factoriesFor(name).signer();
    this.signerCache.set(name, signer);
    return signer;
  }

  stream(name: ExchangeName): ExchangeStream {
    const memo = this.streamCache.get(name);
    if (memo) return memo;
    const stream = this.factoriesFor(name).stream();
    this.streamCache.set(name, stream);
    return stream;
  }

  /** Resolve all three faces for a given app user. */
  async forUser(userId: string): Promise<UserExchange> {
    const name = await this.resolveExchange(userId);
    return { read: this.read(name), signer: this.signer(name), stream: this.stream(name) };
  }

  /** Test/HMR helper — clears memoized instances (keeps registrations + config). */
  clearCache(): void {
    this.readCache.clear();
    this.signerCache.clear();
    this.streamCache.clear();
  }

  private async resolveExchange(userId: string): Promise<ExchangeName> {
    if (this.config.userResolver) {
      const resolved = await this.config.userResolver(userId);
      if (resolved) return resolved;
    }
    if (this.config.defaultExchange) return this.config.defaultExchange;
    throw new Error(
      'ExchangeProvider.forUser: no userResolver result and no defaultExchange configured'
    );
  }

  private factoriesFor(name: ExchangeName): ExchangeFactories {
    const factories = this.factories.get(name);
    if (!factories) {
      throw new Error(
        `Exchange "${name}" is not registered. Import its package (e.g. exchange-${name}) so it self-registers.`
      );
    }
    return factories;
  }
}

/** Singleton provider shared across the process. */
export const ExchangeProvider = new Registry();
