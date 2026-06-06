/**
 * Single source of truth for "what kind of pool is this" on the client.
 *
 * Polymarket pools are migrating from `poolType: 'SPORTS'` + `league` starting
 * `PM_` to a first-class `poolType: 'POLYMARKET'`. `kindOf` accepts either
 * signal, so it's correct during AND after that migration — replace ad-hoc
 * `poolType !== 'SPORTS'` (crypto) and `league.startsWith('PM_')` (pm) checks
 * with it.
 */
export type PoolKind = 'crypto' | 'sports' | 'pm';

export function kindOf(pool: { poolType?: string | null; league?: string | null }): PoolKind {
  if (pool.poolType === 'POLYMARKET' || pool.league?.startsWith('PM_')) return 'pm';
  if (pool.poolType === 'SPORTS') return 'sports';
  return 'crypto';
}

export const isPm = (pool: { poolType?: string | null; league?: string | null }): boolean => kindOf(pool) === 'pm';
export const isCrypto = (pool: { poolType?: string | null; league?: string | null }): boolean => kindOf(pool) === 'crypto';
export const isSports = (pool: { poolType?: string | null; league?: string | null }): boolean => kindOf(pool) === 'sports';
