import { prisma } from '../../db';

/**
 * Admin toggle for per-interval pool creation (docs/PLAN-POOL-CREATION-TOGGLE.md).
 * Single row; cached briefly so the per-template guard crons don't hit the DB
 * every tick. Disabling an interval stops NEW pool creation for it — existing
 * pools still resolve/close.
 */
export type PoolCreationConfig = {
  allow3m: boolean;
  allow5m: boolean;
  allow15m: boolean;
  allow1h: boolean;
};

const DEFAULTS: PoolCreationConfig = { allow3m: false, allow5m: false, allow15m: false, allow1h: true };
const CACHE_TTL_MS = 30_000;
let cached: PoolCreationConfig | null = null;
let lastFetched = 0;

/** Read (creating defaults on first use) the single config row. */
export async function getPoolCreationConfig() {
  const existing = await prisma.poolCreationConfig.findUnique({ where: { id: 'default' } });
  if (existing) return existing;
  return prisma.poolCreationConfig.create({ data: { id: 'default' } });
}

/** Invalidate the cache (call after an admin update). */
export function invalidatePoolCreationCache(): void {
  lastFetched = 0;
}

/** Whether creating a pool for `intervalKey` ('3m'|'5m'|'15m'|'1h') is allowed. */
export async function isIntervalCreationAllowed(intervalKey: string): Promise<boolean> {
  if (Date.now() - lastFetched >= CACHE_TTL_MS) {
    try {
      const c = await getPoolCreationConfig();
      cached = { allow3m: c.allow3m, allow5m: c.allow5m, allow15m: c.allow15m, allow1h: c.allow1h };
      lastFetched = Date.now();
    } catch {
      // DB hiccup: fall back to last known (or defaults) — never block silently.
    }
  }
  const cfg = cached ?? DEFAULTS;
  switch (intervalKey) {
    case '3m': return cfg.allow3m;
    case '5m': return cfg.allow5m;
    case '15m': return cfg.allow15m;
    case '1h': return cfg.allow1h;
    default: return true; // unknown interval → don't block (other pool types)
  }
}
