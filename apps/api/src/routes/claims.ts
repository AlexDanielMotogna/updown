import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { PublicKey, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { prisma } from '../db';
import { getPoolPDA, getVaultPDA, getUserBetPDA, PROGRAM_ID } from 'solana-client';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { getConnection, getUsdcMint, getAuthorityKeypair, derivePoolIdBytes } from '../utils/solana';
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

const executeClaimSchema = z.object({
  poolId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
});

/**
 * POST /claim
 * Returns account addresses needed to build the claim transaction
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
    const poolIdBytes = derivePoolIdBytes(pool.poolId);
    const user = new PublicKey(walletAddress);
    const [poolPDA] = getPoolPDA(poolIdBytes);
    const [vault] = getVaultPDA(poolIdBytes);
    const [userBet] = getUserBetPDA(poolPDA, user);
    const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

    // Calculate expected payout with level-based fee
    const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
    const feeBps = await resolveFeeBps(prisma, walletAddress);
    const { payout } = calculatePayout({
      betAmount: bet.amount,
      totalUp: pool.totalUp,
      totalDown: pool.totalDown,
      side: bet.side as 'UP' | 'DOWN',
      betCount,
      feeBps,
    });

    res.json({
      success: true,
      data: {
        accounts: {
          pool: poolPDA.toBase58(),
          userBet: userBet.toBase58(),
          vault: vault.toBase58(),
          userTokenAccount: userTokenAccount.toBase58(),
          user: walletAddress,
          tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        },
        programId: PROGRAM_ID.toBase58(),
        bet: {
          id: bet.id,
          side: bet.side,
          amount: bet.amount.toString(),
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
 * Verify claim transaction and update bet record
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

    // Calculate payout with level-based fee
    const pool = bet.pool;
    const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
    const feeBps = await resolveFeeBps(prisma, bet.walletAddress);
    const { payout } = calculatePayout({
      betAmount: bet.amount,
      totalUp: pool.totalUp,
      totalDown: pool.totalDown,
      side: bet.side as 'UP' | 'DOWN',
      betCount,
      feeBps,
    });

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

    // Award win + claim rewards (fire-and-forget)
    awardBetWin(bet.walletAddress, bet.amount).catch(() => {});
    awardClaimCompleted(bet.walletAddress).catch(() => {});

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

/**
 * POST /execute-claim
 * Server-side claim: validates winner, transfers USDC from authority to user, updates DB
 */
claimsRouter.post('/execute-claim', async (req, res) => {
  try {
    const parsed = executeClaimSchema.safeParse(req.body);

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

    // Get pool from database
    const pool = await prisma.pool.findUnique({
      where: { id: poolId },
    });

    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { code: 'POOL_NOT_FOUND', message: 'Pool not found' },
      });
    }

    // Get user's bet
    const bet = await prisma.bet.findUnique({
      where: {
        poolId_walletAddress: { poolId: pool.id, walletAddress },
      },
    });

    if (!bet) {
      return res.status(404).json({
        success: false,
        error: { code: 'BET_NOT_FOUND', message: 'No prediction found for this wallet in this pool' },
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
        error: { code: 'NOT_WINNER', message: 'Your prediction did not win' },
      });
    }

    // Verify not already claimed
    if (bet.claimed) {
      return res.status(400).json({
        success: false,
        error: { code: 'ALREADY_CLAIMED', message: 'Payout already claimed' },
      });
    }

    // Calculate payout with level-based fee
    const betCount = await prisma.bet.count({ where: { poolId: pool.id } });
    const feeBps = await resolveFeeBps(prisma, walletAddress);
    const { payout } = calculatePayout({
      betAmount: bet.amount,
      totalUp: pool.totalUp,
      totalDown: pool.totalDown,
      side: bet.side as 'UP' | 'DOWN',
      betCount,
      feeBps,
    });

    if (payout === 0n) {
      return res.status(400).json({
        success: false,
        error: { code: 'ZERO_PAYOUT', message: 'Payout amount is zero' },
      });
    }

    // Load authority keypair
    let authority;
    try {
      authority = getAuthorityKeypair();
    } catch {
      console.error('[execute-claim] Authority keypair not configured');
      return res.status(500).json({
        success: false,
        error: { code: 'CONFIG_ERROR', message: 'Payout system not configured' },
      });
    }

    // Build USDC transfer: authority → user
    const userPubkey = new PublicKey(walletAddress);
    const authorityATA = await getAssociatedTokenAddress(getUsdcMint(), authority.publicKey);
    const userATA = await getAssociatedTokenAddress(getUsdcMint(), userPubkey);

    const transaction = new Transaction();

    // Set compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    );

    // Create user's ATA if it doesn't exist
    const userATAInfo = await getConnection().getAccountInfo(userATA);
    if (!userATAInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey, // payer
          userATA,             // ata
          userPubkey,          // owner
          getUsdcMint(),       // mint
        ),
      );
    }

    // Transfer USDC from authority to user
    transaction.add(
      createTransferInstruction(
        authorityATA,         // from
        userATA,              // to
        authority.publicKey,  // owner (signer)
        BigInt(payout),       // amount in base units
        [],                   // multiSigners
        TOKEN_PROGRAM_ID,
      ),
    );

    // Sign and send
    const { blockhash, lastValidBlockHeight } = await getConnection().getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = authority.publicKey;
    transaction.sign(authority);

    const signature = await getConnection().sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log(`[execute-claim] Sent payout tx: ${signature}, amount: ${payout}, to: ${walletAddress}`);

    // Wait for confirmation
    const confirmation = await getConnection().confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      'confirmed',
    );

    if (confirmation.value.err) {
      console.error(`[execute-claim] Transaction failed on-chain:`, confirmation.value.err);
      return res.status(500).json({
        success: false,
        error: { code: 'TX_FAILED', message: 'Payout transaction failed on-chain' },
      });
    }

    // Update bet as claimed
    await prisma.bet.update({
      where: { id: bet.id },
      data: {
        claimed: true,
        claimTx: signature,
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
          walletAddress,
          payoutAmount: payout.toString(),
          txSignature: signature,
        },
      },
    });

    console.log(`[execute-claim] Payout confirmed: ${signature}, bet: ${bet.id}`);

    // Award win + claim rewards (fire-and-forget)
    awardBetWin(walletAddress, bet.amount).catch(() => {});
    awardClaimCompleted(walletAddress).catch(() => {});

    res.json({
      success: true,
      data: {
        betId: bet.id,
        payoutAmount: payout.toString(),
        txSignature: signature,
        status: 'confirmed',
      },
    });
  } catch (error) {
    console.error('Error executing claim:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to execute claim',
      },
    });
  }
});
