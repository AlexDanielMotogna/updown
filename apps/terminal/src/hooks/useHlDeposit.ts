'use client';

import { useCallback, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createPublicClient, createWalletClient, custom, http, parseSignature, type Hex } from 'viem';
import { arbitrum } from 'viem/chains';
import { depositHl } from '@/lib/api';

/**
 * Deposit Arbitrum USDC into HyperLiquid via the permit relayer (bridge phase 3).
 *
 * The user signs an off-chain EIP-2612 USDC permit with their embedded EVM wallet
 * (gasless, no ETH). Our backend relayer submits Bridge2 batchedDepositWithPermit,
 * paying the Arbitrum gas, and HL credits the user. By default it sweeps the
 * user's entire Arbitrum USDC balance into HyperLiquid.
 */
const HL_BRIDGE: Hex = '0x2df1c51e09aecf9cacb7bc98cb1742757f163df7'; // mainnet Bridge2 (spender)
const ARBITRUM_USDC: Hex = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831'; // native USDC
const MIN_USD = 5_000_000n; // 5 USDC

const PERMIT_DOMAIN = { name: 'USD Coin', version: '2', chainId: 42161, verifyingContract: ARBITRUM_USDC } as const;
const PERMIT_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

const USDC_ABI = [
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

export type HlDepositStep = 'idle' | 'permit' | 'depositing' | 'done' | 'error';

export function useHlDeposit() {
  const { wallets } = useWallets();
  const [step, setStep] = useState<HlDepositStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const reset = useCallback(() => { setStep('idle'); setError(null); setTxHash(null); }, []);

  /** Deposit `amountMicro` (or the full Arbitrum USDC balance when omitted) into HL. */
  const run = useCallback(
    async (evmAddress: string, amountMicro?: string): Promise<boolean> => {
      setError(null);
      try {
        const owner = evmAddress as Hex;
        const publicClient = createPublicClient({
          chain: arbitrum,
          transport: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || undefined),
        });

        const balance = (await publicClient.readContract({ address: ARBITRUM_USDC, abi: USDC_ABI, functionName: 'balanceOf', args: [owner] })) as bigint;
        const value = amountMicro ? BigInt(amountMicro) : balance;
        if (value < MIN_USD) throw new Error('Need at least 5 USDC on Arbitrum to deposit');
        if (value > balance) throw new Error('Amount exceeds your Arbitrum USDC balance');

        const nonce = (await publicClient.readContract({ address: ARBITRUM_USDC, abi: USDC_ABI, functionName: 'nonces', args: [owner] })) as bigint;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

        // Sign the EIP-2612 permit with the embedded EVM wallet (gasless).
        setStep('permit');
        const wallet = wallets.find((w) => w.address.toLowerCase() === owner.toLowerCase());
        if (!wallet) throw new Error('EVM wallet not found');
        const provider = await wallet.getEthereumProvider();
        const walletClient = createWalletClient({ account: owner, chain: arbitrum, transport: custom(provider) });

        const sigHex = await walletClient.signTypedData({
          account: owner,
          domain: PERMIT_DOMAIN,
          types: PERMIT_TYPES,
          primaryType: 'Permit',
          message: { owner, spender: HL_BRIDGE, value, nonce, deadline },
        });
        const sig = parseSignature(sigHex);
        const v = Number(sig.v ?? (sig.yParity === 0 ? 27 : 28));

        // Relayer submits the deposit (pays Arbitrum gas, credits the user on HL).
        setStep('depositing');
        const r = await depositHl({
          user: owner,
          usd: value.toString(),
          deadline: Number(deadline),
          signature: { r: sig.r, s: sig.s, v },
        });
        if (!r.success || !r.data) throw new Error(r.error?.message ?? 'Deposit failed');

        setTxHash(r.data.txHash);
        setStep('done');
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Deposit failed');
        setStep('error');
        return false;
      }
    },
    [wallets],
  );

  return { step, error, txHash, run, reset };
}
