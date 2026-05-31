/**
 * Auto-claim - scheduler-driven payouts for normal two-sided pool winners.
 *
 * Mirrors the autoRefundBets pattern in onchain-tx.ts:
 *  - Authority signs (post-Phase-1 claim.rs accepts authority-only).
 *  - 3 attempts per bet with exponential backoff (2s, 4s).
 *  - Optimistic DB lock: `updateMany where claimed=false` so manual-claim
 *    racing wins are absorbed gracefully (no double-award).
 *  - Permanent failure flips Bet.payoutFailed=true, leaving the manual
 *    claim button visible in the UI as a fallback.
 *
 * Refunds (single bettor, one-sided, no strike) are NOT handled here -
 * they already flow through autoRefundBets in onchain-tx.ts.
 */

import { PublicKey, Transaction } from '@solana/web3.js';
import { getAssociatedTokenAddress, getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import {
  getPoolPDA,
  getVaultPDA,
  getUserBetPDA,
  buildClaimIx,
  sideToIndex,
  type SideLabel,
} from 'solana-client';
import { derivePoolSeed, getUsdcMint, getConnection } from '../utils/solana';
import { resolveFeeBps, calculatePayout } from '../utils/payout';
import { getDistinctBettorWallets } from '../utils/bets';
import { awardBetWin, awardClaimCompleted } from '../services/rewards';
import { notifyBetPaid } from '../services/notifications';
import { emitBetPaid } from '../websocket';
import { ResolverDeps, logEvent, handleRpcError } from './resolver-types';

const AUTO_CLAIM_MAX_RETRIES = 3;

export interface AutoClaimPool {
  id: string;
  asset: string;
  poolType: string;
  winner: string | null;
  homeTeam?: string | null;
  awayTeam?: string | null;
}

/**
 * Send on-chain claim instruction with authority as the sole signer.
 * Returns the confirmed transaction signature.
 */
export async function claimBetOnChain(
  deps: ResolverDeps,
  pool: { id: string },
  walletAddress: string,
  side: SideLabel,
  feeBps: number,
): Promise<string> {
  const connection = getConnection();
  const seed = derivePoolSeed(pool.id);
  const [poolPda] = getPoolPDA(seed);
  const [vaultPda] = getVaultPDA(seed);
  const user = new PublicKey(walletAddress);
  const sideIdx = sideToIndex(side);
  const [userBetPda] = getUserBetPDA(poolPda, user, sideIdx);

  // Ensure the user's USDC ATA exists. Authority pays the rent (~0.002 SOL,
  // recoverable when the user later closes the account).
  const userTokenAccount = (await getOrCreateAssociatedTokenAccount(
    connection,
    deps.wallet,
    getUsdcMint(),
    user,
  )).address;

  const feeWallet = await getAssociatedTokenAddress(getUsdcMint(), deps.wallet.publicKey);

  const ix = buildClaimIx(
    poolPda,
    userBetPda,
    vaultPda,
    userTokenAccount,
    user,
    deps.wallet.publicKey,
    feeWallet,
    feeBps,
    sideIdx,
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
    throw new Error(`claim tx failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
  }

  return signature;
}

export interface AutoClaimResult {
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number; // bets that were already claimed by another writer
}

/**
 * Iterate all unclaimed winning-side bets for a pool and pay each one with
 * an authority-signed claim instruction. Idempotent - safe to invoke
 * multiple times on the same pool; each bet is locked via updateMany.
 *
 * Hedged users (a wallet with bets on both UP and DOWN of a 3-way pool)
 * only get the winning-side bet paid here; the losing-side row simply
 * stays at claimed=false forever, exactly as parimutuel losers do today.
 */
export async function autoClaimBets(
  deps: ResolverDeps,
  pool: AutoClaimPool,
): Promise<AutoClaimResult> {
  if (!pool.winner) return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };

  const winningBets = await deps.prisma.bet.findMany({
    where: {
      poolId: pool.id,
      side: pool.winner as 'UP' | 'DOWN' | 'DRAW',
      claimed: false,
      payoutFailed: false,
    },
    select: { id: true, walletAddress: true, side: true, amount: true },
  });

  if (winningBets.length === 0) {
    return { attempted: 0, succeeded: 0, failed: 0, skipped: 0 };
  }

  // Read the totals once for the server-side payout calculation that mirrors
  // the on-chain transfer. Same numbers the contract uses: payout =
  // (stake × totalPool) / sideTotal − fee (fee waived if 1 distinct bettor).
  const poolRow = await deps.prisma.pool.findUnique({
    where: { id: pool.id },
    select: { totalUp: true, totalDown: true, totalDraw: true },
  });
  const distinctWallets = (await getDistinctBettorWallets(pool.id)).length;

  const startedAt = Date.now();
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  console.log(`[AutoClaim] Pool ${pool.id}: ${winningBets.length} winning bet(s) to pay`);

  for (const bet of winningBets) {
    // Fresh re-check so a manual claim that landed between findMany and
    // now doesn't get double-paid.
    const fresh = await deps.prisma.bet.findUnique({
      where: { id: bet.id },
      select: { claimed: true, payoutFailed: true },
    });
    if (!fresh || fresh.claimed || fresh.payoutFailed) {
      skipped++;
      continue;
    }

    const feeBps = await resolveFeeBps(deps.prisma, bet.walletAddress);

    let claimedSignature: string | null = null;
    let lastError: string | null = null;

    for (let attempt = 1; attempt <= AUTO_CLAIM_MAX_RETRIES; attempt++) {
      try {
        const txSig = await claimBetOnChain(
          deps,
          pool,
          bet.walletAddress,
          bet.side as SideLabel,
          feeBps,
        );

        // Mirror the on-chain payout math server-side and persist it. Without
        // this, backend aggregations like `totalWon` (sum of payoutAmount on
        // the user profile) miss auto-paid bets entirely - only refunds
        // (which autoRefundBets already stores) show up in the Net P&L card,
        // so the header desyncs from the table.
        const { payout: payoutAmount } = poolRow
          ? calculatePayout({
              betAmount: bet.amount,
              totalUp: poolRow.totalUp,
              totalDown: poolRow.totalDown,
              totalDraw: poolRow.totalDraw,
              side: bet.side as 'UP' | 'DOWN' | 'DRAW',
              betCount: distinctWallets,
              feeBps,
            })
          : { payout: bet.amount };

        // Optimistic lock - manual confirm-claim may have already updated
        // the row; in that case updateMany returns count=0 and we skip
        // the rewards (they were already granted by confirm-claim).
        const updated = await deps.prisma.bet.updateMany({
          where: { id: bet.id, claimed: false },
          data: {
            claimed: true,
            claimTx: txSig,
            payoutAmount,
            payoutAttempts: { increment: 1 },
            lastAttemptedAt: new Date(),
          },
        });

        if (updated.count === 0) {
          console.log(`[AutoClaim] Bet ${bet.id} already finalised by another writer - skipping rewards`);
          skipped++;
          claimedSignature = 'skipped';
          break;
        }

        claimedSignature = txSig;
        break;
      } catch (err) {
        handleRpcError(err);
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[AutoClaim] Pool ${pool.id} bet ${bet.id} attempt ${attempt}/${AUTO_CLAIM_MAX_RETRIES} failed: ${lastError}`,
        );

        // Record the attempt even on failure so admins can see the trail.
        await deps.prisma.bet.updateMany({
          where: { id: bet.id, claimed: false },
          data: {
            payoutAttempts: { increment: 1 },
            lastAttemptedAt: new Date(),
          },
        }).catch(() => { /* ignore - best-effort attempt counter */ });

        if (attempt < AUTO_CLAIM_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 2000 * attempt));
        }
      }
    }

    if (claimedSignature && claimedSignature !== 'skipped') {
      // Side effects only on a successful first-write - `awardBetWin`
      // itself is idempotent against the bet via the `betId` we pass.
      await logEvent(deps.prisma, 'BET_AUTO_PAID', 'bet', bet.id, {
        poolId: pool.id,
        walletAddress: bet.walletAddress,
        side: bet.side,
        amount: bet.amount.toString(),
        txSignature: claimedSignature,
      });

      emitBetPaid(bet.walletAddress, {
        poolId: pool.id,
        betId: bet.id,
        side: bet.side,
        amount: bet.amount.toString(),
        txSignature: claimedSignature,
      });

      notifyBetPaid(bet.walletAddress, pool, bet.amount, claimedSignature)
        .catch(e => console.warn('[AutoClaim] notifyBetPaid failed:', e instanceof Error ? e.message : e));

      awardBetWin(bet.walletAddress, bet.amount, bet.id)
        .catch(e => console.warn('[AutoClaim] awardBetWin failed:', e instanceof Error ? e.message : e));

      awardClaimCompleted(bet.walletAddress)
        .catch(e => console.warn('[AutoClaim] awardClaimCompleted failed:', e instanceof Error ? e.message : e));

      succeeded++;
    } else if (claimedSignature === 'skipped') {
      // already counted in skipped
    } else {
      // All retries exhausted - mark as permanently failed so the admin
      // panel can surface it and the manual-claim fallback stays visible
      // to the user.
      await deps.prisma.bet.updateMany({
        where: { id: bet.id, claimed: false },
        data: { payoutFailed: true, lastAttemptedAt: new Date() },
      });

      await logEvent(deps.prisma, 'BET_AUTO_PAYOUT_FAILED', 'bet', bet.id, {
        poolId: pool.id,
        walletAddress: bet.walletAddress,
        side: bet.side,
        attempts: AUTO_CLAIM_MAX_RETRIES.toString(),
        error: lastError ?? 'unknown',
      });

      failed++;
    }
  }

  const durationMs = Date.now() - startedAt;
  console.log(
    `[AutoClaim] Pool ${pool.id} done in ${durationMs}ms - ` +
    `${succeeded} paid · ${failed} failed · ${skipped} skipped`,
  );

  return { attempted: winningBets.length, succeeded, failed, skipped };
}
