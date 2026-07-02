import { useState, useCallback } from 'react';
import { Transaction, Connection } from '@solana/web3.js';
import { useWalletBridge } from './useWalletBridge';
import { useSolanaConnection } from '@/app/providers';
import { useQueryClient } from '@tanstack/react-query';
import {
  prepareGaslessDeposit,
  confirmDeposit,
  prepareClaim,
  confirmClaim,
} from '@/lib/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';

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

export type TransactionStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'success' | 'error';

export interface TransactionState {
  status: TransactionStatus;
  txSignature?: string;
  error?: string;
}

export function useDeposit() {
  const connection = useSolanaConnection();
  const { publicKey, coSignAndSend, login } = useWalletBridge();
  const queryClient = useQueryClient();
  const [state, setState] = useState<TransactionState>({ status: 'idle' });

  const deposit = useCallback(
    async (poolId: string, side: 'UP' | 'DOWN' | 'DRAW', amount: number) => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return;
      }

      try {
        setState({ status: 'preparing' });

        // Gasless path (the ONLY path — every user is embedded): the server builds
        // the tx, pays the fee (feePayer = authority) and funds any ATA/UserBet
        // rent, and partial-signs it. The embedded wallet co-signs SILENTLY and
        // submits → user needs ZERO SOL, no popup.
        const prep = await prepareGaslessDeposit({
          poolId,
          walletAddress: publicKey.toBase58(),
          side,
          amount,
        });
        if (!prep.success || !prep.data) {
          throw new Error(prep.error?.message || 'Failed to prepare deposit');
        }
        setState({ status: 'signing' });
        const poolAsset = prep.data.asset;
        const signature = await coSignAndSend(prep.data.tx);

        setState({ status: 'confirming', txSignature: signature });

        // Best-effort client-side wait so the tx has time to land. Do NOT hard-fail
        // on timeout: a rate-limited devnet RPC (429) often can't confirm even
        // though the tx landed. The backend confirmDeposit verifies the tx on-chain
        // with its own RPC and is the authoritative check, so we proceed to it
        // regardless and only surface an error if the SERVER can't find the tx.
        await confirmTransactionWithRetry(connection, signature).catch(() => false);

        // Confirm with backend (side is verified by user signing, amount verified on-chain)
        const confirmResponse = await confirmDeposit({
          poolId,
          walletAddress: publicKey.toBase58(),
          txSignature: signature,
          side,
        });

        if (!confirmResponse.success) {
          throw new Error(
            confirmResponse.error?.message ||
              'Deposit sent on-chain but server failed to record it. Contact support with tx: ' + signature,
          );
        }

        setState({ status: 'success', txSignature: signature });

        // Register pool for notifications + push success toast
        const notifStore = useNotificationStore.getState();
        notifStore.addUserPoolId(poolId);
        notifStore.push({ ...buildNotification('DEPOSIT_SUCCESS', { asset: poolAsset }), poolId, asset: poolAsset });
        notifStore.push({ ...buildNotification('PREDICTION_PLACED', { side, asset: poolAsset }), poolId, asset: poolAsset });

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['pools'] });
        queryClient.invalidateQueries({ queryKey: ['pool', poolId] });
        queryClient.invalidateQueries({ queryKey: ['bets'] });

        return signature;
      } catch (error) {
        console.error('[Deposit] Transaction error:', error);
        let message = error instanceof Error ? error.message : 'Transaction failed';

        // Session expired - trigger re-authentication automatically
        if (message.includes('SESSION_EXPIRED')) {
          message = 'Session expired - please log in and try again.';
          login();
        }

        // Improve timeout error message
        if (message.includes('not confirmed') || message.includes('timeout')) {
          message = 'Transaction is taking longer than expected. It may still succeed - check the explorer.';
        }

        useNotificationStore.getState().push(
          buildNotification('DEPOSIT_FAILED', { poolId, error: message }),
        );

        setState({ status: 'error', error: message, txSignature: state.txSignature });
        throw error;
      }
    },
    [publicKey, connection, coSignAndSend, login, queryClient, state.txSignature]
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
    async (poolId: string, _betId: string) => {
      if (!publicKey) {
        setState({ status: 'error', error: 'Wallet not connected' });
        return;
      }

      try {
        setState({ status: 'preparing' });

        // 1. Get partially-signed transaction from API (authority already signed)
        const response = await prepareClaim({
          poolId,
          walletAddress: publicKey.toBase58(),
        });

        if (!response.success || !response.data) {
          throw new Error(response.error?.message || 'Failed to prepare claim');
        }

        setState({ status: 'signing' });

        // 2. Deserialize the partially-signed transaction
        const { transaction: txBase64, bet } = response.data;
        const txBuffer = Buffer.from(txBase64, 'base64');
        const transaction = Transaction.from(txBuffer);

        // 3. User signs + sends (wallet adapter adds user signature)
        const signature = await sendTransaction(transaction);

        setState({ status: 'confirming', txSignature: signature });

        // Wait for confirmation
        const confirmed = await confirmTransactionWithRetry(connection, signature);

        if (!confirmed) {
          throw new Error('Transaction confirmation failed. Please check the explorer.');
        }

        // 4. Confirm with POST /confirm-claim
        const confirmResponse = await confirmClaim({
          betId: bet.id,
          txSignature: signature,
        });

        if (!confirmResponse.success) {
          throw new Error(
            confirmResponse.error?.message ||
              'Claim sent on-chain but server failed to record it. Contact support with tx: ' + signature,
          );
        }

        setState({ status: 'success', txSignature: signature });

        useNotificationStore.getState().push(
          buildNotification('CLAIM_SUCCESS', { poolId }),
        );

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['infiniteBets'] });
        queryClient.invalidateQueries({ queryKey: ['claimableBets'] });
        queryClient.invalidateQueries({ queryKey: ['usdc-balance'] });

        return signature;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Claim failed';

        useNotificationStore.getState().push(
          buildNotification('CLAIM_FAILED', { poolId, error: message }),
        );

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
