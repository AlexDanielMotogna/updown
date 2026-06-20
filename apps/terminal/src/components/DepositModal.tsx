'use client';

import { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { createWalletClient, custom, parseUnits } from 'viem';
import { arbitrum, arbitrumSepolia } from 'viem/chains';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { IS_TESTNET } from '@/lib/api';

/**
 * HyperLiquid deposits are an ERC-20 USDC `transfer` to the HL bridge contract on
 * Arbitrum — the bridge credits the SENDER's HyperCore account (~1 min). Mainnet
 * addresses are verified on Arbiscan. On testnet, funding is the faucet (the
 * testnet USDC address isn't reliably documented), so we surface that instead.
 *
 * Mainnet bridge: 0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7 (Arbiscan: "Hyperliquid: Deposit Bridge 2")
 * Native USDC:    0xaf88d065e77c8cC2239327C5EDb3A432268e5831
 */
const MAINNET = {
  chain: arbitrum,
  chainIdHex: '0xa4b1', // 42161
  bridge: '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as `0x${string}`,
  usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`,
  minDeposit: 5,
};

const FAUCET_URL = 'https://app.hyperliquid-testnet.xyz/drip';

const ERC20_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

function TestnetDeposit({ evmAddress }: { evmAddress?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 text-sm text-surface-300">
      <p>
        On testnet, fund your account with the HyperLiquid faucet — it drips <span className="text-surface-100">1,000 mock USDC</span> to your account (~every 4h).
      </p>
      <div>
        <div className="mb-1.5 text-xs text-surface-400">Your account (faucet credits this address)</div>
        <div className="flex items-center gap-2 rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2">
          <span className="truncate font-mono text-xs text-surface-100">{evmAddress ?? 'not connected'}</span>
          {evmAddress && (
            <button
              onClick={() => { navigator.clipboard?.writeText(evmAddress); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
              className="ml-auto rounded border border-surface-700 px-2 py-0.5 text-xs text-surface-300 hover:bg-surface-800"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>
      <a
        href={FAUCET_URL}
        target="_blank"
        rel="noreferrer"
        className="block w-full rounded bg-surface-100 py-2.5 text-center text-sm font-semibold text-surface-900 hover:bg-surface-200"
      >
        Open testnet faucet ↗
      </a>
      <p className="text-2xs text-surface-500">The faucet may require one prior mainnet deposit from this wallet (HL anti-sybil).</p>
    </div>
  );
}

function MainnetDeposit({ evmAddress }: { evmAddress?: string }) {
  const { wallets } = useWallets();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  async function deposit() {
    if (!evmAddress || !amount) return;
    if (Number(amount) < MAINNET.minDeposit) {
      toast.show('error', `Minimum deposit is ${MAINNET.minDeposit} USDC (less is not credited)`);
      return;
    }
    setBusy(true);
    const tid = toast.loading(`Depositing ${amount} USDC…`);
    try {
      const wallet = wallets.find((w) => w.address.toLowerCase() === evmAddress.toLowerCase());
      if (!wallet) throw new Error('Connected wallet not found');
      const provider = await wallet.getEthereumProvider();

      // Deposits are Arbitrum One transactions — make sure the wallet is on it.
      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: MAINNET.chainIdHex }] });
      } catch (e) {
        if ((e as { code?: number }).code === 4902) {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: MAINNET.chainIdHex,
              chainName: arbitrum.name,
              nativeCurrency: arbitrum.nativeCurrency,
              rpcUrls: arbitrum.rpcUrls.default.http,
              blockExplorerUrls: [arbitrum.blockExplorers.default.url],
            }],
          });
        } else throw e;
      }

      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, chain: arbitrum, transport: custom(provider) });
      const hash = await walletClient.writeContract({
        address: MAINNET.usdc,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [MAINNET.bridge, parseUnits(amount, 6)],
      });
      toast.update(tid, 'success', `Deposit sent (${hash.slice(0, 10)}…) — credits in ~1 min`);
      setAmount('');
    } catch (e) {
      toast.update(tid, 'error', (e as Error).message || 'Deposit failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-surface-300">Deposit native USDC from Arbitrum One. Funds credit your account ~1 min after the transfer confirms.</p>
      <label className="block">
        <span className="text-xs text-surface-400">Amount (USDC)</span>
        <div className="mt-1.5 flex items-center rounded border border-surface-700 bg-[#1c1c23] px-3">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full bg-transparent py-2.5 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
          <span className="text-surface-400">USDC</span>
        </div>
      </label>
      <button
        onClick={deposit}
        disabled={!evmAddress || !amount || busy}
        className="w-full rounded bg-surface-100 py-2.5 text-sm font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-40"
      >
        {busy ? 'Depositing…' : 'Deposit'}
      </button>
      <p className="text-2xs text-surface-500">Minimum {MAINNET.minDeposit} USDC — smaller amounts are NOT credited. Uses native USDC (not USDC.e).</p>
    </div>
  );
}

export function DepositModal({ open, onClose, evmAddress }: { open: boolean; onClose: () => void; evmAddress?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Deposit USDC">
      {IS_TESTNET ? <TestnetDeposit evmAddress={evmAddress} /> : <MainnetDeposit evmAddress={evmAddress} />}
    </Modal>
  );
}
