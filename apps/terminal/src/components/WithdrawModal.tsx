'use client';

import { useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { createWalletClient, custom } from 'viem';
import { Modal } from './Modal';
import { IS_TESTNET } from '@/lib/api';

function Inner({ evmAddress }: { evmAddress?: string }) {
  const { wallets } = useWallets();
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState(evmAddress ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function withdraw() {
    if (!evmAddress || !amount) return;
    setBusy(true);
    setMsg(null);
    try {
      const wallet = wallets.find((w) => w.address === evmAddress);
      if (!wallet) throw new Error('Connected wallet not found');
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, transport: custom(provider) });
      const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });
      await client.withdraw3({ destination: (dest || evmAddress) as `0x${string}`, amount });
      setMsg({ ok: true, text: 'Withdrawal submitted' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs text-surface-400">Amount (USDC)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="input mt-1 tabular" />
      </label>
      <label className="block">
        <span className="text-xs text-surface-400">Destination (Arbitrum)</span>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="0x…" className="input mt-1 font-mono text-xs" />
      </label>
      <button
        onClick={withdraw}
        disabled={!evmAddress || !amount || busy}
        className="w-full rounded bg-win-500 py-2 font-semibold text-black disabled:opacity-40"
      >
        {busy ? 'Submitting…' : 'Withdraw'}
      </button>
      {msg && <p className={`text-xs ${msg.ok ? 'text-win-500' : 'text-loss-500'}`}>{msg.text}</p>}
      <p className="text-2xs text-surface-500">Withdrawals settle to Arbitrum; HyperLiquid charges a small fee.</p>
    </div>
  );
}

export function WithdrawModal({ open, onClose, evmAddress }: { open: boolean; onClose: () => void; evmAddress?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Withdraw USDC">
      <Inner evmAddress={evmAddress} />
    </Modal>
  );
}
