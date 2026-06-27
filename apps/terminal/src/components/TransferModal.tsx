'use client';

import { useCallback, useEffect, useState } from 'react';
import { useWallets } from '@privy-io/react-auth';
import { ExchangeClient, HttpTransport } from '@nktkas/hyperliquid';
import { createWalletClient, custom } from 'viem';
import { Modal } from './Modal';
import { useToast } from './Toast';
import { IS_TESTNET } from '@/lib/api';
import { fetchPerpsWithdrawable, fetchSpotUsdc } from '@/lib/hlBalances';

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Move USDC between the HL Spot and Perp balances (`usdClassTransfer`). Bridge
 * deposits and spot funds aren't usable as perp margin until transferred here —
 * this terminal trades perps, so funds generally need to be on the Perp side.
 * Instant, no fee, no on-chain tx (a signed L1 action by the user's main wallet).
 */
function Inner({ evmAddress }: { evmAddress?: string }) {
  const { wallets } = useWallets();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [toPerp, setToPerp] = useState(true); // Spot → Perps
  const [busy, setBusy] = useState(false);
  const [spot, setSpot] = useState<number | null>(null);
  const [perps, setPerps] = useState<number | null>(null);

  const loadBalances = useCallback(() => {
    if (!evmAddress) return;
    fetchSpotUsdc(evmAddress).then(setSpot);
    fetchPerpsWithdrawable(evmAddress).then(setPerps);
  }, [evmAddress]);
  useEffect(() => { loadBalances(); }, [loadBalances]);

  // The side we're moving FROM bounds the amount.
  const sourceBal = toPerp ? spot : perps;

  async function transfer() {
    if (!evmAddress || !amount || Number(amount) <= 0) return;
    setBusy(true);
    const dir = toPerp ? 'Spot → Perps' : 'Perps → Spot';
    const tid = toast.loading(`Transferring ${amount} USDC (${dir})…`);
    try {
      const wallet = wallets.find((w) => w.address.toLowerCase() === evmAddress.toLowerCase());
      if (!wallet) throw new Error('Connected wallet not found');
      const provider = await wallet.getEthereumProvider();
      const walletClient = createWalletClient({ account: evmAddress as `0x${string}`, transport: custom(provider) });
      const client = new ExchangeClient({ transport: new HttpTransport({ isTestnet: IS_TESTNET }), wallet: walletClient });
      await client.usdClassTransfer({ amount, toPerp });
      toast.update(tid, 'success', `Transferred ${amount} USDC (${dir})`);
      setAmount('');
      setTimeout(loadBalances, 1500);
    } catch (e) {
      toast.update(tid, 'error', (e as Error).message || 'Transfer failed');
    } finally {
      setBusy(false);
    }
  }

  const seg = (active: boolean) =>
    `rounded py-2 text-sm font-semibold ${active ? 'bg-surface-700 text-surface-100' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`;

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-1.5">
        <button onClick={() => setToPerp(true)} className={seg(toPerp)}>Spot → Perps</button>
        <button onClick={() => setToPerp(false)} className={seg(!toPerp)}>Perps → Spot</button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-2xs">
        <div className={`rounded px-2 py-1.5 ${toPerp ? 'bg-surface-800 text-surface-200' : 'text-surface-400'}`}>
          Spot <span className="float-right tabular">{spot == null ? '…' : `${fmt(spot)} USDC`}</span>
        </div>
        <div className={`rounded px-2 py-1.5 ${!toPerp ? 'bg-surface-800 text-surface-200' : 'text-surface-400'}`}>
          Perps <span className="float-right tabular">{perps == null ? '…' : `${fmt(perps)} USDC`}</span>
        </div>
      </div>
      <label className="block">
        <div className="mb-1.5 flex items-center justify-between text-xs">
          <span className="text-surface-400">Amount (USDC)</span>
          <button
            onClick={() => sourceBal != null && setAmount(String(sourceBal))}
            disabled={sourceBal == null}
            className="text-surface-300 hover:text-surface-100 disabled:opacity-40"
          >
            Available: {sourceBal == null ? '…' : fmt(sourceBal)} · Max
          </button>
        </div>
        <div className="flex items-center rounded border border-surface-700 bg-[#1c1c23] px-3">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" className="w-full bg-transparent py-2.5 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
          <span className="text-surface-400">USDC</span>
        </div>
      </label>
      <button
        onClick={transfer}
        disabled={!evmAddress || !amount || Number(amount) <= 0 || (sourceBal != null && Number(amount) > sourceBal) || busy}
        className="w-full rounded bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600 disabled:opacity-40"
      >
        {busy ? 'Transferring…' : 'Transfer'}
      </button>
      <p className="text-2xs text-surface-500">Instant, no fee. Perp trading + the builder-fee minimum use the Perp balance.</p>
    </div>
  );
}

export function TransferModal({ open, onClose, evmAddress }: { open: boolean; onClose: () => void; evmAddress?: string }) {
  return (
    <Modal open={open} onClose={onClose} title="Transfer USDC (Spot ↔ Perps)">
      <Inner evmAddress={evmAddress} />
    </Modal>
  );
}
