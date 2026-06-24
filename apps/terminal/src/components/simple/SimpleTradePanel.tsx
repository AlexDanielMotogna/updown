'use client';

import { useEffect, useMemo, useState } from 'react';
import { placeOrder, setLeverage as setLeverageApi } from '@/lib/api';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useTrading } from '@/hooks/useTrading';
import { useTradeMath } from '@/hooks/useTradeMath';
import { useToast } from '../Toast';
import { ConnectGate } from '../ConnectGate';
import { DepositModal } from '../DepositModal';
import type { OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const trim = (n: number, dp: number) => (Number.isFinite(n) ? n.toFixed(dp).replace(/\.?0+$/, '') : '');

/** Read the per-asset leverage the user set in Pro (or the default 5x). Simple Mode
 *  shows leverage read-only; it's changed in Pro (PLAN-SIMPLE-MODE §8.1). */
function readLeverage(symbol: string): number {
  try {
    const raw = window.localStorage.getItem(`updown-lev-${symbol}`);
    if (raw) { const { lev } = JSON.parse(raw) as { lev?: number }; if (typeof lev === 'number' && lev > 0) return lev; }
  } catch {/* ignore */}
  return 5;
}

/**
 * Kalshi-style one-decision trade form (PLAN-SIMPLE-MODE §4.2). Shared body for the
 * trade modal and the simple market page. Reuses the same backend as Pro
 * (placeOrder MARKET, setLeverage, useAccountStream) — UI only.
 */
export function SimpleTradePanel({
  symbol,
  walletAddress,
  evmAddress,
  initialSide,
  onClose,
  hideHeader,
}: {
  symbol: string;
  walletAddress?: string;
  evmAddress?: string;
  initialSide?: OrderSide;
  onClose?: () => void;
  /** Hide the in-panel title/close (e.g. when a Modal already provides them). */
  hideHeader?: boolean;
}) {
  const base = symbol.replace('-USD', '');
  const toast = useToast();
  const { account: acct, positions, ready: accountReady } = useAccountStream(evmAddress);
  const { enabled: tradingEnabled, builderApproved, busy: enabling, enableTrading, approveBuilder } = useTrading(walletAddress, evmAddress);

  const [tab, setTab] = useState<'OPEN' | 'CLOSE'>('OPEN');
  const [side, setSide] = useState<OrderSide>(initialSide ?? 'BUY');
  const [amountUsd, setAmountUsd] = useState('');
  const [mark, setMark] = useState(0);
  const [busy, setBusy] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  // Live mark for sizing.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/markets', { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !j.success) return;
        const t = (j.data as Array<{ symbol: string; mark: string }>).find((m) => m.symbol === symbol);
        if (t) setMark(Number(t.mark));
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => { alive = false; window.clearInterval(id); };
  }, [symbol]);

  const pos = useMemo(() => positions.find((p) => p.symbol === symbol), [positions, symbol]);
  // Authoritative leverage: open position's, else the user's Pro/default setting.
  const leverage = pos?.leverage && pos.leverage > 0 ? pos.leverage : readLeverage(symbol);
  const marginMode = (pos?.metadata?.leverageType as 'cross' | 'isolated' | undefined) ?? 'cross';
  const available = acct ? Math.max(0, Number(acct.accountEquity) - Number(acct.marginUsed)) : 0;

  const math = useTradeMath({ side, leverage, mark, available, amountUsd });

  const long = side === 'BUY';
  const needsAgent = !!walletAddress && !tradingEnabled;
  const needsBuilder = !!walletAddress && tradingEnabled && builderApproved === false;
  const needsDeposit = !!walletAddress && !!evmAddress && accountReady && !!acct && Number(acct.accountEquity) <= 0;
  const canSubmit = !!walletAddress && mark > 0 && math.positionUsd > 0 && !math.exceedsBalance && !busy;

  function quick(pct: number) {
    if (!math.maxUsd) return;
    setAmountUsd(trim(math.quickUsd(pct), 2));
  }

  async function openPosition() {
    if (!walletAddress || !canSubmit) return;
    setBusy(true);
    const sizeBase = trim(math.positionUsd / mark, 5);
    const verb = long ? 'Long' : 'Short';
    const tid = toast.loading(`${verb} ${base} — pending`);
    // Ensure HL has the right leverage first (idempotent).
    const lev = await setLeverageApi({ walletAddress, symbol, leverage, isCross: marginMode === 'cross' });
    if (!lev.success) { setBusy(false); toast.update(tid, 'error', lev.error?.message ?? 'Leverage update failed'); return; }

    const params = { walletAddress, symbol, side, type: 'MARKET' as const, amount: sizeBase, reduceOnly: false, maxSlippagePct: 8 };
    let res = await placeOrder(params);
    if (!res.success && /builder fee/i.test(res.error?.message ?? '')) {
      toast.update(tid, 'loading', 'Approving builder fee — sign in your wallet…');
      try { await approveBuilder(); res = await placeOrder(params); }
      catch (e) { setBusy(false); toast.update(tid, 'error', (e as Error).message || 'Builder approval failed'); return; }
    }
    setBusy(false);
    if (!res.success) { toast.update(tid, 'error', res.error?.message ?? 'Order failed'); return; }
    toast.update(tid, 'success', `${verb} ${base} — ${String(res.data?.status ?? 'submitted').toLowerCase()}`);
    setAmountUsd('');
    onClose?.();
  }

  async function closePosition() {
    if (!walletAddress || !pos) return;
    setBusy(true);
    const opp: OrderSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const tid = toast.loading(`Close ${base} — pending`);
    const res = await placeOrder({ walletAddress, symbol, side: opp, type: 'MARKET', amount: pos.amount, reduceOnly: true, maxSlippagePct: 8 });
    setBusy(false);
    toast.update(tid, res.success ? 'success' : 'error', res.success ? `Close ${base} submitted` : res.error?.message ?? 'Close failed');
    if (res.success) onClose?.();
  }

  const Info = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-1 text-xs">
      <span className="text-surface-400">{label}</span>
      <span className="font-medium text-surface-100 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="relative flex flex-col gap-3 p-3">
      {/* Connect overlay (charts/data stay open; this gates the form). */}
      <ConnectGate devEvm={evmAddress} />

      {/* Header */}
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-surface-100">{base} PERP</span>
          {onClose && (
            <button onClick={onClose} className="text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>
          )}
        </div>
      )}

      {/* OPEN | CLOSE tabs (CLOSE only when a position exists) */}
      <div className="flex gap-1 text-xs">
        {(['OPEN', ...(pos ? (['CLOSE'] as const) : [])] as Array<'OPEN' | 'CLOSE'>).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 rounded py-1.5 font-semibold ${tab === t ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'OPEN' ? (
        <>
          {/* LONG / SHORT */}
          <div className="grid grid-cols-2 gap-2">
            {(['BUY', 'SELL'] as OrderSide[]).map((s) => {
              const active = side === s;
              const isLong = s === 'BUY';
              return (
                <button key={s} onClick={() => setSide(s)}
                  className={`rounded py-2.5 text-sm font-bold transition-colors ${
                    active
                      ? isLong ? 'bg-win-500 text-black' : 'bg-loss-500 text-black'
                      : 'bg-surface-800 text-surface-400 hover:text-surface-200'
                  }`}>
                  {isLong ? 'LONG' : 'SHORT'}
                </button>
              );
            })}
          </div>

          {/* Balance */}
          <div className="text-xs text-surface-400">Available Balance: <span className="text-surface-100">{usd(available)}</span></div>

          {/* Amount */}
          <div className="rounded-lg border border-surface-700 bg-surface-900 px-3 py-2 focus-within:border-brand">
            <div className="text-2xs uppercase tracking-wide text-surface-500">Amount (USD)</div>
            <div className="flex items-center gap-1">
              <span className="text-lg font-semibold text-surface-400">$</span>
              <input
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal" placeholder="0.00"
                className="w-full bg-transparent text-lg font-semibold text-surface-100 outline-none placeholder:text-surface-600"
              />
            </div>
          </div>

          {/* Quick buttons */}
          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 100].map((p) => (
              <button key={p} onClick={() => quick(p)}
                className="rounded border border-surface-700 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-800">
                {p === 100 ? 'MAX' : `${p}%`}
              </button>
            ))}
          </div>

          {/* Auto info */}
          <div className="rounded bg-surface-900/60 px-3 py-1">
            <Info label="Position Size" value={usd(math.positionUsd)} />
            <Info label="Leverage" value={`${leverage}x`} />
            <Info label="Liquidation" value={math.liquidationPrice ? usd(math.liquidationPrice) : '—'} />
            <Info label="Est. Fee" value={usd(math.estFee)} />
          </div>
          {math.exceedsBalance && <div className="text-xs text-loss-500">Amount exceeds your buying power ({usd(math.maxUsd)} max).</div>}

          {/* CTA */}
          {needsDeposit ? (
            <button onClick={() => setShowDeposit(true)} className="w-full rounded bg-brand py-3 text-sm font-bold text-surface-950">Deposit USDC to trade</button>
          ) : needsAgent ? (
            <button onClick={enableTrading} disabled={enabling} className="w-full rounded bg-brand py-3 text-sm font-bold text-surface-950 disabled:opacity-50">{enabling ? 'Enabling…' : 'Enable Trading'}</button>
          ) : needsBuilder ? (
            <button onClick={approveBuilder} className="w-full rounded bg-brand py-3 text-sm font-bold text-surface-950">Approve builder fee</button>
          ) : (
            <button onClick={openPosition} disabled={!canSubmit}
              className={`w-full rounded-lg py-3 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 ${long ? 'bg-win-500' : 'bg-loss-500'}`}>
              {busy ? 'Submitting…' : long ? 'OPEN LONG' : 'OPEN SHORT'}
            </button>
          )}
        </>
      ) : (
        /* CLOSE */
        <div className="flex flex-col gap-2">
          {pos && (
            <div className="rounded bg-surface-900/60 px-3 py-1">
              <Info label="Position" value={`${pos.side} ${pos.amount} ${base}`} />
              <Info label="Entry" value={usd(Number(pos.entryPrice))} />
              <Info label="PnL" value={usd(Number(pos.unrealizedPnl))} />
            </div>
          )}
          <button onClick={closePosition} disabled={busy}
            className="w-full rounded-lg bg-loss-500 py-3 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? 'Closing…' : 'Close Position'}
          </button>
        </div>
      )}

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
    </div>
  );
}
