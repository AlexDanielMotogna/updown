'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { getBridgeQuote, type BridgeQuote } from '@/lib/api';
import { useBridgeExecute, type BridgeStep } from '@/hooks/useBridgeExecute';

const fmtUsdc = (micro: string) => (Number(micro) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * Fund trading by bridging Solana USDC → the user's Arbitrum (HyperLiquid) wallet.
 *
 * Quote preview + execution: sign once on Solana (embedded, no popup), the bridge
 * delivers USDC to the Arbitrum wallet. The auto-deposit into HyperLiquid (permit
 * relayer) is the next phase, so success here means "USDC in your trading wallet".
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
  const { step, error: execError, run, reset } = useBridgeExecute();

  const amt = Number(amount);
  const ready = !!solanaAddress && !!evmAddress && amt > 0;
  const running = step === 'quoting' || step === 'signing' || step === 'bridging';

  // Reset transient state when the modal closes.
  useEffect(() => { if (!open) { reset(); setAmount(''); setQuote(null); setErr(null); } }, [open, reset]);

  // Debounced quote preview (skipped while a transfer is running).
  useEffect(() => {
    if (!ready || running || step === 'done') { return; }
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
  }, [amount, solanaAddress, evmAddress, ready, running, step, amt]);

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="font-medium tabular-nums text-surface-100">{value}</span>
    </div>
  );

  async function confirm() {
    if (!ready) return;
    await run({ amountMicro: String(Math.round(amt * 1e6)), fromAddress: solanaAddress!, toAddress: evmAddress! });
  }

  // ── Progress view (once a transfer starts) ──────────────────────────────
  if (step !== 'idle') {
    const steps: { label: string; state: 'done' | 'active' | 'pending' }[] = [
      { label: 'Sign on Solana', state: stepState(step, 0) },
      { label: 'Bridging to Arbitrum', state: stepState(step, 1) },
      { label: 'USDC in trading wallet', state: stepState(step, 2) },
    ];
    return (
      <Modal open={open} onClose={running ? () => {} : onClose} title="Funding trading">
        <div className="space-y-3">
          {steps.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem] ${
                s.state === 'done' ? 'bg-brand text-surface-950'
                : s.state === 'active' ? 'border border-brand text-brand'
                : 'border border-surface-700 text-surface-500'
              }`}>
                {s.state === 'done' ? '✓' : s.state === 'active' ? '•' : ''}
              </span>
              <span className={`text-sm ${s.state === 'pending' ? 'text-surface-500' : 'text-surface-100'}`}>{s.label}</span>
              {s.state === 'active' && <span className="ml-auto text-xs text-surface-400">…</span>}
            </div>
          ))}

          {step === 'error' && (
            <div className="rounded-lg border border-loss-500/40 bg-loss-500/5 p-2 text-sm text-loss-500">
              {execError ?? 'Something went wrong'}
            </div>
          )}
          {step === 'done' && (
            <div className="rounded-lg border border-brand/40 bg-brand/5 p-2 text-sm text-brand">
              Done. Your USDC is in your Arbitrum trading wallet. Auto-deposit into HyperLiquid is coming next.
            </div>
          )}

          {!running && (
            <button onClick={onClose} className="w-full rounded-lg bg-surface-800 py-2.5 text-sm font-semibold text-surface-100 hover:bg-surface-700">
              {step === 'done' ? 'Close' : 'Back'}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  // ── Quote / confirm view ────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={onClose} title="Fund trading from Solana">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-surface-400">
          Move USDC from your Solana balance to your HyperLiquid trading wallet. You sign once on
          Solana and pay no Arbitrum gas.
        </p>

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
          onClick={confirm}
          disabled={!ready || !quote || loading}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-surface-800 disabled:text-surface-500"
        >
          Confirm transfer
        </button>
      </div>
    </Modal>
  );
}

/** Map the running step to a sub-step's visual state. */
function stepState(step: BridgeStep, index: number): 'done' | 'active' | 'pending' {
  const order: BridgeStep[] = ['quoting', 'signing', 'bridging', 'done'];
  // Which sub-step is currently active.
  const activeIndex = step === 'quoting' || step === 'signing' ? 0 : step === 'bridging' ? 1 : step === 'done' ? 3 : 0;
  if (step === 'done') return 'done';
  if (step === 'error') return index === 0 ? 'done' : 'pending';
  void order;
  if (index < activeIndex) return 'done';
  if (index === activeIndex) return 'active';
  return 'pending';
}
