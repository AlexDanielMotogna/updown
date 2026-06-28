'use client';

import { useEffect, useMemo, useState } from 'react';
import { placeOrder, fetchSpotBalances, type SpotBalanceRow } from '@/lib/api';
import { useTrading } from '@/hooks/useTrading';
import { useToast } from './Toast';
import type { Ticker, OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const qty = (n: number, dp = 6) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: dp }) : '0');
/** Price formatter that keeps precision for sub-dollar tokens ($0.002006). */
const pxFmt = (n: number) => (!Number.isFinite(n) || n <= 0 ? '--' : n >= 1 ? usd(n) : `$${Number(n.toPrecision(4))}`);

/**
 * Self-contained SPOT order ticket (Phase 3b). Own REST pair selector + price (no
 * WS), buy/sell, market/limit. BUY takes a USDC amount; SELL takes a token amount
 * (with the held balance, Max and % shortcuts) and shows the USDC you receive.
 * Sends `kind:'spot'`; the server rounds size to szDecimals and signs with the
 * same agent. No leverage. Fill price is the orderbook (mark), not the holdings
 * valuation oracle.
 */
export function SpotOrderTicket({ walletAddress, evmAddress, symbol: lockedSymbol }: { walletAddress?: string; evmAddress?: string; symbol?: string }) {
  const toast = useToast();
  const { enabled: tradingEnabled, busy: enabling, enableTrading } = useTrading(walletAddress, evmAddress);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [balances, setBalances] = useState<SpotBalanceRow[]>([]);
  const [symbol, setSymbol] = useState<string>(lockedSymbol ?? '');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amountIn, setAmountIn] = useState(''); // USDC for BUY, token qty for SELL
  const [limitPrice, setLimitPrice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const j = await fetch('/api/markets?kind=spot', { cache: 'no-store' }).then((r) => r.json());
        if (alive && j.success) setTickers(j.data ?? []);
      } catch { /* keep last */ }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const loadBalances = useMemo(() => async () => {
    if (!walletAddress) return;
    const r = await fetchSpotBalances(walletAddress);
    if (r.success) setBalances(r.data ?? []);
  }, [walletAddress]);
  useEffect(() => {
    let alive = true;
    const run = () => { if (alive) loadBalances(); };
    run();
    const id = setInterval(run, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [loadBalances]);

  useEffect(() => {
    if (!lockedSymbol && !symbol && tickers.length) setSymbol(tickers[0].symbol);
  }, [tickers, symbol, lockedSymbol]);

  const selected = useMemo(() => tickers.find((t) => t.symbol === symbol), [tickers, symbol]);
  const mark = Number(selected?.mark ?? 0);
  const szDecimals = selected?.szDecimals ?? 0;
  const display = selected?.displayName ?? symbol;
  const base = display.split('/')[0] || '';
  const isSell = side === 'SELL';
  const factor = 10 ** szDecimals;

  const heldRow = balances.find((b) => b.asset === base);
  const usdcBal = Number(balances.find((b) => b.asset === 'USDC')?.available ?? 0);
  const tokenBal = Number(heldRow?.available ?? 0);
  // SELL estimate uses the token's holdings-valuation price (tokenDetails oracle,
  // = what Holdings shows) so "You get" is consistent; BUY uses the orderbook mark.
  const oraclePrice = Number(heldRow?.metadata?.price ?? 0) || mark;
  const marketPrice = isSell ? oraclePrice : mark;
  const refPrice = type === 'LIMIT' ? Number(limitPrice) : marketPrice;
  const available = isSell ? tokenBal : usdcBal;

  const inAmt = Number(amountIn);
  // baseSize is always in token units, floored to the lot (avoids zero-size / over-funds).
  const baseSize = isSell
    ? (inAmt > 0 ? Math.floor(inAmt * factor) / factor : 0)
    : (refPrice > 0 && inAmt > 0 ? Math.floor((inAmt / refPrice) * factor) / factor : 0);
  const notional = baseSize * refPrice;

  const limitMissing = type === 'LIMIT' && !(Number(limitPrice) > 0);
  const belowMin = inAmt > 0 && notional > 0 && notional < 10; // HL ~$10 min
  const tooSmall = inAmt > 0 && refPrice > 0 && baseSize <= 0;
  const exceedsBal = isSell ? (baseSize > tokenBal) : (inAmt > usdcBal);
  const canSubmit = !!walletAddress && !!symbol && refPrice > 0 && baseSize > 0 && notional >= 10 && !exceedsBal && !limitMissing && !busy;

  const setMax = () => setAmountIn(isSell ? String(tokenBal) : String(usdcBal));
  const setPct = (p: number) => setAmountIn(isSell ? String(Math.floor(tokenBal * p * factor) / factor) : (usdcBal * p).toFixed(2));

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const tid = toast.loading(`${isSell ? 'Sell' : 'Buy'} ${base} — pending`);
    const res = await placeOrder({
      walletAddress: walletAddress!, symbol, side, type,
      amount: baseSize.toFixed(szDecimals), kind: 'spot',
      ...(type === 'LIMIT' ? { price: limitPrice } : { maxSlippagePct: 8 }),
    });
    setBusy(false);
    if (res.success) {
      toast.update(tid, 'success', `${isSell ? 'Sold' : 'Bought'} ${base}`);
      setAmountIn('');
      setTimeout(loadBalances, 1500);
      // Tell the Holdings tab (separate component) to refresh now, not on its poll.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('updown:spot-traded'));
        setTimeout(() => window.dispatchEvent(new Event('updown:spot-traded')), 1500);
      }
    }
    else toast.update(tid, 'error', res.error?.message ?? 'Order failed');
  }

  return (
    <div className="card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-surface-300">Spot</span>
        <span className="text-2xs text-surface-500">{type === 'LIMIT' ? 'limit order' : 'market order'}</span>
      </div>

      {lockedSymbol ? (
        <div className="rounded border border-surface-800 bg-[#1c1c23] px-2.5 py-2 text-sm font-semibold text-surface-100">{display}</div>
      ) : (
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-sm text-surface-100 outline-none">
          {tickers.map((t) => <option key={t.symbol} value={t.symbol}>{t.displayName ?? t.symbol}</option>)}
        </select>
      )}

      {/* Buy / Sell */}
      <div className="flex gap-2">
        <button onClick={() => { setSide('BUY'); setAmountIn(''); }}
          className={`flex-1 rounded py-1.5 text-sm font-semibold transition-colors ${!isSell ? 'bg-win-500 text-black' : 'border border-surface-700 text-surface-300 hover:bg-surface-800'}`}>Buy</button>
        <button onClick={() => { setSide('SELL'); setAmountIn(''); }}
          className={`flex-1 rounded py-1.5 text-sm font-semibold transition-colors ${isSell ? 'bg-loss-500 text-black' : 'border border-surface-700 text-surface-300 hover:bg-surface-800'}`}>Sell</button>
      </div>

      {/* Market / Limit */}
      <div className="flex rounded-lg bg-surface-800 p-0.5 text-2xs font-semibold">
        {(['MARKET', 'LIMIT'] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 rounded-md py-1 transition-colors ${type === t ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200'}`}>
            {t === 'MARKET' ? 'Market' : 'Limit'}
          </button>
        ))}
      </div>
      {type === 'LIMIT' && (
        <label className="block">
          <span className="text-2xs text-surface-400">Limit price</span>
          <input value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} inputMode="decimal" placeholder={mark > 0 ? String(mark) : '0.00'}
            className="mt-1 w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
        </label>
      )}

      {/* Amount — USDC for BUY, token qty for SELL */}
      <label className="block">
        <div className="mb-1 flex items-center justify-between text-2xs">
          <span className="text-surface-400">Amount ({isSell ? base : 'USDC'})</span>
          <button onClick={setMax} className="text-surface-300 hover:text-surface-100">
            Available: {isSell ? `${qty(available, 4)} ${base}` : usd(available)} · Max
          </button>
        </div>
        <input value={amountIn} onChange={(e) => setAmountIn(e.target.value)} inputMode="decimal" placeholder="0.00"
          className="w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
      </label>
      <div className="flex gap-1.5">
        {[0.25, 0.5, 1].map((p) => (
          <button key={p} onClick={() => setPct(p)} disabled={available <= 0}
            className="flex-1 rounded border border-surface-700 py-1 text-2xs text-surface-300 hover:bg-surface-800 disabled:opacity-40">
            {p === 1 ? '100%' : `${p * 100}%`}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-2xs text-surface-400">
        <span>Price</span><span className="tabular text-surface-200">{pxFmt(refPrice)}</span>
      </div>
      <div className="flex items-center justify-between text-2xs text-surface-400">
        <span>{isSell ? 'You sell' : 'You pay'}</span>
        <span className="tabular text-surface-200">{isSell ? `${qty(baseSize)} ${base}` : usd(inAmt || 0)}</span>
      </div>
      <div className="flex items-center justify-between text-2xs text-surface-400">
        <span>You get ≈</span>
        <span className="tabular text-surface-200">{baseSize > 0 ? (isSell ? usd(notional) : `${qty(baseSize)} ${base}`) : '--'}</span>
      </div>
      {belowMin && <div className="text-2xs text-loss-500">Minimum order is ~$10.</div>}
      {!belowMin && tooSmall && <div className="text-2xs text-loss-500">Amount too small for {base}.</div>}
      {exceedsBal && <div className="text-2xs text-loss-500">Exceeds your {isSell ? `${base} balance` : 'USDC balance'}.</div>}

      {/* CTA */}
      {!!walletAddress && !tradingEnabled ? (
        <button onClick={enableTrading} disabled={enabling}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-surface-950 disabled:opacity-50">
          {enabling ? 'Enabling…' : 'Enable Trading'}
        </button>
      ) : (
        <button onClick={submit} disabled={!canSubmit}
          className={`w-full rounded-lg py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 ${!isSell ? 'bg-win-500' : 'bg-loss-500'}`}>
          {busy ? 'Submitting…' : isSell ? `Sell ${base}` : `Buy ${base}`}
        </button>
      )}
    </div>
  );
}
