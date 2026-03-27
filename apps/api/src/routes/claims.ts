import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { PublicKey, Transaction } from '@solana/web3.js';
import { prisma } from '../db';
import { getPoolPDA, getVaultPDA, getUserBetPDA, buildClaimIx } from 'solana-client';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair, derivePoolSeed } from '../utils/solana';
import { calculatePayout, resolveFeeBps } from '../utils/payout';
import { awardBetWin, awardClaimCompleted } from '../services/rewards';

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

    const bet = await prisma.bet.findUnique({
      where: {
        poolId_walletAddress: {
          poolId: pool.id,
          walletAddress,
        },
      },
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BET_NOT_FOUND',
          message: 'No bet found for this wallet in this pool',
        },
      });
    }

    // Verify pool is resolved/claimable
    if (pool.status !== 'CLAIMABLE' && pool.status !== 'RESOLVED') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'POOL_NOT_CLAIMABLE',
          message: `Pool is in ${pool.status} status, claims only allowed after resolution`,
        },
      });
    }

    // Verify bet is a winner
    if (pool.winner !== bet.side) {
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

    // Derive PDAs
    const seed = derivePoolSeed(pool.id);
    const user = new PublicKey(walletAddress);
    const [poolPDA] = getPoolPDA(seed);
    const [vaultPDA] = getVaultPDA(seed);
    const [userBet] = getUserBetPDA(poolPDA, user);
    const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

    // Get authority keypair and fee wallet (authority's USDC ATA)
    const authority = getAuthorityKeypair();
    const feeWallet = await getAssociatedTokenAddress(getUsdcMint(), authority.publicKey);

    // Calculate fee based on user level
    const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
    const feeBps = await resolveFeeBps(prisma, walletAddress);
    const { grossPayout, fee, payout } = calculatePayout({
      betAmount: bet.amount,
      totalUp: pool.totalUp,
      totalDown: pool.totalDown,
      side: bet.side as 'UP' | 'DOWN',
      betCount,
      feeBps,
    });

    // Build claim instruction with fee
    const ix = buildClaimIx(
      poolPDA,
      userBet,
      vaultPDA,
      userTokenAccount,
      user,
      authority.publicKey,
      feeWallet,
      feeBps,
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

    // Read actual on-chain payout from the user's token balance change
    const pool = bet.pool;
    const userATA = await getAssociatedTokenAddress(getUsdcMint(), new PublicKey(bet.walletAddress));
    const userATAStr = userATA.toBase58();

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];
    const accountKeys = tx.transaction.message.getAccountKeys();

    let payout = BigInt(0);
    for (const postBalance of postBalances) {
      if (postBalance.mint !== getUsdcMint().toBase58()) continue;
      const accountKey = accountKeys.get(postBalance.accountIndex);
      if (!accountKey || accountKey.toBase58() !== userATAStr) continue;

      const preBalance = preBalances.find(
        (pre) => pre.accountIndex === postBalance.accountIndex
      );
      const preAmount = BigInt(preBalance?.uiTokenAmount?.amount || '0');
      const postAmount = BigInt(postBalance.uiTokenAmount.amount);
      if (postAmount > preAmount) {
        payout = postAmount - preAmount;
      }
      break;
    }

    // Fallback: if we can't read on-chain payout, use server-calculated value
    if (payout === BigInt(0)) {
      const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
      const feeBps = await resolveFeeBps(prisma, bet.walletAddress);
      const calc = calculatePayout({
        betAmount: bet.amount,
        totalUp: pool.totalUp,
        totalDown: pool.totalDown,
        side: bet.side as 'UP' | 'DOWN',
        betCount,
        feeBps,
      });
      payout = calc.payout;
    }

    // Update bet as claimed
    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        claimed: true,
        claimTx: txSignature,
        payoutAmount: payout,
      },
    });

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

    // Award win + claim rewards — skip for refunds (payout == bet amount means refund)
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
