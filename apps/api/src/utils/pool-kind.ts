/**
 * Single source of truth for "what kind of pool is this".
 *
 * Polymarket pools are migrating from `poolType: 'SPORTS'` + `league` starting
 * `PM_` to a first-class `poolType: 'POLYMARKET'`. These predicates work during
 * AND after that migration (they accept either signal), so call sites can adopt
 * them now and the data migration can land independently.
 */
export type PoolKindInput = { poolType?: string | null; league?: string | null };

export type PoolKind = 'crypto' | 'sports' | 'pm';

export function isPmPool(p: PoolKindInput): boolean {
  return p.poolType === 'POLYMARKET' || !!p.league?.startsWith('PM_');
}

/** Real sports only — excludes PM markets that currently masquerade as SPORTS. */
export function isSportsPool(p: PoolKindInput): boolean {
  return p.poolType === 'SPORTS' && !p.league?.startsWith('PM_');
}

export function isCryptoPool(p: PoolKindInput): boolean {
  return !isPmPool(p) && p.poolType !== 'SPORTS';
}

export function poolKind(p: PoolKindInput): PoolKind {
  if (isPmPool(p)) return 'pm';
  if (p.poolType === 'SPORTS') return 'sports';
  return 'crypto';
}
