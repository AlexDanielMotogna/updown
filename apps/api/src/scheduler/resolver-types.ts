import { PrismaClient, Prisma } from '@prisma/client';
import { Connection, Keypair } from '@solana/web3.js';
import { PacificaProvider } from 'market-data';
import { rotateConnection } from '../utils/solana';

/**
 * Dependencies for the on-chain settlement helpers (resolve / refund / close).
 * None of these need a price feed — they act on already-decided outcomes — so
 * callers on the void/refund path (e.g. cancelled sports pools) can build this
 * without a PacificaProvider instead of passing `null as any`.
 */
export interface OnChainDeps {
  prisma: PrismaClient;
  connection: Connection;
  wallet: Keypair;
}

/** OnChainDeps plus the price feed, for the crypto resolver that reads spot. */
export interface ResolverDeps extends OnChainDeps {
  priceProvider: PacificaProvider;
}

export const REFUND_MAX_RETRIES = 3;

export async function logEvent(
  prisma: PrismaClient,
  eventType: string,
  entityType: string,
  entityId: string,
  payload: Record<string, string>,
): Promise<void> {
  await prisma.eventLog.create({
    data: { eventType, entityType, entityId, payload: payload as Prisma.InputJsonValue },
  });
}

export function handleRpcError(error: unknown): void {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    msg.includes('429') ||
    msg.includes('Too Many Requests') ||
    msg.includes('Server responded') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('fetch failed')
  ) {
    rotateConnection();
  }
}
