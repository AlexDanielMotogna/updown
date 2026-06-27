'use client';

import { useEffect, useState } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';
import { createPublicClient, http, type Hex } from 'viem';
import { arbitrum } from 'viem/chains';
import { Modal } from './Modal';
import { getBridgeQuote, type BridgeQuote } from '@/lib/api';
import { useBridgeExecute } from '@/hooks/useBridgeExecute';
import { useHlDeposit } from '@/hooks/useHlDeposit';

const fmtUsdc = (micro: string) => (Number(micro) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });

// Solana USDC (mainnet) — the source balance shown in the modal.
const SOLANA_USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const SOLANA_RPC = process.env.NEXT_PUBLIC_SOLANA_MAINNET_RPC_URL || 'https://api.mainnet-beta.solana.com';
const ARBITRUM_USDC: Hex = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_BALANCE_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'a', type: 'address' }], outputs: [{ type: 'uint256' }] },
] as const;

async function fetchSolanaUsdc(address: string): Promise<number> {
  const conn = new Connection(SOLANA_RPC, 'confirmed');
  const res = await conn.getParsedTokenAccountsByOwner(new PublicKey(address), { mint: SOLANA_USDC_MINT });
  return res.value.reduce((sum, a) => {
    const ui = (a.account.data as { parsed?: { info?: { tokenAmount?: { uiAmount?: number } } } }).parsed?.info?.tokenAmount?.uiAmount;
    return sum + (ui ?? 0);
  }, 0);
}

async function fetchArbitrumUsdc(address: string): Promise<number> {
  const client = createPublicClient({ chain: arbitrum, transport: http(process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || undefined) });
  const bal = (await client.readContract({ address: ARBITRUM_USDC, abi: USDC_BALANCE_ABI, functionName: 'balanceOf', args: [address as Hex] })) as bigint;
  return Number(bal) / 1e6;
}

