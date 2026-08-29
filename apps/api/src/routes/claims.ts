import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { PublicKey, Transaction } from '@solana/web3.js';
import { prisma } from '../db';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildClaimIx, sideToIndex } from 'solana-client';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair, derivePoolSeed } from '../utils/solana';
import { calculatePayout, resolveFeeBps } from '../utils/payout';
import { awardBetWin, awardClaimCompleted } from '../services/rewards';
import { getDistinctBettorWallets } from '../utils/bets';

export const claimsRouter: RouterType = Router();

// Validation schemas
const claimRequestSchema = z.object({
  poolId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
});

const confirmClaimSchema = z.object({
  betId: z.string().uuid(),
  txSignature: z.string().min(64).max(128),
});

/**
 * POST /claim
 * Builds claim transaction with authority co-signature (for fee enforcement).
 * Returns a partially-signed transaction for the frontend to co-sign and send.
 */
claimsRouter.post('/claim', async (req, res) => {
  try {
    const parsed = claimRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const { poolId, walletAddress } = parsed.data;

    // Get pool and bet from database
    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'POOL_NOT_FOUND',
          message: 'Pool not found',
        },
      });
    }

    // Verify pool is resolved/claimable with a winner
    if (pool.status !== 'CLAIMABLE' && pool.status !== 'RESOLVED') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'POOL_NOT_CLAIMABLE',
          message: `Pool is in ${pool.status} status, claims only allowed after resolution`,
        },
      });
    }

    if (!pool.winner) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_WINNER',
          message: 'Pool has no winning side to claim',
        },
      });
    }

    // A wallet may hold positions on multiple sides - claim the WINNING-side row.
    const bet = await prisma.bet.findUnique({
      where: {
        poolId_walletAddress_side: {
          poolId: pool.id,
          walletAddress,
          side: pool.winner,
        },
      },
    });

    if (!bet) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NOT_WINNER',
          message: 'Your bet did not win',
        },
      });
    }

    // Verify not already claimed
    if (bet.claimed) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_CLAIMED',
          message: 'Payout already claimed',
        },
      });
    }

    // Derive PDAs - UserBet is per (pool, user, side); claim the winning side.
    const seed = derivePoolSeed(pool.id);
    const user = new PublicKey(walletAddress);
    const sideIdx = sideToIndex(bet.side);
    const [poolPDA] = getPoolPDA(seed);
    const [vaultPDA] = getVaultPDA(seed);
    const [userBet] = getUserBetPDA(poolPDA, user, sideIdx);
    const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

    // Get authority keypair and fee wallet (authority's USDC ATA)
    const authority = getAuthorityKeypair();
    const feeWallet = await getAssociatedTokenAddress(getUsdcMint(), authority.publicKey);

    // Fee is waived only when there's a single distinct bettor (no counterparty).
    const bettorCount = (await getDistinctBettorWallets(pool.id)).length;
    const feeBps = await resolveFeeBps(prisma, walletAddress);
    const { grossPayout, fee, payout } = calculatePayout({
      betAmount: bet.amount,
      totalUp: pool.totalUp,
      totalDown: pool.totalDown,
      totalDraw: pool.totalDraw,
      side: bet.side as 'UP' | 'DOWN' | 'DRAW',
      betCount: bettorCount,
      feeBps,
    });

    // Build claim instruction with fee (side selects the per-side UserBet account)
    const ix = buildClaimIx(
      poolPDA,
      userBet,
      vaultPDA,
      userTokenAccount,
      user,
      authority.publicKey,
      feeWallet,
      feeBps,
      sideIdx,
    );

    // Build transaction
    const connection = getConnection();
    const transaction = new Transaction().add(ix);
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = user;

    // Authority partially signs (user will co-sign on frontend)
    transaction.partialSign(authority);

    // Serialize with requireAllSignatures: false (user hasn't signed yet)
    const serializedTx = transaction.serialize({ requireAllSignatures: false }).toString('base64');

    res.json({
      success: true,
      data: {
        transaction: serializedTx,
        bet: {
          id: bet.id,
          side: bet.side,
          amount: bet.amount.toString(),
          grossPayout: grossPayout.toString(),
          fee: fee.toString(),
          feeBps,
          expectedPayout: payout.toString(),
        },
      },
    });
  } catch (error) {
    console.error('Error preparing claim:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to prepare claim transaction',
      },
    });
  }
});

/**
 * POST /confirm-claim
 * Verify claim transaction and update bet record.
 * Reads actual on-chain payout from token balance changes.
 */
