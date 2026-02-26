import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { PublicKey, Connection, Keypair, Transaction, ComputeBudgetProgram } from '@solana/web3.js';
import { prisma } from '../db';
import { getPoolPDA, getVaultPDA, getUserBetPDA, PROGRAM_ID } from 'solana-client';
import {
  getAssociatedTokenAddress,
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';

export const transactionsRouter: RouterType = Router();

// Solana connection
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

// USDC mint on devnet (use devnet USDC or create test token)
const USDC_MINT = new PublicKey(process.env.USDC_MINT || 'Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr');

// Load authority keypair for server-signed transactions (claims)
function getAuthorityKeypair(): Keypair {
  // Try direct secret key first
  const secretKey = process.env.AUTHORITY_SECRET_KEY;
  if (secretKey) {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secretKey)));
  }

  // Try loading from file path
  const keypairPath = process.env.AUTHORITY_KEYPAIR_PATH;
  if (keypairPath) {
    const fs = require('fs');
    const path = require('path');
    const resolvedPath = keypairPath.startsWith('~')
      ? path.join(process.env.HOME || '', keypairPath.slice(1))
      : keypairPath;
    const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fileContent)));
  }

  throw new Error('AUTHORITY_SECRET_KEY or AUTHORITY_KEYPAIR_PATH not configured');
}

// Validation schemas
const depositRequestSchema = z.object({
  poolId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
  side: z.enum(['UP', 'DOWN']),
  amount: z.number().positive().max(100000_000000), // Max 100k USDC
});

const confirmDepositSchema = z.object({
  poolId: z.string().uuid(),
  walletAddress: z.string().min(32).max(44),
  txSignature: z.string().min(64).max(128),
  side: z.enum(['UP', 'DOWN']), // Side comes from frontend (verified by user signing)
  // NOTE: amount is NOT accepted from frontend - we verify on-chain
});

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
 * POST /api/transactions/deposit
 * Returns account addresses needed to build the deposit transaction
 */
transactionsRouter.post('/deposit', async (req, res) => {
  try {
    const parsed = depositRequestSchema.safeParse(req.body);

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

    const { poolId, walletAddress, side, amount } = parsed.data;

    // Get pool from database
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

    // Verify pool is in JOINING status
    if (pool.status !== 'JOINING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_POOL_STATUS',
          message: `Pool is in ${pool.status} status, deposits only allowed during JOINING`,
        },
      });
    }

    // Verify lock time hasn't passed
    if (new Date() > pool.lockTime) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'DEPOSIT_DEADLINE_PASSED',
          message: 'Deposit deadline has passed',
        },
      });
    }

    // Check if user already has a bet in this pool
    const existingBet = await prisma.bet.findUnique({
      where: {
        poolId_walletAddress: {
          poolId: pool.id,
          walletAddress,
        },
      },
    });

    if (existingBet) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'BET_EXISTS',
          message: 'You already have a bet in this pool',
        },
      });
    }

    // Generate the pool ID bytes from the string
    const poolIdBytes = Buffer.alloc(32);
    const poolIdHash = Buffer.from(pool.poolId, 'utf-8');
    poolIdHash.copy(poolIdBytes, 0, 0, Math.min(poolIdHash.length, 32));

    // Derive PDAs
    const user = new PublicKey(walletAddress);
    const [poolPDA] = getPoolPDA(poolIdBytes);
    const [vault] = getVaultPDA(poolIdBytes);
    const [userBet] = getUserBetPDA(poolPDA, user);
    const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, user);

    // Return accounts needed for transaction
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
          systemProgram: '11111111111111111111111111111111',
        },
        args: {
          side: side === 'UP' ? { up: {} } : { down: {} },
          amount: amount.toString(),
        },
        programId: PROGRAM_ID.toBase58(),
        pool: {
          id: pool.id,
          poolId: pool.poolId,
          asset: pool.asset,
          lockTime: pool.lockTime.toISOString(),
        },
      },
    });
  } catch (error) {
    console.error('Error preparing deposit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to prepare deposit transaction',
      },
    });
  }
});

/**
 * POST /api/transactions/confirm-deposit
 * Verify transaction on-chain and create bet record
 */
