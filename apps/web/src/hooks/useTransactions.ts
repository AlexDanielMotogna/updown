import { useState, useCallback } from 'react';
import { Transaction, PublicKey, SystemProgram, Connection } from '@solana/web3.js';
import { useWalletBridge } from './useWalletBridge';
import { useSolanaConnection } from '@/app/providers';
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { useQueryClient } from '@tanstack/react-query';
import {
  prepareDeposit,
  confirmDeposit,
  prepareClaim,
  confirmClaim,
} from '@/lib/api';

// USDC mint on devnet (same as backend)
const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || 'By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz'
);

export type TransactionStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';

/**
 * Confirm transaction with polling for slow devnet
 * Instead of relying on confirmTransaction timeout, poll getSignatureStatus
 */
async function confirmTransactionWithRetry(
  connection: Connection,
  signature: string,
  maxWaitMs = 90000, // 90 seconds max wait
  pollIntervalMs = 3000 // Check every 3 seconds
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const status = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      if (status?.value?.confirmationStatus === 'confirmed' ||
          status?.value?.confirmationStatus === 'finalized') {
        return true;
      }

      if (status?.value?.err) {
        // Transaction failed on-chain
        throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    } catch (error) {
      // If it's our own error, rethrow
      if (error instanceof Error && error.message.startsWith('Transaction failed:')) {
        throw error;
      }
      // Network error - wait and retry
      await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
    }
  }

  // Final check after timeout
  const finalStatus = await connection.getSignatureStatus(signature, {
    searchTransactionHistory: true,
  });

  if (finalStatus?.value?.confirmationStatus === 'confirmed' ||
      finalStatus?.value?.confirmationStatus === 'finalized') {
    return true;
  }

  return false;
}

export interface TransactionState {
  status: TransactionStatus;
  txSignature?: string;
  error?: string;
}

export function useDeposit() {
  const connection = useSolanaConnection();
  const { publicKey, sendTransaction } = useWalletBridge();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TransactionState>({ status: 'idle' });

  const deposit = useCallback(
    async (poolId: string, side: 'UP' | 'DOWN', amount: number) => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return;
      }

      try {
        setState({ status: 'preparing' });

        // Get accounts from API
        const response = await prepareDeposit({
          poolId,
          walletAddress: publicKey.toBase58(),
          side,
          amount,
        });

        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Failed to prepare deposit');
        }

        setState({ status: 'signing' });

        // Create real USDC transfer to vault
        const transaction = new Transaction();
        const vaultPubkey = new PublicKey(response.data.accounts.vault);

        // Get user's USDC token account
        const userTokenAccount = await getAssociatedTokenAddress(USDC_MINT, publicKey);

        // Get vault's token account (should already exist)
        const vaultTokenAccount = await getAssociatedTokenAddress(USDC_MINT, vaultPubkey, true);

        // Check if vault token account exists, if not create it
        const vaultAccountInfo = await connection.getAccountInfo(vaultTokenAccount);
        if (!vaultAccountInfo) {
          transaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey, // payer
              vaultTokenAccount, // ata
              vaultPubkey, // owner
              USDC_MINT // mint
            )
          );
        }

        // Add transfer instruction (amount is already in USDC base units with 6 decimals)
        transaction.add(
          createTransferInstruction(
            userTokenAccount, // from
            vaultTokenAccount, // to
            publicKey, // owner
            BigInt(amount), // amount in base units
            [], // multiSigners
            TOKEN_PROGRAM_ID
          )
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signature = await sendTransaction(transaction);

        setState({ status: 'confirming', txSignature: signature });

        // Wait for confirmation with retry logic (devnet can be slow)
        const confirmed = await confirmTransactionWithRetry(connection, signature);

        if (!confirmed) {
          throw new Error('Transaction confirmation failed. Please check the explorer.');
        }

        // Confirm with backend (side is verified by user signing, amount verified on-chain)
        await confirmDeposit({
          poolId,
          walletAddress: publicKey.toBase58(),
          txSignature: signature,
          side,
        });

        setState({ status: 'success', txSignature: signature });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['pools'] });
        queryClient.invalidateQueries({ queryKey: ['pool', poolId] });
        queryClient.invalidateQueries({ queryKey: ['bets'] });

        return signature;
      } catch (error) {
        let message = error instanceof Error ? error.message : 'Transaction failed';

        // Improve timeout error message
        if (message.includes('not confirmed') || message.includes('timeout')) {
          message = 'Transaction is taking longer than expected. It may still succeed - check the explorer.';
        }

        setState({ status: 'error', error: message, txSignature: state.txSignature });
        throw error;
      }
    },
    [publicKey, connection, sendTransaction, queryClient, state.txSignature]
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { deposit, state, reset };
}

export function useClaim() {
  const connection = useSolanaConnection();
  const { publicKey, sendTransaction } = useWalletBridge();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TransactionState>({ status: 'idle' });

  const claim = useCallback(
    async (poolId: string, betId: string) => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return;
      }

      try {
        setState({ status: 'preparing' });

        // Get accounts from API
        const response = await prepareClaim({
          poolId,
          walletAddress: publicKey.toBase58(),
        });

        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Failed to prepare claim');
        }

        setState({ status: 'signing' });

        // Create placeholder transaction (in production, use actual program instruction)
        const transaction = new Transaction();

        transaction.add(
          SystemProgram.transfer({
            fromPubkey: publicKey,
            toPubkey: new PublicKey(response.data.accounts.vault),
            lamports: 0, // Placeholder
          })
        );

        const { blockhash } = await connection.getLatestBlockhash();
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = publicKey;

        const signature = await sendTransaction(transaction);

        setState({ status: 'confirming', txSignature: signature });

        // Wait for confirmation with retry logic (devnet can be slow)
        const confirmed = await confirmTransactionWithRetry(connection, signature);

        if (!confirmed) {
          throw new Error('Transaction confirmation failed. Please check the explorer.');
        }

        // Confirm with backend
        await confirmClaim({
          betId,
          txSignature: signature,
        });

        setState({ status: 'success', txSignature: signature });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['claimableBets'] });

        return signature;
      } catch (error) {
        let message = error instanceof Error ? error.message : 'Transaction failed';

        // Improve timeout error message
        if (message.includes('not confirmed') || message.includes('timeout')) {
          message = 'Transaction is taking longer than expected. It may still succeed - check the explorer.';
        }

        setState({ status: 'error', error: message, txSignature: state.txSignature });
        throw error;
      }
    },
    [publicKey, connection, sendTransaction, queryClient, state.txSignature]
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { claim, state, reset };
}
