import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildResolveIx, buildRefundIx, buildClosePoolIx } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection } from '../utils/solana';
import { emitRefund } from '../websocket';
import { ResolverDeps, REFUND_MAX_RETRIES, logEvent, handleRpcError } from './resolver-types';

/**
 * Send on-chain resolve instruction.
 */
export async function resolvePoolOnChain(
  deps: ResolverDeps,
  poolId: string,
  strikePrice: bigint,
  finalPrice: bigint,
): Promise<string> {
  const connection = getConnection();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);

  console.log(`[Scheduler] Resolving on-chain pool:`);
  console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
  console.log(`[Scheduler]   Strike: ${strikePrice}`);
  console.log(`[Scheduler]   Final: ${finalPrice}`);

  const ix = buildResolveIx(
    poolPda,
    deps.wallet.publicKey,
    strikePrice,
    finalPrice,
  );

  const transaction = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = deps.wallet.publicKey;
  transaction.sign(deps.wallet);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  if (confirmation.value.err) {
    throw new Error(`resolve tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log(`[Scheduler] resolve tx confirmed: ${signature}`);
  return signature;
}

/**
 * Send on-chain close_pool instruction to reclaim rent.
 * Verifies the pool account is actually closed after confirmation.
 */
export async function closePoolOnChain(
  deps: ResolverDeps,
  poolId: string,
): Promise<string> {
  const connection = getConnection();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);

  const ix = buildClosePoolIx(poolPda, vaultPda, deps.wallet.publicKey);

  const transaction = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = deps.wallet.publicKey;
  transaction.sign(deps.wallet);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  if (confirmation.value.err) {
    throw new Error(`close_pool tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  // Verify the pool account is actually closed on-chain
  const poolAccount = await connection.getAccountInfo(poolPda);
  if (poolAccount !== null) {
    throw new Error(`close_pool tx ${signature} confirmed but pool PDA still exists — tx may have been dropped`);
  }

  console.log(`[Scheduler] close_pool tx confirmed & verified: ${signature}`);
  return signature;
}

/**
 * Send on-chain refund instruction for a single bet.
 * Authority signs — no user signature needed.
 */
export async function refundBetOnChain(
  deps: ResolverDeps,
  poolId: string,
  walletAddress: string,
): Promise<string> {
  const connection = getConnection();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const user = new PublicKey(walletAddress);
  const [userBetPda] = getUserBetPDA(poolPda, user);
  const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

  const ix = buildRefundIx(
    poolPda,
    userBetPda,
    vaultPda,
    userTokenAccount,
    user,
    deps.wallet.publicKey,
  );

  const transaction = new Transaction().add(ix);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = deps.wallet.publicKey;
  transaction.sign(deps.wallet);

  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  const confirmation = await connection.confirmTransaction(
    { signature, blockhash, lastValidBlockHeight },
    'confirmed',
  );

  if (confirmation.value.err) {
    throw new Error(`refund tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  console.log(`[Scheduler] refund tx confirmed: ${signature}`);
  return signature;
}

/**
 * Auto-refund bets via on-chain refund instruction (authority-signed).
 * Retries up to REFUND_MAX_RETRIES times per bet. Returns true if ALL bets were refunded.
 */
export async function autoRefundBets(
  deps: ResolverDeps,
  poolId: string,
  bets: Array<{ id: string; walletAddress: string; side: string; amount: bigint; claimed: boolean }>,
): Promise<boolean> {
  const unclaimedBets = bets.filter(b => !b.claimed);
  if (unclaimedBets.length === 0) return true;

  let allSuccess = true;

  for (const bet of unclaimedBets) {
    let success = false;

    for (let attempt = 1; attempt <= REFUND_MAX_RETRIES; attempt++) {
      try {
        const txSig = await refundBetOnChain(deps, poolId, bet.walletAddress);

        // Mark as claimed in DB with tx signature
        await deps.prisma.bet.update({
          where: { id: bet.id },
          data: { claimed: true, payoutAmount: bet.amount, claimTx: txSig },
        });

        await logEvent(deps.prisma, 'BET_AUTO_REFUNDED', 'bet', bet.id, {
          poolId,
          walletAddress: bet.walletAddress,
          amount: bet.amount.toString(),
          attempt: attempt.toString(),
          txSignature: txSig,
        });

        emitRefund(bet.walletAddress, {
          poolId,
          amount: bet.amount.toString(),
          txSignature: txSig,
        });

        console.log(`[Scheduler] Auto-refunded bet ${bet.id} (attempt ${attempt})`);
        success = true;
        break;
      } catch (error) {
        handleRpcError(error);
        console.warn(
          `[Scheduler] Refund attempt ${attempt}/${REFUND_MAX_RETRIES} failed for bet ${bet.id}:`,
          error instanceof Error ? error.message : error,
        );

        if (attempt < REFUND_MAX_RETRIES) {
          // Wait before retry (exponential backoff: 2s, 4s)
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    if (!success) {
      console.error(`[Scheduler] All ${REFUND_MAX_RETRIES} refund attempts failed for bet ${bet.id} — manual claim required`);
      allSuccess = false;
    }
  }

  return allSuccess;
}
