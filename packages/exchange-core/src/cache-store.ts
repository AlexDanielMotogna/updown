/**
 * exchange-core — cache store abstraction
 *
 * `CachedExchangeAdapter` depends on this minimal interface, NOT on ioredis, so
 * exchange-core stays framework-agnostic (the golden rule from ADR-001). The
 * consumer (e.g. apps/terminal API) injects a concrete store: an ioredis-backed
 * one in production, or the `InMemoryCacheStore` below for dev/tests.
 *
 * Implementations should be fail-open friendly — the adapter wraps every call
 * in try/catch + timeout and falls through to the live exchange on error, so a
 * store may throw/reject without breaking reads.
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  /** Set `key` to `value` with a TTL in **seconds**. */
  setex(key: string, ttlSeconds: number, value: string): Promise<void>;
  del(...keys: string[]): Promise<void>;
}

interface Entry {
  value: string;
  expiresAt: number; // epoch ms
}

/**
 * In-process cache with TTL. Intended for dev/tests and single-process
 * deployments. Not shared across instances — use an ioredis-backed store in
 * production. Takes a `now()` clock so tests can control expiry deterministically
 * (the runtime forbids Date.now() in some contexts; default uses it lazily).
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly map = new Map<string, Entry>();

  constructor(private readonly now: () => number = () => Date.now()) {}

  async get(key: string): Promise<string | null> {
    const entry = this.map.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.map.delete(key);
      return null;
    }
    return entry.value;
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<void> {
    this.map.set(key, { value, expiresAt: this.now() + ttlSeconds * 1000 });
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.map.delete(key);
  }
}
