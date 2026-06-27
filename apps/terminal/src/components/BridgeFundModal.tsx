'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { getBridgeQuote, type BridgeQuote } from '@/lib/api';

const fmtUsdc = (micro: string) => (Number(micro) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Fund trading by bridging Solana USDC → the user's Arbitrum (HyperLiquid) wallet.
 *
 * PHASE 1: quote preview only. Shows "you'll receive X, fee Y, ETA Z" from LI.FI.
 * Signing + execution (bridge + permit deposit to HL via relayer) land in the
 * next phase, so there's no Confirm action yet.
 */
export function BridgeFundModal({
  open,
  onClose,
  solanaAddress,
  evmAddress,
}: {
  open: boolean;
  onClose: () => void;
  solanaAddress?: string;
  evmAddress?: string;
}) {
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<BridgeQuote | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amt = Number(amount);
  const ready = !!solanaAddress && !!evmAddress && amt > 0;

  // Debounced quote whenever the amount (or addresses) change.
  useEffect(() => {
    if (!ready) { setQuote(null); setErr(null); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    setErr(null);
    const id = setTimeout(async () => {
      const micro = String(Math.round(amt * 1e6));
      const r = await getBridgeQuote({ amountMicro: micro, fromAddress: solanaAddress!, toAddress: evmAddress! });
      if (!alive) return;
      setLoading(false);
      if (r.success && r.data) { setQuote(r.data); setErr(null); }
      else { setQuote(null); setErr(r.error?.message ?? 'Could not fetch a route'); }
    }, 450);
    return () => { alive = false; clearTimeout(id); };
  }, [amount, solanaAddress, evmAddress, ready, amt]);

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="font-medium tabular-nums text-surface-100">{value}</span>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} title="Fund trading from Solana">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-surface-400">
          Move USDC from your Solana balance to your HyperLiquid trading wallet. You sign once on
          Solana and pay no Arbitrum gas.
        </p>

        {/* Amount */}
        <div>
          <label className="mb-1 block text-xs font-medium text-surface-400">Amount (USDC)</label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="100"
            className="w-full rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 text-sm text-surface-100 outline-none focus:border-brand"
          />
        </div>

        {/* Quote preview */}
        {ready && (
          <div className="rounded-lg border border-surface-800 bg-surface-900/60 p-3">
            {loading ? (
              <div className="py-2 text-center text-sm text-surface-400">Finding best route…</div>
            ) : err ? (
              <div className="py-2 text-center text-sm text-loss-500">{err}</div>
            ) : quote ? (
              <>
                {row("You'll receive", `${fmtUsdc(quote.toAmount)} USDC`)}
                {row('Min received', `${fmtUsdc(quote.toAmountMin)} USDC`)}
                {row('Bridge fee', `$${quote.feeUsd}`)}
                {row('Gas (on Solana)', `$${quote.gasUsd}`)}
                {row('ETA', quote.durationSeconds ? `~${quote.durationSeconds}s` : '—')}
                <div className="mt-1 text-right text-[0.65rem] uppercase tracking-wide text-surface-500">
                  via {quote.tool} · {quote.provider}
                </div>
              </>
            ) : null}
          </div>
        )}

        <button
          disabled
          className="w-full cursor-not-allowed rounded-lg bg-surface-800 py-2.5 text-sm font-semibold text-surface-500"
          title="Execution lands in the next phase"
        >
          Confirm (coming soon)
        </button>
      </div>
    </Modal>
  );
}
