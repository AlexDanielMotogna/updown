'use client';

import { useEffect, useMemo, useState } from 'react';
import { placeOrder } from '@/lib/api';
import { useTrading } from '@/hooks/useTrading';
import { useToast } from './Toast';
import type { Ticker, OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/**
 * Self-contained SPOT market order ticket (Phase 3b). Its own REST-polled pair
 * selector + price (no WS), buy/sell, amount in USDC. Sends `kind:'spot'`; the
 * server rounds size to the pair's szDecimals and signs with the same agent key
 * as perps. No leverage / margin / TP-SL. Live chart/orderbook for spot are a
 * later pass; this gives a usable buy/sell without touching the perp WS.
 */
export function SpotOrderTicket({ walletAddress, evmAddress, symbol: lockedSymbol }: { walletAddress?: string; evmAddress?: string; symbol?: string }) {
  const toast = useToast();
  const { enabled: tradingEnabled, busy: enabling, enableTrading } = useTrading(walletAddress, evmAddress);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [symbol, setSymbol] = useState<string>(lockedSymbol ?? '');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [amountUsd, setAmountUsd] = useState('');
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

  // Default to the highest-volume pair once loaded (unless locked).
  useEffect(() => {
    if (!lockedSymbol && !symbol && tickers.length) setSymbol(tickers[0].symbol);
  }, [tickers, symbol, lockedSymbol]);

  const selected = useMemo(() => tickers.find((t) => t.symbol === symbol), [tickers, symbol]);
  const mark = Number(selected?.mark ?? 0);
  const szDecimals = selected?.szDecimals ?? 0;
  const base = symbol.split('/')[0] || '';
  const amt = Number(amountUsd);
  // Size is priced off the limit price for LIMIT orders, else the current mark.
  const refPrice = type === 'LIMIT' ? Number(limitPrice) : mark;
  const rawSize = refPrice > 0 && amt > 0 ? amt / refPrice : 0;
  // Round DOWN to the token's lot (10^-szDecimals) so we never exceed funds and
  // never send a size that rounds to 0 server-side ("Order has zero size").
  const factor = 10 ** szDecimals;
  const baseSize = Math.floor(rawSize * factor) / factor;
  const minUsd = refPrice > 0 ? refPrice / factor : 0; // cost of one lot
  const tooSmall = amt > 0 && refPrice > 0 && baseSize <= 0;
  const belowMin = amt > 0 && amt < 10; // HL ~$10 min notional
  const limitMissing = type === 'LIMIT' && !(Number(limitPrice) > 0);
  const canSubmit = !!walletAddress && !!symbol && refPrice > 0 && amt > 0 && baseSize > 0 && !belowMin && !limitMissing && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    const tid = toast.loading(`${side === 'BUY' ? 'Buy' : 'Sell'} ${base} — pending`);
    const res = await placeOrder({
      walletAddress: walletAddress!, symbol, side, type,
      amount: baseSize.toFixed(szDecimals), kind: 'spot',
      ...(type === 'LIMIT' ? { price: limitPrice } : { maxSlippagePct: 8 }),
    });
    setBusy(false);
    if (res.success) { toast.update(tid, 'success', `${side === 'BUY' ? 'Bought' : 'Sold'} ${base}`); setAmountUsd(''); }
    else toast.update(tid, 'error', res.error?.message ?? 'Order failed');
  }

  const long = side === 'BUY';

  return (
    <div className="card space-y-2.5 p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-surface-300">Spot</span>
        <span className="text-2xs text-surface-500">market order</span>
      </div>

      {/* Pair selector (hidden when locked to a symbol) */}
      {lockedSymbol ? (
        <div className="rounded border border-surface-800 bg-[#1c1c23] px-2.5 py-2 text-sm font-semibold text-surface-100">{symbol}</div>
      ) : (
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          className="w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-sm text-surface-100 outline-none"
        >
          {tickers.map((t) => <option key={t.symbol} value={t.symbol}>{t.symbol}</option>)}
        </select>
      )}

      {/* Buy / Sell */}
      <div className="flex gap-2">
        <button onClick={() => setSide('BUY')}
          className={`flex-1 rounded py-1.5 text-sm font-semibold transition-colors ${long ? 'bg-win-500 text-black' : 'border border-surface-700 text-surface-300 hover:bg-surface-800'}`}>Buy</button>
        <button onClick={() => setSide('SELL')}
          className={`flex-1 rounded py-1.5 text-sm font-semibold transition-colors ${!long ? 'bg-loss-500 text-black' : 'border border-surface-700 text-surface-300 hover:bg-surface-800'}`}>Sell</button>
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

      {/* Amount (USDC) */}
      <label className="block">
        <span className="text-2xs text-surface-400">Amount (USDC)</span>
        <input value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} inputMode="decimal" placeholder="0.00"
          className="mt-1 w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-base tabular text-surface-100 outline-none placeholder:text-surface-500" />
      </label>

      <div className="flex items-center justify-between text-2xs text-surface-400">
        <span>Price</span><span className="tabular text-surface-200">{mark > 0 ? usd(mark) : '--'}</span>
      </div>
      <div className="flex items-center justify-between text-2xs text-surface-400">
        <span>You get ≈</span><span className="tabular text-surface-200">{baseSize > 0 ? `${baseSize.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${base}` : '--'}</span>
      </div>
      {belowMin && <div className="text-2xs text-loss-500">Minimum order is ~$10.</div>}
      {!belowMin && tooSmall && <div className="text-2xs text-loss-500">Amount too small for {base} — min ≈ {usd(minUsd)} (1 unit).</div>}

      {/* CTA */}
      {!!walletAddress && !tradingEnabled ? (
        <button onClick={enableTrading} disabled={enabling}
          className="w-full rounded-lg bg-brand py-2.5 text-sm font-bold text-surface-950 disabled:opacity-50">
          {enabling ? 'Enabling…' : 'Enable Trading'}
        </button>
      ) : (
        <button onClick={submit} disabled={!canSubmit}
          className={`w-full rounded-lg py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 ${long ? 'bg-win-500' : 'bg-loss-500'}`}>
          {busy ? 'Submitting…' : long ? `Buy ${base}` : `Sell ${base}`}
        </button>
      )}
    </div>
  );
}
