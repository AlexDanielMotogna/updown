import { prisma } from '../db';
import { getAdapter } from '../services/sports';

/** 2s between on-chain transactions to avoid RPC 429s. */
export const TX_DELAY_MS = 2_000;

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Derive the correct adapter based on the pool's league code. */
export function getAdapterForLeague(league: string | null | undefined) {
  if (league?.startsWith('PM_')) return getAdapter('POLYMARKET');
  // Check if it's a registered sport adapter (NBA, NFL, MMA, NHL)
  try {
    return getAdapter(league || 'FOOTBALL');
  } catch {
    return getAdapter('FOOTBALL');
  }
}

/** One row from the unresolved-pools query (full Prisma Pool). */
export type SportsPool = Awaited<ReturnType<typeof prisma.pool.findMany>>[number];
