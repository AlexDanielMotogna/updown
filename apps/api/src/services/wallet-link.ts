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

export type LinkWalletResult =
  | { conflict: true; ownerUserId: string }
  | { conflict: false; link: { chain: string; address: string } };

/**
 * Link a wallet to a user — **re-linkable** (model i: each Solana wallet is its
 * own account; the EVM/trading wallet FOLLOWS whichever account is connecting it
 * now). Re-linking the same `(chain, address)` to a different user REASSIGNS it
 * (the upsert update sets `userId`), instead of rejecting. Idempotent for the
 * same user. Never returns a conflict — kept in the result type for callers that
 * still branch on it (those paths are now dead but harmless).
 */
export async function linkWallet(input: LinkWalletInput): Promise<LinkWalletResult> {
  const address = normalize(input.chain, input.address);
  const data = {
    userId: input.userId,
    source: input.source ?? null,
    isPrimary: input.isPrimary ?? false,
  };
  const link = await prisma.walletLink.upsert({
    where: { chain_address: { chain: input.chain, address } },
    create: { chain: input.chain, address, ...data },
    update: data, // includes userId → reassigns the wallet to the current account
  });
  return { conflict: false, link: { chain: link.chain, address: link.address } };
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