claimsRouter.post('/confirm-claim', async (req, res) => {
  try {
    const parsed = confirmClaimSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: parsed.error.flatten(),
        },
      });
    }

    const { betId, txSignature } = parsed.data;

    // Get bet from database
    const bet = await prisma.bet.findUnique({
      where: { id: betId },
      include: { pool: true },
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BET_NOT_FOUND',
          message: 'Bet not found',
        },
      });
    }

    if (bet.claimed) {
      if (bet.claimTx === txSignature) {
        return res.json({
          success: true,
          data: {
            betId: bet.id,
            status: 'already_confirmed',
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'ALREADY_CLAIMED',
          message: 'Bet already claimed',
        },
      });
    }

    // Verify transaction on-chain
    const tx = await getConnection().getTransaction(txSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TX_NOT_FOUND',
          message: 'Transaction not found on-chain. It may still be processing.',
        },
      });
    }

    if (tx.meta?.err) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TX_FAILED',
          message: 'Transaction failed on-chain',
          details: tx.meta.err,
        },
      });
    }

    // ── Bind the transaction to THIS bet ─────────────────────────────────────
    // Previously this endpoint accepted ANY successful signature for ANY betId.
    // Bet ids are readable from the unauthenticated GET /api/bets?wallet=…, so
    // anyone could pass a victim's betId plus an arbitrary confirmed signature
    // and flip `claimed`. That permanently removes the bet from the auto-payout
    // queue (scheduler/auto-claim.ts filters on claimed:false), so the winner is
    // never paid, and it also inflates users.totalWon, which feeds the Profit
    // leaderboard. Mirrors the BUG-17 signer guard in deposits.ts.
    const pool = bet.pool;
    const accountKeys = tx.transaction.message.getAccountKeys();

    // 1. The bet owner must have signed the transaction.
    const numSigners = tx.transaction.message.header.numRequiredSignatures;
    let ownerIsSigner = false;
    for (let i = 0; i < numSigners; i++) {
      const key = accountKeys.get(i);
      if (key && key.toBase58() === bet.walletAddress) {
        ownerIsSigner = true;
        break;
      }
    }
    if (!ownerIsSigner) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SIGNER',
          message: 'Bet owner is not a signer of this transaction',
        },
      });
    }

    const mintStr = getUsdcMint().toBase58();
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    /** Signed USDC balance delta for a token account, or null if absent from the tx. */
    const deltaFor = (tokenAccount: string): bigint | null => {
      for (const post of postBalances) {
        if (post.mint !== mintStr) continue;
        const key = accountKeys.get(post.accountIndex);
        if (!key || key.toBase58() !== tokenAccount) continue;
        const pre = preBalances.find((p) => p.accountIndex === post.accountIndex);
        return BigInt(post.uiTokenAmount.amount) - BigInt(pre?.uiTokenAmount?.amount || '0');
      }
      return null;
    };

    // 2. The money must have come out of THIS pool's vault. Without this a real
    //    claim tx from pool A could be replayed to settle a bet in pool B.
    const [vaultPDA] = getVaultPDA(derivePoolSeed(pool.id));
    const vaultDelta = deltaFor(vaultPDA.toBase58());
    if (vaultDelta === null || vaultDelta >= BigInt(0)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'WRONG_POOL',
          message: 'Transaction does not withdraw from this pool vault',
        },
      });
    }

    // 3. The payout is whatever actually landed in the owner's ATA. There is no
    //    server-calculated fallback on purpose: a claim we cannot prove on-chain
    //    must fail and be retried, never be credited on trust.
    const userATA = await getAssociatedTokenAddress(getUsdcMint(), new PublicKey(bet.walletAddress));
    const payout = deltaFor(userATA.toBase58());
    if (payout === null || payout <= BigInt(0)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_PAYOUT_FOUND',
          message: 'No USDC payout to the bet owner found in this transaction',
        },
      });
    }

    // Claim the bet atomically. The `bet.claimed` read above is only a fast
    // path; this conditional write is what actually stops two concurrent
    // confirmations from both crediting totalWon. Same guard as
    // scheduler/auto-claim.ts:224.
    const claimed = await prisma.bet.updateMany({
      where: { id: bet.id, claimed: false },
      data: {
        claimed: true,
        claimTx: txSignature,
        payoutAmount: payout,
      },
    });

    if (claimed.count === 0) {
      // A concurrent request won the race and already credited this bet.
      return res.json({
        success: true,
        data: { betId: bet.id, status: 'already_confirmed' },
      });
    }

    // Lifetime payout total for the leaderboard Profit board
    // (profit = totalWon − totalWagered). Refunds net to zero since the
    // returned stake is already counted in totalWagered.
    await prisma.user.update({
      where: { walletAddress: bet.walletAddress },
      data: { totalWon: { increment: payout } },
    }).catch((e) => console.warn('[Claims] totalWon update failed:', e instanceof Error ? e.message : e));

    // Log event
    await prisma.eventLog.create({
      data: {
        eventType: 'CLAIM_CONFIRMED',
        entityType: 'bet',
        entityId: bet.id,
        payload: {
          poolId: pool.id,
          walletAddress: bet.walletAddress,
          payoutAmount: payout.toString(),
          txSignature,
        },
      },
    });

    // Award win + claim rewards - skip for refunds (payout == bet amount means refund)
    const isRefund = payout === bet.amount;
    if (!isRefund) {
      awardBetWin(bet.walletAddress, bet.amount).catch(e => console.warn('[Claims] awardBetWin failed:', e instanceof Error ? e.message : e));
      awardClaimCompleted(bet.walletAddress).catch(e => console.warn('[Claims] awardClaimCompleted failed:', e instanceof Error ? e.message : e));
    }

    res.json({
      success: true,
      data: {
        betId: bet.id,
        payoutAmount: payout.toString(),
        status: 'confirmed',
      },
    });
  } catch (error) {
    console.error('Error confirming claim:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to confirm claim',
      },
    });
  }
});
