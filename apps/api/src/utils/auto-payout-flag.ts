/**
 * Auto-payout feature flag - two layers:
 *  1. Global env var AUTO_PAYOUT_ENABLED (defaults to false). Set to "true"
 *     to enable the feature platform-wide. Restart required to take effect.
 *  2. Per-category opt-in via pool_category.config.autoPayoutEnabled.
 *     When the env var is on, individual categories can still be opted out
 *     by setting `autoPayoutEnabled: false` in the config JSON.
 *
 * Rollout pattern: env var ON, then enable categories CRYPTO → SPORTS → PM.
 */

import { prisma } from '../db';

interface PoolForFlag {
  poolType: string;
  league?: string | null;
}

let envCache: boolean | null = null;

function isEnvEnabled(): boolean {
  if (envCache !== null) return envCache;
  envCache = (process.env.AUTO_PAYOUT_ENABLED ?? '').toLowerCase() === 'true';
  return envCache;
}

/**
 * Resolve whether the auto-payout scheduler should process this pool.
 *
 * Returns false when:
 *  - The global env var is off (kill switch).
 *  - The pool's category has explicitly opted out
 *    (config.autoPayoutEnabled === false).
 *
 * If no category is configured for the pool, falls back to "enabled when
 * env var is on" - keeps crypto pools (which don't have a category row)
 * working under the rollout.
 */
export async function autoPayoutEnabledFor(pool: PoolForFlag): Promise<boolean> {
  if (!isEnvEnabled()) return false;

  // Crypto pools don't carry a league string, so they always flow under
  // the global env var.
  if (pool.poolType !== 'SPORTS' || !pool.league) return true;

  try {
    const category = await prisma.poolCategory.findFirst({
      where: { config: { path: ['leagueFilter'], equals: pool.league } },
      select: { config: true, enabled: true },
    });
    if (!category) return true; // no category row = follow env var
    if (!category.enabled) return false;

    // Explicit opt-out lives in the config JSON. Missing key = follow env var.
    const cfg = (category.config ?? {}) as Record<string, unknown>;
    if (cfg.autoPayoutEnabled === false) return false;
    return true;
  } catch (err) {
    console.warn('[AutoPayout] flag lookup failed, falling back to env-only:', err);
    return true;
  }
}

/** Test-only - clears the cached env flag so test suites can flip it. */
export function _resetAutoPayoutFlagCache(): void {
  envCache = null;
}
