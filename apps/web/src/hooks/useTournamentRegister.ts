import { useState, useCallback } from 'react';
import { Transaction, PublicKey } from '@solana/web3.js';
import { createTransferInstruction } from '@solana/spl-token';
import { useWalletBridge } from './useWalletBridge';
import { useSolanaConnection } from '@/app/providers';
import { prepareTournamentRegister, registerForTournament } from '@/lib/api';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';

export type RegisterStatus = 'idle' | 'preparing' | 'signing' | 'confirming' | 'registering' | 'success' | 'error';

export function useTournamentRegister() {
  const connection = useSolanaConnection();
  const { publicKey, sendTransaction } = useWalletBridge();
  const [status, setStatus] = useState<RegisterStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const push = useNotificationStore((s) => s.push);

  const register = useCallback(async (tournamentId: string) => {
    if (!publicKey) {
      setError('Wallet not connected');
      setStatus('error');
      return false;
    }

    try {
      setStatus('preparing');
      setError(null);
      setTxSignature(null);

      const prepRes = await prepareTournamentRegister(tournamentId, publicKey.toBase58());
      if (!prepRes.success || !prepRes.data) {
        throw new Error(prepRes.error?.message || 'Failed to prepare registration');
      }

      const { entryFee, accounts } = prepRes.data;
      const amount = BigInt(entryFee);
      const feeUsdc = `$${(Number(entryFee) / 1_000_000).toFixed(2)}`;

      setStatus('signing');

      const ix = createTransferInstruction(
        new PublicKey(accounts.userTokenAccount),
        new PublicKey(accounts.authorityTokenAccount),
        publicKey,
        amount,
      );

      const tx = new Transaction().add(ix);
      const { blockhash } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;

      const signature = await sendTransaction(tx);
      setTxSignature(signature);

      setStatus('confirming');

      const startTime = Date.now();
      const maxWait = 60_000;
      let confirmed = false;

      while (Date.now() - startTime < maxWait) {
        const result = await connection.getSignatureStatus(signature, { searchTransactionHistory: true });
        if (result?.value?.confirmationStatus === 'confirmed' || result?.value?.confirmationStatus === 'finalized') {
          confirmed = true;
          break;
        }
        if (result?.value?.err) {
          throw new Error('Transaction failed on-chain');
        }
        await new Promise(r => setTimeout(r, 3000));
      }

      if (!confirmed) {
        throw new Error('Transaction confirmation timed out');
      }

      setStatus('registering');

      const regRes = await registerForTournament(tournamentId, publicKey.toBase58(), signature);
      if (!regRes.success) {
        throw new Error(regRes.error?.message || 'Registration failed');
      }

      setStatus('success');
      push(buildNotification('TOURNAMENT_REGISTERED', { entryFee: feeUsdc }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      setStatus('error');
      push(buildNotification('DEPOSIT_FAILED', { error: msg }));
      return false;
    }
  }, [publicKey, sendTransaction, connection, push]);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxSignature(null);
  }, []);

  return { register, status, error, txSignature, reset };
}