/**
 * Full funding flow: bridge Solana USDC → Arbitrum (sign once on Solana), then
 * deposit into HyperLiquid via the permit relayer (sign an off-chain permit, the
 * relayer pays Arbitrum gas). Four steps; the user never needs ETH.
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
  const [balance, setBalance] = useState<number | null>(null);
  const [arbBalance, setArbBalance] = useState<number | null>(null);
  const bridge = useBridgeExecute();
  const hl = useHlDeposit();

  const amt = Number(amount);
  const exceeds = balance != null && amt > balance;
  const ready = !!solanaAddress && !!evmAddress && amt > 0 && !exceeds;
  // HyperLiquid drops deposits under 5 USDC, and the bridge takes a fee, so the
  // amount ARRIVING on Arbitrum (toAmountMin) must clear 5 USDC or the funds get
  // stranded on the EVM wallet (can't be deposited). Block those transfers.
  const HL_MIN = 5_000_000;
  const belowHlMin = !!quote && Number(quote.toAmountMin) < HL_MIN;

  // Load the user's Solana USDC balance (the source) so they know the max.
  useEffect(() => {
    if (!open || !solanaAddress) return;
    let alive = true;
    setBalance(null);
    fetchSolanaUsdc(solanaAddress).then((b) => { if (alive) setBalance(b); }).catch(() => { if (alive) setBalance(null); });
    return () => { alive = false; };
  }, [open, solanaAddress]);

  // Load any USDC already on Arbitrum (e.g. a prior bridge that didn't reach HL) so
  // we can offer a direct deposit / recovery. Refetch after a deposit completes.
  useEffect(() => {
    if (!open || !evmAddress) return;
    let alive = true;
    setArbBalance(null);
    fetchArbitrumUsdc(evmAddress).then((b) => { if (alive) setArbBalance(b); }).catch(() => { if (alive) setArbBalance(null); });
    return () => { alive = false; };
  }, [open, evmAddress, hl.step]);
  const bridgeRunning = bridge.step === 'quoting' || bridge.step === 'signing' || bridge.step === 'bridging';
  const hlRunning = hl.step === 'permit' || hl.step === 'depositing';
  const busy = bridgeRunning || hlRunning;
  const bridgeStarted = bridge.step !== 'idle';
  // The progress view also covers a standalone deposit (recovery of USDC already
  // on Arbitrum), so it triggers on the HL flow alone too.
  const started = bridgeStarted || hl.step !== 'idle';

  useEffect(() => {
    if (!open) { bridge.reset(); hl.reset(); setAmount(''); setQuote(null); setErr(null); }
  }, [open, bridge, hl]);

  // Debounced quote preview (only before the flow starts).
  useEffect(() => {
    if (!ready || started) return;
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
  }, [amount, solanaAddress, evmAddress, ready, started, amt]);

  const row = (label: string, value: string) => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="font-medium tabular-nums text-surface-100">{value}</span>
    </div>
  );

  async function confirm() {
    if (!ready) return;
    await bridge.run({ amountMicro: String(Math.round(amt * 1e6)), fromAddress: solanaAddress!, toAddress: evmAddress! });
  }

  // ── Progress view (once the flow starts) ────────────────────────────────
  if (started) {
    const steps: { label: string; state: 'done' | 'active' | 'pending' | 'error' }[] = [
      // Bridge steps only when an actual bridge is running (a standalone deposit
      // of existing Arbitrum USDC skips straight to the deposit steps).
      ...(bridgeStarted ? [
        { label: 'Sign on Solana', state: subState(bridge.step === 'quoting' || bridge.step === 'signing', bridge.step !== 'quoting' && bridge.step !== 'signing' && bridge.step !== 'idle', bridge.step === 'error') },
        { label: 'Bridging to Arbitrum', state: subState(bridge.step === 'bridging', bridge.step === 'done', false) },
      ] : []),
      { label: 'Authorize deposit', state: subState(hl.step === 'permit', hl.step === 'depositing' || hl.step === 'done', hl.step === 'error') },
      { label: 'Deposit to HyperLiquid', state: subState(hl.step === 'depositing', hl.step === 'done', hl.step === 'error') },
    ];
    const bridgeFailed = bridge.step === 'error';
    const canDeposit = bridge.step === 'done' && (hl.step === 'idle' || hl.step === 'error');

    return (
      <Modal open={open} onClose={busy ? () => {} : onClose} title="Funding trading">
        <div className="space-y-3">
          {steps.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[0.7rem] ${
                s.state === 'done' ? 'bg-brand text-surface-950'
                : s.state === 'active' ? 'border border-brand text-brand'
                : s.state === 'error' ? 'border border-loss-500 text-loss-500'
                : 'border border-surface-700 text-surface-500'
              }`}>
                {s.state === 'done' ? '✓' : s.state === 'error' ? '✕' : s.state === 'active' ? '•' : ''}
              </span>
              <span className={`text-sm ${s.state === 'pending' ? 'text-surface-500' : 'text-surface-100'}`}>{s.label}</span>
              {s.state === 'active' && <span className="ml-auto text-xs text-surface-400">…</span>}
            </div>
          ))}

          {(bridgeFailed || hl.step === 'error') && (
            <div className="rounded-lg border border-loss-500/40 bg-loss-500/5 p-2 text-sm text-loss-500">
              {bridge.error ?? hl.error ?? 'Something went wrong'}
            </div>
          )}
          {hl.step === 'done' && (
            <div className="rounded-lg border border-brand/40 bg-brand/5 p-2 text-sm text-brand">
              Done. Your USDC is in your HyperLiquid trading account. Ready to trade.
            </div>
          )}

          {canDeposit && (
            <button
              onClick={() => evmAddress && hl.run(evmAddress)}
              className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600"
            >
              {hl.step === 'error' ? 'Retry deposit to HyperLiquid' : 'Deposit to HyperLiquid'}
            </button>
          )}
          {!busy && !canDeposit && (
            <button onClick={onClose} className="w-full rounded-lg bg-surface-800 py-2.5 text-sm font-semibold text-surface-100 hover:bg-surface-700">
              {hl.step === 'done' ? 'Close' : 'Back'}
            </button>
          )}
        </div>
      </Modal>
    );
  }

  // ── Quote / confirm view ────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={onClose} title="Transfer to trading">
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-surface-400">
          Move USDC from your Solana balance into your HyperLiquid trading account. You sign on
          Solana and a gasless permit; you never need ETH.
        </p>

        {/* Recovery / direct deposit: USDC already sitting on Arbitrum (e.g. a
            prior bridge that didn't reach HL) can be deposited without bridging. */}
        {arbBalance != null && arbBalance >= 5 && (
          <div className="rounded-lg border border-brand/40 bg-brand/5 p-3">
            <div className="text-sm text-surface-100">
              You have <span className="font-semibold">{arbBalance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC</span> on Arbitrum ready to deposit.
            </div>
            <button
              onClick={() => evmAddress && hl.run(evmAddress)}
              className="mt-2 w-full rounded-lg bg-brand py-2 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600"
            >
              Deposit to HyperLiquid
            </button>
          </div>
        )}

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-surface-400">Amount (USDC)</label>
            <span className="text-xs text-surface-400">
              Balance:{' '}
              <button
                type="button"
                onClick={() => balance != null && setAmount(String(balance))}
                className="font-semibold text-surface-200 hover:text-brand"
              >
                {balance != null ? `${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC` : '…'}
              </button>
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="100"
            className={`w-full rounded-lg border bg-surface-900 px-3 py-2 text-sm text-surface-100 outline-none focus:border-brand ${exceeds ? 'border-loss-500' : 'border-surface-700'}`}
          />
          {exceeds && <div className="mt-1 text-xs text-loss-500">Amount exceeds your Solana USDC balance.</div>}
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
                {belowHlMin && (
                  <div className="mt-2 rounded border border-loss-500/40 bg-loss-500/5 p-2 text-xs text-loss-500">
                    After fees you&apos;d receive less than HyperLiquid&apos;s 5 USDC minimum deposit.
                    Increase the amount (try 6+).
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        <button
          onClick={confirm}
          disabled={!ready || !quote || loading || belowHlMin}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-surface-950 transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:bg-surface-800 disabled:text-surface-500"
        >
          Confirm transfer
        </button>
      </div>
    </Modal>
  );
}

/** Compute a sub-step's visual state from (isActive, isDone, isError) flags. */
function subState(active: boolean, done: boolean, error: boolean): 'done' | 'active' | 'pending' | 'error' {
  if (done) return 'done';
  if (error) return 'error';
  if (active) return 'active';
  return 'pending';
}
