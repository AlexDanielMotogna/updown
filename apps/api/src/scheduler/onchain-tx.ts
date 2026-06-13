import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildResolveIx, buildRefundIx, buildRefundBettorIx, buildCloseLosingBetIx, buildSweepVaultDustIx, buildClosePoolIx, sideToIndex, type SideLabel } from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection } from '../utils/solana';
import { sendAndConfirm } from '../utils/onchain';
import { emitRefund } from '../websocket';
import { OnChainDeps, REFUND_MAX_RETRIES, logEvent, handleRpcError } from './resolver-types';

/**
 * Send on-chain resolve instruction.
 */
export async function resolvePoolOnChain(
  deps: OnChainDeps,
  poolId: string,
  strikePrice: bigint,
  finalPrice: bigint,
): Promise<string> {
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);

  console.log(`[Scheduler] Resolving on-chain pool:`);
  console.log(`[Scheduler]   Pool PDA: ${poolPda.toBase58()}`);
  console.log(`[Scheduler]   Strike: ${strikePrice}`);
  console.log(`[Scheduler]   Final: ${finalPrice}`);

  const ix = buildResolveIx(poolPda, deps.wallet.publicKey, strikePrice, finalPrice);

  const signature = await sendAndConfirm(ix, deps.wallet, { label: 'resolve' });
  console.log(`[Scheduler] resolve tx confirmed: ${signature}`);
  return signature;
}

/**
 * Send on-chain close_pool instruction to reclaim rent.
 * Verifies the pool account is actually closed after confirmation.
 */
export async function closePoolOnChain(
  deps: OnChainDeps,
  poolId: string,
): Promise<string> {
  const connection = getConnection();
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);

  const ix = buildClosePoolIx(poolPda, vaultPda, deps.wallet.publicKey);

  const signature = await sendAndConfirm(ix, deps.wallet, { label: 'close_pool' });

  // Verify the pool account is actually closed on-chain
  const poolAccount = await connection.getAccountInfo(poolPda);
  if (poolAccount !== null) {
    throw new Error(`close_pool tx ${signature} confirmed but pool PDA still exists - tx may have been dropped`);
  }

  console.log(`[Scheduler] close_pool tx confirmed & verified: ${signature}`);
  return signature;
}

/**
 * Send on-chain refund instruction for a single bet.
 * Authority signs - no user signature needed.
 */
export async function refundBetOnChain(
  deps: OnChainDeps,
  poolId: string,
  walletAddress: string,
  side: string,
): Promise<string> {
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const user = new PublicKey(walletAddress);
  const sideIdx = sideToIndex(side as SideLabel);
  const [userBetPda] = getUserBetPDA(poolPda, user, sideIdx);
  const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

  const ix = buildRefundIx(poolPda, userBetPda, vaultPda, userTokenAccount, user, deps.wallet.publicKey, sideIdx);

  const signature = await sendAndConfirm(ix, deps.wallet, { label: 'refund' });
  console.log(`[Scheduler] refund tx confirmed: ${signature}`);
  return signature;
}

/**
 * VOID refund of a single bet's own stake (any side) for a cancelled/void pool,
 * via the `refund_bettor` instruction. Unlike refundBetOnChain (winner-take-all),
 * this returns exactly the principal regardless of side — so a multi-side pool
 * can be fully refunded fairly. Authority signs; requires the pool to NOT have a
 * winner yet. Returns the tx signature.
 */
export async function refundBettorOnChain(
  deps: OnChainDeps,
  poolId: string,
  walletAddress: string,
  side: string,
): Promise<string> {
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const user = new PublicKey(walletAddress);
  const sideIdx = sideToIndex(side as SideLabel);
  const [userBetPda] = getUserBetPDA(poolPda, user, sideIdx);
  const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

  const ix = buildRefundBettorIx(poolPda, userBetPda, vaultPda, userTokenAccount, user, deps.wallet.publicKey, sideIdx);

  const signature = await sendAndConfirm(ix, deps.wallet, { label: 'refund_bettor' });
  console.log(`[Scheduler] refund_bettor tx confirmed: ${signature}`);
  return signature;
}

/**
 * Close a single LOSING bet on-chain, returning its rent (~0.0009 SOL) to the
 * bettor. Authority signs; no USDC moves (the loser forfeits only their stake).
 * Requires the `close_losing_bet` program instruction to be deployed.
 */
export async function closeLosingBetOnChain(
  deps: OnChainDeps,
  poolId: string,
  walletAddress: string,
  side: string,
): Promise<string> {
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const user = new PublicKey(walletAddress);
  const sideIdx = sideToIndex(side as SideLabel);
  const [userBetPda] = getUserBetPDA(poolPda, user, sideIdx);

  const ix = buildCloseLosingBetIx(poolPda, userBetPda, user, deps.wallet.publicKey, sideIdx);

  return await sendAndConfirm(ix, deps.wallet, { label: 'close_losing_bet' });
}

/**
 * Sweep rounding dust from a resolved pool's vault to the authority so the vault
 * reaches 0 and the pool can be closed. Authority signs. Requires the
 * `sweep_vault_dust` program instruction to be deployed.
 */
export async function sweepVaultDustOnChain(
  deps: OnChainDeps,
  poolId: string,
): Promise<string> {
  const seed = derivePoolSeed(poolId);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const authorityTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), deps.wallet.publicKey);

  const ix = buildSweepVaultDustIx(poolPda, vaultPda, authorityTokenAccount, deps.wallet.publicKey);

  return await sendAndConfirm(ix, deps.wallet, { label: 'sweep_vault_dust' });
}

/**
 * Auto-refund bets via on-chain refund instruction (authority-signed).
 * Retries up to REFUND_MAX_RETRIES times per bet. Returns true if ALL bets were refunded.
 */
export async function autoRefundBets(
  deps: OnChainDeps,
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
        const txSig = await refundBetOnChain(deps, poolId, bet.walletAddress, bet.side);

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
      console.error(`[Scheduler] All ${REFUND_MAX_RETRIES} refund attempts failed for bet ${bet.id} - manual claim required`);
      allSuccess = false;
    }
  }

  return allSuccess;
}
