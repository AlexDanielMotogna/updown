import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

/**
 * Read the actual USDC credited to `walletAddress` by a confirmed claim
 * transaction, by diffing the user's token-account balance (post − pre).
 *
 * This is the GROUND TRUTH payout: it already reflects the on-chain
 * time-weighted claim formula and the fee split, so callers must NOT
 * recompute the amount from pool totals (that would re-introduce a plain
 * parimutuel figure that disagrees with what the chain actually paid).
 *
 * Returns the credited amount in micro-USDC, or null when the tx can't be
 * read / shows no credit to the user (caller decides the fallback).
 */
export async function readOnchainClaimPayout(
  connection: Connection,
  txSignature: string,
  walletAddress: string,
  usdcMint: PublicKey,
): Promise<bigint | null> {
  const tx = await connection.getTransaction(txSignature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });
  if (!tx || tx.meta?.err) return null;

  const userATA = (
    await getAssociatedTokenAddress(usdcMint, new PublicKey(walletAddress))
  ).toBase58();
  const mintStr = usdcMint.toBase58();
  const pre = tx.meta?.preTokenBalances || [];
  const post = tx.meta?.postTokenBalances || [];
  const keys = tx.transaction.message.getAccountKeys();

  for (const pb of post) {
    if (pb.mint !== mintStr) continue;
    const key = keys.get(pb.accountIndex);
    if (!key || key.toBase58() !== userATA) continue;
    const preB = pre.find((p) => p.accountIndex === pb.accountIndex);
    const preAmt = BigInt(preB?.uiTokenAmount?.amount || '0');
    const postAmt = BigInt(pb.uiTokenAmount.amount);
    if (postAmt > preAmt) return postAmt - preAmt;
  }
  return null;
}
