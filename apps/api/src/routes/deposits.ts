import { Router, type Router as RouterType } from 'express';
import { z } from 'zod';
import { PublicKey } from '@solana/web3.js';
import { prisma } from '../db';
import { emitPoolUpdate } from '../websocket';
import { getPoolPDA, getVaultPDA, getUserBetPDA, PROGRAM_ID } from 'solana-client';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { getConnection, getUsdcMint, derivePoolSeed } from '../utils/solana';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { awardBetPlacement } from '../services/rewards';

export const depositsRouter: RouterType = Router();

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

/**
 * POST /deposit
 * Returns account addresses needed to build the deposit transaction
 */
depositsRouter.post('/deposit', async (req, res) => {
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

    // Derive PDAs using deterministic seed from pool UUID
    const seed = derivePoolSeed(pool.id);
    const user = new PublicKey(walletAddress);
    const [poolPDA] = getPoolPDA(seed);
    const [vaultPDA] = getVaultPDA(seed);
    const [userBet] = getUserBetPDA(poolPDA, user);
    const userTokenAccount = await getAssociatedTokenAddress(getUsdcMint(), user);

    // Return accounts needed for transaction
    // vault IS a token account (initialized by Anchor initializePool), not an ATA
    res.json({
      success: true,
      data: {
        accounts: {
          pool: poolPDA.toBase58(),
          userBet: userBet.toBase58(),
          vault: vaultPDA.toBase58(),
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
 * POST /confirm-deposit
 * Verify transaction on-chain and create bet record
 */
depositsRouter.post('/confirm-deposit', async (req, res) => {
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

    // BUG-05: Verify pool is still in JOINING status (not ACTIVE/RESOLVED/CLAIMABLE)
    if (pool.status !== 'JOINING') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_POOL_STATUS',
          message: `Pool is in ${pool.status} status, deposits only allowed during JOINING`,
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

    // BUG-17: Verify walletAddress is a signer of the transaction.
    // Prevents an attacker from submitting someone else's txSignature.
    const allAccountKeys = tx.transaction.message.getAccountKeys();
    const numSigners = tx.transaction.message.header.numRequiredSignatures;
    let walletIsSigner = false;
    for (let i = 0; i < numSigners; i++) {
      const key = allAccountKeys.get(i);
      if (key && key.toBase58() === walletAddress) {
        walletIsSigner = true;
        break;
      }
    }
    if (!walletIsSigner) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SIGNER',
          message: 'Wallet address is not a signer of this transaction',
        },
      });
    }

    // Parse the actual transfer amount from on-chain transaction.
    // The vault PDA IS the token account (initialized by Anchor initializePool).
    const seed = derivePoolSeed(pool.id);
    const [vaultPDA] = getVaultPDA(seed);
    const vaultPDAStr = vaultPDA.toBase58();

    const preBalances = tx.meta?.preTokenBalances || [];
    const postBalances = tx.meta?.postTokenBalances || [];

    // Find the vault's token balance change
    let transferAmount = BigInt(0);

    console.log(`[Deposit Debug] USDC_MINT: ${getUsdcMint().toBase58()}`);
    console.log(`[Deposit Debug] Expected vault PDA: ${vaultPDAStr}`);
    console.log(`[Deposit Debug] postBalances:`, JSON.stringify(postBalances.map(b => ({ mint: b.mint, accountIndex: b.accountIndex, amount: b.uiTokenAmount.amount }))));
    console.log(`[Deposit Debug] preBalances:`, JSON.stringify(preBalances.map(b => ({ mint: b.mint, accountIndex: b.accountIndex, amount: b.uiTokenAmount?.amount }))));
    const accountKeys = tx.transaction.message.getAccountKeys();
    console.log(`[Deposit Debug] Account keys:`, Array.from({ length: accountKeys.length }, (_, i) => `${i}: ${accountKeys.get(i)?.toBase58()}`));

    // Look for vault in post balances
    for (const postBalance of postBalances) {
      if (postBalance.mint !== getUsdcMint().toBase58()) continue;

      // Get the account key from the transaction
      const accountKey = accountKeys.get(postBalance.accountIndex);
      if (!accountKey || accountKey.toBase58() !== vaultPDAStr) continue;

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

    // BUG-06: Atomic transaction — bet.create + pool.update together
    const [bet, updatedPool] = await prisma.$transaction(async (tx) => {
      const newBet = await tx.bet.create({
        data: {
          poolId: pool.id,
          walletAddress,
          side,
          amount: betAmount,
          depositTx: txSignature,
        },
      });

      const newPool = await tx.pool.update({
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

      await tx.eventLog.create({
        data: {
          eventType: 'DEPOSIT_CONFIRMED',
          entityType: 'bet',
          entityId: newBet.id,
          payload: {
            poolId: pool.id,
            walletAddress,
            side,
            amount: betAmount.toString(),
            txSignature,
          },
        },
      });

      return [newBet, newPool] as const;
    });

    // BUG-07: Emit pool update so other clients see updated totals in real-time
    emitPoolUpdate(pool.id, {
      id: pool.id,
      totalUp: updatedPool.totalUp.toString(),
      totalDown: updatedPool.totalDown.toString(),
    });

    // Award XP + coins (fire-and-forget, non-blocking)
    awardBetPlacement(walletAddress, betAmount).catch(() => {});

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
