/**
 * Wallet linking — "one identity, many wallets" (ADR-003). The Solana wallet is
 * the User identity; an EVM wallet links here so the terminal can resolve the
 * same User from a Privy EVM login. `(chain, address)` is unique.
 */
import { prisma } from '../db';

export type WalletChain = 'solana' | 'evm';

function normalize(chain: WalletChain, address: string): string {
  return chain === 'evm' ? address.toLowerCase() : address;
}

export interface LinkWalletInput {
  userId: string;
  chain: WalletChain;
  address: string;
  source?: string;
  isPrimary?: boolean;
}

/** Link (or re-point) a wallet to a user. Idempotent on (chain, address). */
export async function linkWallet(input: LinkWalletInput) {
  const address = normalize(input.chain, input.address);
  const data = {
    userId: input.userId,
    source: input.source ?? null,
    isPrimary: input.isPrimary ?? false,
  };
  return prisma.walletLink.upsert({
    where: { chain_address: { chain: input.chain, address } },
    create: { chain: input.chain, address, ...data },
    update: data,
  });
}

/** Resolve the User a linked wallet belongs to (null if unlinked). */
export async function resolveUserByWallet(chain: WalletChain, address: string) {
  const link = await prisma.walletLink.findUnique({
    where: { chain_address: { chain, address: normalize(chain, address) } },
    select: { user: { select: { id: true, walletAddress: true } } },
  });
  return link?.user ?? null;
}

/** All wallets linked to a user. */
export async function getLinkedWallets(userId: string) {
  return prisma.walletLink.findMany({ where: { userId } });
}
