'use client';

import { useEffect, useMemo, useState } from 'react';
import { placeOrder, setLeverage as setLeverageApi } from '@/lib/api';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useTrading } from '@/hooks/useTrading';
import { useTradeMath } from '@/hooks/useTradeMath';
import { useToast } from '../Toast';
import { ConnectGate } from '../ConnectGate';
import { DepositModal } from '../DepositModal';
import { TokenIcon } from '../TokenIcon';
import { getStream } from '@/lib/stream';
import type { OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const trim = (n: number, dp: number) => (Number.isFinite(n) ? n.toFixed(dp).replace(/\.?0+$/, '') : '');

/** Per-asset leverage set in Pro (or default 5x). Read-only in Simple (§8.1). */
function readLeverage(symbol: string): number {
  try {
    const raw = window.localStorage.getItem(`updown-lev-${symbol}`);
    if (raw) { const { lev } = JSON.parse(raw) as { lev?: number }; if (typeof lev === 'number' && lev > 0) return lev; }
  } catch {/* ignore */}
  return 5;
}

/**
 * Robinhood-style one-decision trade form (PLAN-SIMPLE-MODE §4.2): the amount is
 * the hero. Shared body for the trade modal and the simple market page. Reuses the
 * same backend as Pro (placeOrder MARKET, setLeverage, useAccountStream) — UI only.
 */
export function SimpleTradePanel({
  symbol,
  walletAddress,
  evmAddress,
  initialSide,
  onClose,
}: {
  symbol: string;
  walletAddress?: string;
  evmAddress?: string;
  initialSide?: OrderSide;
  onClose?: () => void;
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

  // Live mark over the shared WS (allMids) — no REST polling.
  useEffect(() => {
    const unsub = getStream().subscribePrices((prices) => {
      const p = prices.find((x) => x.symbol === symbol);
      if (p) setMark(Number(p.mark));
    });
    return unsub;
  }, [symbol]);

  const pos = useMemo(() => positions.find((p) => p.symbol === symbol), [positions, symbol]);
  const leverage = pos?.leverage && pos.leverage > 0 ? pos.leverage : readLeverage(symbol);
  const marginMode = (pos?.metadata?.leverageType as 'cross' | 'isolated' | undefined) ?? 'cross';
  const available = acct ? Math.max(0, Number(acct.accountEquity) - Number(acct.marginUsed)) : 0;

  const math = useTradeMath({ side, leverage, mark, available, amountUsd });

  const long = side === 'BUY';
  const needsAgent = !!walletAddress && !tradingEnabled;
  const needsBuilder = !!walletAddress && tradingEnabled && builderApproved === false;
  const needsDeposit = !!walletAddress && !!evmAddress && accountReady && !!acct && Number(acct.accountEquity) <= 0;
  const canSubmit = !!walletAddress && mark > 0 && math.cost > 0 && !math.exceedsBalance && !busy;

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
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="font-semibold text-surface-100 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="relative flex flex-col gap-4 p-4">
      {/* devEvm must be the DEV env var (local-only skip), NOT the resolved
          evmAddress — passing the address disabled the gate for any persisted
          session, letting a disconnected wallet still trade. */}
      <ConnectGate devEvm={process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS} />

      {/* Header: asset + live price + close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenIcon symbol={symbol} size="md" />
          <span className="text-sm font-bold text-surface-100">{base}-PERP</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-surface-100 tabular-nums">{mark > 0 ? usd(mark) : '—'}</span>
          {onClose && <button onClick={onClose} className="text-lg text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>}
        </div>
      </div>

      {/* OPEN | CLOSE (only when a position exists) */}
      {pos && (
        <div className="flex rounded-lg bg-surface-900 p-0.5 text-xs">
          {(['OPEN', 'CLOSE'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 rounded-md py-1.5 font-semibold transition-colors ${tab === t ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
              {t === 'OPEN' ? 'Open' : 'Close'}
            </button>
          ))}
        </div>
      )}

      {tab === 'OPEN' ? (
        <>
          {/* Long / Short */}
          <div className="grid grid-cols-2 gap-2">
            {(['BUY', 'SELL'] as OrderSide[]).map((s) => {
              const active = side === s;
              const isLong = s === 'BUY';
              return (
                <button key={s} onClick={() => setSide(s)}
                  className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                    active
                      ? isLong
                        ? 'border-brand/40 bg-transparent text-brand'
                        : 'border-loss-500/40 bg-transparent text-loss-500'
                      : 'border-transparent bg-surface-800 text-surface-400 hover:text-surface-200'
                  }`}>
                  {isLong ? 'Long' : 'Short'}
                </button>
              );
            })}
          </div>

          {/* Hero amount */}
          <div className="flex flex-col items-center gap-1 py-3">
            <span className="text-xs font-medium uppercase tracking-wide text-surface-400">Amount</span>
            <div className="flex items-center justify-center">
              <span className="text-3xl font-bold text-surface-500">$</span>
              <input
                value={amountUsd}
                onChange={(e) => setAmountUsd(e.target.value.replace(/[^0-9.]/g, ''))}
                inputMode="decimal" placeholder="0"
                className="w-44 bg-transparent text-center text-4xl font-bold text-surface-100 outline-none placeholder:text-surface-600"
              />
            </div>
            <span className="text-xs text-surface-400">Available {usd(available)}</span>
          </div>

          {/* Quick % */}
          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 100].map((p) => (
              <button key={p} onClick={() => quick(p)}
                className="rounded-lg border border-surface-700 py-2 text-xs font-semibold text-surface-300 transition-colors hover:bg-surface-800 hover:text-surface-100">
                {p === 100 ? 'Max' : `${p}%`}
              </button>
            ))}
          </div>

          {/* Summary — "You pay" is the real money in; position size is leveraged. */}
          <div className="border-t border-surface-800 pt-2">
            <Info label="You pay" value={usd(math.cost)} />
            <Info label={`Position size · ${leverage}x`} value={usd(math.positionUsd)} />
            <Info label="Liquidation" value={math.liquidationPrice ? usd(math.liquidationPrice) : '—'} />
            <Info label="Est. fee" value={usd(math.estFee)} />
          </div>
          {math.exceedsBalance && <div className="text-xs text-loss-500">Amount exceeds your balance ({usd(math.maxUsd)} available).</div>}

          {/* CTA */}
          {needsDeposit ? (
            <button onClick={() => setShowDeposit(true)} className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-surface-950">Deposit USDC to trade</button>
          ) : needsAgent ? (
            <button onClick={enableTrading} disabled={enabling} className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-surface-950 disabled:opacity-50">{enabling ? 'Enabling…' : 'Enable Trading'}</button>
          ) : needsBuilder ? (
            <button onClick={approveBuilder} className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-surface-950">Approve builder fee</button>
          ) : (
            <button onClick={openPosition} disabled={!canSubmit}
              className={`w-full rounded-xl py-3.5 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 ${long ? 'bg-win-500' : 'bg-loss-500'}`}>
              {busy ? 'Submitting…' : long ? 'Open Long' : 'Open Short'}
            </button>
          )}
        </>
      ) : (
        /* CLOSE */
        <div className="flex flex-col gap-3">
          {pos && (
            <div className="border-t border-surface-800 pt-2">
              <Info label="Position" value={`${pos.side === 'LONG' ? 'Long' : 'Short'} ${pos.amount} ${base}`} />
              <Info label="Entry" value={usd(Number(pos.entryPrice))} />
              <Info label="PnL" value={`${Number(pos.unrealizedPnl) >= 0 ? '+' : ''}${usd(Number(pos.unrealizedPnl))}`} />
            </div>
          )}
          <button onClick={closePosition} disabled={busy}
            className="w-full rounded-xl bg-loss-500 py-3.5 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50">
            {busy ? 'Closing…' : 'Close Position'}
          </button>
        </div>
      )}

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
    </div>
  );
}
