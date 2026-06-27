'use client';

import { useCallback, useRef, useState } from 'react';
import { useSendTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { executeBridge, markBridgeSubmitted, getBridgeStatus } from '@/lib/api';

/**
 * Execute a Solana USDC → Arbitrum bridge with the Privy embedded Solana wallet.
 *
 * Flow: execute (fresh quote + signable tx + durable id) → sign & send the Solana
 * tx with the embedded wallet → record the signature → poll status until the funds
 * land on the destination. Orders/funds settle off the user's machine after this.
 *
 * Bridging is inherently a MAINNET operation (real USDC), independent of the
 * devnet betting cluster — so it uses a mainnet Solana RPC.
 */
const MAINNET_RPC =
  process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';

export type BridgeStep = 'idle' | 'quoting' | 'signing' | 'bridging' | 'done' | 'error';

const POLL_MS = 4000;
const MAX_POLLS = 90; // ~6 min ceiling

export function useBridgeExecute() {
  const { sendTransaction } = useSendTransaction();
  const [step, setStep] = useState<BridgeStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setStep('idle');
    setError(null);
  }, []);

  const run = useCallback(
    async (params: { amountMicro: string; fromAddress: string; toAddress: string }): Promise<boolean> => {
      setError(null);
      try {
        setStep('quoting');
        const ex = await executeBridge(params);
        if (!ex.success || !ex.data) throw new Error(ex.error?.message ?? 'Could not start the transfer');
        const { id, sourceTx } = ex.data;

        // Sign + send the Solana source tx with the embedded wallet (no popup).
        setStep('signing');
        const bytes = Uint8Array.from(atob(sourceTx.data), (c) => c.charCodeAt(0));
        const tx = VersionedTransaction.deserialize(bytes);
        const connection = new Connection(MAINNET_RPC, 'confirmed');
        const receipt = await sendTransaction({ transaction: tx, connection });
        const sig = receipt.signature;

        await markBridgeSubmitted({ id, txHash: sig });

        // Poll until the destination credits (or fails).
        setStep('bridging');
        await new Promise<void>((resolve, reject) => {
          let polls = 0;
          const poll = async () => {
            polls += 1;
            const r = await getBridgeStatus(id);
            const status = r.success ? r.data?.status : undefined;
            if (status === 'DONE') return resolve();
            if (status === 'FAILED') return reject(new Error('The bridge route failed'));
            if (polls >= MAX_POLLS) return reject(new Error('Timed out waiting for funds (still in flight)'));
            timer.current = setTimeout(poll, POLL_MS);
          };
          poll();
        });

        setStep('done');
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Bridge failed');
        setStep('error');
        return false;
      }
    },
    [sendTransaction],
  );

  return { step, error, run, reset };
}
