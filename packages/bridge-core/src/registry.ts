/**
 * bridge-core — registry / provider.
 *
 * Mirrors ExchangeProvider (ADR-001): a **registration** model, not a hard-coded
 * switch. Each bridge package (e.g. bridge-lifi) calls
 * `BridgeProvider.register('lifi', () => new LifiBridgeAdapter())` on import, so
 * bridge-core never imports a concrete provider and the funding UI depends only
 * on this contract. Swapping the aggregator for `bridge-cctp` later is one
 * registry arm + a default change — zero UI change (ADR-004 §4, §7).
 */
import type { BridgeAdapter } from './bridge-adapter';
import type { BridgeName } from './types';

export interface BridgeProviderConfig {
  /** Rail used when `get()` is called without a name. */
  defaultProvider?: BridgeName;
}

class BridgeRegistry {
  private readonly factories = new Map<BridgeName, () => BridgeAdapter>();
  private readonly cache = new Map<BridgeName, BridgeAdapter>();
  private config: BridgeProviderConfig = {};

  /** A provider package registers its lazy factory on import (side effect). */
  register(name: BridgeName, factory: () => BridgeAdapter): void {
    this.factories.set(name, factory);
  }

  configure(config: BridgeProviderConfig): void {
    this.config = { ...this.config, ...config };
  }

  /** True if a provider has registered under this name. */
  has(name: BridgeName): boolean {
    return this.factories.has(name);
  }

  /** Names of all registered providers (registration order). */
  list(): BridgeName[] {
    return [...this.factories.keys()];
  }

  /** Resolve a bridge adapter. Memoized per name. Omit `name` to use the
   *  configured `defaultProvider`. */
  get(name?: BridgeName): BridgeAdapter {
    const resolved = name ?? this.config.defaultProvider;
    if (!resolved) {
      throw new Error(
        'BridgeProvider.get: no name given and no defaultProvider configured. Call BridgeProvider.configure({ defaultProvider }).'
      );
    }
    const memo = this.cache.get(resolved);
    if (memo) return memo;

    const factory = this.factories.get(resolved);
    if (!factory) {
      throw new Error(
        `Bridge "${resolved}" is not registered. Import its package (e.g. bridge-${resolved}) so it self-registers.`
      );
    }
    const adapter = factory();
    this.cache.set(resolved, adapter);
    return adapter;
  }

  /** Test/HMR helper — drops memoized instances (keeps registrations + config). */
  clearCache(): void {
    this.cache.clear();
  }
}

/** Singleton provider shared across the process. */
export const BridgeProvider = new BridgeRegistry();