transactionsRouter.post('/confirm-deposit', async (req, res) => {
  try {
    const parsed = confirmDepositSchema.safeParse(req.body);

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

    const { poolId, walletAddress, txSignature, side } = parsed.data;

    // Get pool from database
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

    // Check if bet already exists
    const existingBet = await prisma.bet.findUnique({
      where: {
        poolId_walletAddress: {
          poolId: pool.id,
          walletAddress,
        },
      },
    });

    if (existingBet) {
      // If bet exists with same tx, return success
      if (existingBet.depositTx === txSignature) {
        return res.json({
          success: true,
          data: {
            betId: existingBet.id,
            status: 'already_confirmed',
          },
        });
      }
      return res.status(400).json({
        success: false,
        error: {
          code: 'BET_EXISTS',
          message: 'Bet already exists for this wallet and pool',
        },
      });
    }

    // Verify transaction on-chain
    const tx = await connection.getTransaction(txSignature, {
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

    // Parse the actual transfer amount from on-chain transaction
    // SPL Token transfers show up in pre/post token balances
    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Generate expected vault address
    const poolIdBytes = Buffer.alloc(32);
    const poolIdHash = Buffer.from(pool.poolId, 'utf-8');
    poolIdHash.copy(poolIdBytes, 0, 0, Math.min(poolIdHash.length, 32));
    const [vault] = getVaultPDA(poolIdBytes);
    const vaultTokenAccount = await getAssociatedTokenAddress(USDC_MINT, vault, true);
    const vaultTokenAccountStr = vaultTokenAccount.toBase58();

    // Find the vault's token balance change
    let transferAmount = BigInt(0);

    // Look for vault in post balances
    for (const postBalance of postBalances) {
      if (postBalance.mint !== USDC_MINT.toBase58()) continue;

      // Get the account key from the transaction
      const accountKeys = tx.transaction.message.getAccountKeys();
      const accountKey = accountKeys.get(postBalance.accountIndex);
      if (!accountKey || accountKey.toBase58() !== vaultTokenAccountStr) continue;

      // Find matching pre-balance
      const preBalance = preBalances.find(
        (pre) => pre.accountIndex === postBalance.accountIndex
      );

      const preAmount = BigInt(preBalance?.uiTokenAmount?.amount || '0');
      const postAmount = BigInt(postBalance.uiTokenAmount.amount);

      // Calculate the difference (should be positive for deposits)
      if (postAmount > preAmount) {
        transferAmount = postAmount - preAmount;
      }
      break;
    }

    if (transferAmount === BigInt(0)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_TRANSFER_FOUND',
          message: 'No valid USDC transfer to vault found in transaction',
        },
      });
    }

    const betAmount = transferAmount;

    console.log(`[Deposit] Verified on-chain: pool=${poolId}, wallet=${walletAddress}, side=${side}, amount=${betAmount}`);

    // Create bet in database
    const bet = await prisma.bet.create({
      data: {
        poolId: pool.id,
        walletAddress,
        side,
        amount: betAmount,
        depositTx: txSignature,
      },
    });

    // Update pool totals
    await prisma.pool.update({
      where: { id: pool.id },
      data: {
        totalUp: side === 'UP'
          ? { increment: betAmount }
          : undefined,
        totalDown: side === 'DOWN'
          ? { increment: betAmount }
          : undefined,
      },
    });

    // Log event
    await prisma.eventLog.create({
      data: {
        eventType: 'DEPOSIT_CONFIRMED',
        entityType: 'bet',
        entityId: bet.id,
        payload: {
          poolId: pool.id,
          walletAddress,
          side,
          amount: betAmount.toString(),
          txSignature,
        },
      },
    });

    res.json({
      success: true,
      data: {
        betId: bet.id,
        side,
        amount: betAmount.toString(),
        status: 'confirmed',
      },
    });
  } catch (error) {
    console.error('Error confirming deposit:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to confirm deposit',
      },
    });
  }
});

/**
 * POST /api/transactions/claim
 * Returns account addresses needed to build the claim transaction
 */
transactionsRouter.post('/claim', async (req, res) => {
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

    // Generate the pool ID bytes
    const poolIdBytes = Buffer.alloc(32);
    const poolIdHash = Buffer.from(pool.poolId, 'utf-8');
    poolIdHash.copy(poolIdBytes, 0, 0, Math.min(poolIdHash.length, 32));

    // Derive PDAs
    const user = new PublicKey(walletAddress);
    const [poolPDA] = getPoolPDA(poolIdBytes);
    const [vault] = getVaultPDA(poolIdBytes);
    const [userBet] = getUserBetPDA(poolPDA, user);
    const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, user);

    // Calculate expected payout
    const totalPool = pool.totalUp + pool.totalDown;
    const winnerPool = bet.side === 'UP' ? pool.totalUp : pool.totalDown;
    const payout = winnerPool > 0n
      ? (bet.amount * totalPool) / winnerPool
      : 0n;

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
 * POST /api/transactions/confirm-claim
 * Verify claim transaction and update bet record
 */
transactionsRouter.post('/confirm-claim', async (req, res) => {
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
    const tx = await connection.getTransaction(txSignature, {
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

    // Calculate payout
    const pool = bet.pool;
    const totalPool = pool.totalUp + pool.totalDown;
    const winnerPool = bet.side === 'UP' ? pool.totalUp : pool.totalDown;
    const payout = winnerPool > 0n
      ? (bet.amount * totalPool) / winnerPool
      : 0n;

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
 * POST /api/transactions/execute-claim
 * Server-side claim: validates winner, transfers USDC from authority to user, updates DB
 */
transactionsRouter.post('/execute-claim', async (req, res) => {
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

    // Calculate payout
    const totalPool = pool.totalUp + pool.totalDown;
    const winnerPool = bet.side === 'UP' ? pool.totalUp : pool.totalDown;
    const payout = winnerPool > 0n ? (bet.amount * totalPool) / winnerPool : 0n;

    if (payout === 0n) {
      return res.status(400).json({
        success: false,
        error: { code: 'ZERO_PAYOUT', message: 'Payout amount is zero' },
      });
    }

    // Load authority keypair
    let authority: Keypair;
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
    const authorityATA = await getAssociatedTokenAddress(USDC_MINT, authority.publicKey);
    const userATA = await getAssociatedTokenAddress(USDC_MINT, userPubkey);

    const transaction = new Transaction();

    // Set compute budget
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 1000 }),
      ComputeBudgetProgram.setComputeUnitLimit({ units: 200_000 }),
    );

    // Create user's ATA if it doesn't exist
    const userATAInfo = await connection.getAccountInfo(userATA);
    if (!userATAInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          authority.publicKey, // payer
          userATA,             // ata
          userPubkey,          // owner
          USDC_MINT,           // mint
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
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = authority.publicKey;
    transaction.sign(authority);

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log(`[execute-claim] Sent payout tx: ${signature}, amount: ${payout}, to: ${walletAddress}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
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
