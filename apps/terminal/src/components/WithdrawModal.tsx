'use client';

import { useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { createWalletClient, custom } from 'viem';
import { arbitrum } from 'viem/chains';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { IS_TESTNET } from '@/lib/api';
import { fetchPerpsWithdrawable } from '@/lib/hlBalances';

const MIN_WITHDRAW = 2; // USDC
const WITHDRAW_FEE = 1; // USDC, deducted from the amount
const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

function Inner({ evmAddress }: { evmAddress?: string }) {
  const { wallets } = useWallets();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [dest, setDest] = useState(evmAddress ?? '');
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<number | null>(null);

  useEffect(() => {
    if (evmAddress) fetchPerpsWithdrawable(evmAddress).then(setAvailable);
  }, [evmAddress]);

  const amt = Number(amount);
  const receives = amt > WITHDRAW_FEE ? amt - WITHDRAW_FEE : 0;

  async function withdraw() {
    if (!evmAddress || !amount) return;
    if (amt < MIN_WITHDRAW) {
      toast.show('error', `Minimum withdrawal is ${MIN_WITHDRAW} USDC`);
      return;
    }
    setBusy(true);
    const tid = toast.loading(`Withdrawing ${amount} USDC…`);
    try {
      const wallet = wallets.find((w) => w.address.toLowerCase() === evmAddress.toLowerCase());
      if (!wallet) throw new Error('Connected wallet not found');
      const provider = await wallet.getEthereumProvider();
      try { await wallet.switchChain(arbitrum.id); } catch { /* already on it / not supported */ }
      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, chain: arbitrum, transport: custom(provider) });
      const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });
      await client.withdraw3({ destination: (dest || evmAddress) as `0x${string}`, amount });
      toast.update(tid, 'success', `Withdrawal submitted — arrives on Arbitrum in ~5 min`);
      setAmount('');
    } catch (e) {
      toast.update(tid, 'error', (e as Error).message || 'Withdrawal failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-surface-400">Amount (USDC)</span>
          <button
            onClick={() => available != null && setAmount(String(available))}
            disabled={available == null}
            className="text-surface-300 hover:text-surface-100 disabled:opacity-40"
          >
            Perps available: {available == null ? '…' : fmt(available)} · Max
          </button>
        </div>
        <div className="flex items-center rounded-md border border-surface-700 bg-transparent px-3 transition-colors focus-within:border-brand">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full bg-transparent py-2.5 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
          <span className="text-surface-400">USDC</span>
        </div>
      </label>
      <label className="block">
        <span className="text-xs text-surface-400">Destination (Arbitrum One)</span>
        <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="0x…" className="input mt-1.5 font-mono text-xs" />
      </label>
      <div className="flex justify-between text-xs text-surface-400">
        <span>Fee</span>
        <span className="tabular">{WITHDRAW_FEE.toFixed(2)} USDC</span>
      </div>
      <div className="flex justify-between text-xs">
        <span className="text-surface-400">You receive</span>
        <span className="tabular text-surface-100">{receives.toFixed(2)} USDC</span>
      </div>
      <button
        onClick={withdraw}
        disabled={!evmAddress || amt < MIN_WITHDRAW || busy}
        className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600 disabled:opacity-40"
      >
        {busy ? 'Submitting…' : 'Withdraw'}
      </button>
      <p className="text-2xs text-surface-500">Signed (no gas). Settles to Arbitrum One in ~5 min. Min {MIN_WITHDRAW} USDC; flat {WITHDRAW_FEE} USDC fee.</p>
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
