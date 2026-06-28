'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { placeOrder, fetchSpotBalances, type SpotBalanceRow } from '@/lib/api';
import { useTrading } from '@/hooks/useTrading';
import { useToast } from './Toast';
import { AccountInfo } from './AccountInfo';
import { DepositModal } from './DepositModal';
import type { Ticker, OrderSide } from '@/lib/types';

// Lazy: Withdraw/Transfer pull the HL SDK (signed actions). Only under Privy.
const WithdrawModal = dynamic(() => import('./WithdrawModal').then((m) => m.WithdrawModal), { ssr: false });
const TransferModal = dynamic(() => import('./TransferModal').then((m) => m.TransferModal), { ssr: false });
const HAS_PRIVY = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const qty = (n: number, dp = 6) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: dp }) : '0');
const trimNum = (n: number, dp: number) => (Number.isFinite(n) && n > 0 ? n.toFixed(dp).replace(/\.?0+$/, '') : '');
/** Price formatter that keeps precision for sub-dollar tokens ($0.002006). */
const pxFmt = (n: number) => (!Number.isFinite(n) || n <= 0 ? '--' : n >= 1 ? usd(n) : `$${Number(n.toPrecision(4))}`);

/**
 * SPOT order ticket. Visually matches the perps Place Order panel: tabs, Buy/Sell,
 * a dual Size (token) ⇄ Total (USDC) input, % shortcuts, a summary and one CTA.
 * BUY spends USDC, SELL delivers the token; both edit the same size. Sends
 * `kind:'spot'`; the server rounds size to szDecimals and signs with the same
 * agent. No leverage. SELL estimate uses the holdings-valuation oracle so it
 * matches the Holdings tab; BUY uses the orderbook mark.
 */
export function SpotOrderTicket({ walletAddress, evmAddress, symbol: lockedSymbol }: { walletAddress?: string; evmAddress?: string; symbol?: string }) {
  const toast = useToast();
  const { enabled: tradingEnabled, busy: enabling, enableTrading } = useTrading(walletAddress, evmAddress);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [balances, setBalances] = useState<SpotBalanceRow[]>([]);
  const [symbol, setSymbol] = useState<string>(lockedSymbol ?? '');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [type, setType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [sizeTok, setSizeTok] = useState(''); // base token amount
  const [totalUsd, setTotalUsd] = useState(''); // USDC amount
  const [limitPrice, setLimitPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

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
  // = what Holdings shows) so the Total is consistent; BUY uses the orderbook mark.
  const oraclePrice = Number(heldRow?.metadata?.price ?? 0) || mark;
  const marketPrice = isSell ? oraclePrice : mark;
  const refPrice = type === 'LIMIT' ? Number(limitPrice) : marketPrice;
  const available = isSell ? tokenBal : usdcBal;

  // baseSize is always token units, floored to the lot (avoids zero-size / over-funds).
  const baseSize = Number(sizeTok) > 0 ? Math.floor(Number(sizeTok) * factor) / factor : 0;
  const notional = baseSize * refPrice;

  // Dual input: editing one side derives the other off refPrice.
  function setTok(v: string) {
    setSizeTok(v);
    setTotalUsd(refPrice > 0 && Number(v) > 0 ? trimNum(Number(v) * refPrice, 2) : '');
  }
  function setUsd(v: string) {
    setTotalUsd(v);
    setSizeTok(refPrice > 0 && Number(v) > 0 ? trimNum(Number(v) / refPrice, szDecimals) : '');
  }
  function setPct(p: number) {
    if (isSell) {
      const tok = Math.floor(tokenBal * p * factor) / factor;
      setSizeTok(trimNum(tok, szDecimals));
      setTotalUsd(refPrice > 0 ? trimNum(tok * refPrice, 2) : '');
    } else {
      const target = usdcBal * p;
      setTotalUsd(trimNum(target, 2));
      setSizeTok(refPrice > 0 ? trimNum(target / refPrice, szDecimals) : '');
    }
  }
  function setMax() { setPct(1); }
  function resetAmounts() { setSizeTok(''); setTotalUsd(''); }

  const limitMissing = type === 'LIMIT' && !(Number(limitPrice) > 0);
  const belowMin = !isSell && notional > 0 && notional < 10; // ~$10 min (buys only; sells unrestricted)
  const tooSmall = Number(sizeTok) > 0 && refPrice > 0 && baseSize <= 0;
  const exceedsBal = isSell ? baseSize > tokenBal : Number(totalUsd) > usdcBal;
  // Don't hard-block on the ~$10 min — let HL decide (it may allow a full small
  // sell). Only block on real client invariants (size / balance / limit price).
  const canSubmit = !!walletAddress && !!symbol && refPrice > 0 && baseSize > 0 && !exceedsBal && !limitMissing && !busy;

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
      resetAmounts();
      setTimeout(loadBalances, 1500);
      // Tell the Holdings tab (separate component) to refresh now, not on its poll.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('updown:spot-traded'));
        setTimeout(() => window.dispatchEvent(new Event('updown:spot-traded')), 1500);
      }
    }
    else toast.update(tid, 'error', res.error?.message ?? 'Order failed');
  }

  const ctaCls = 'w-full rounded bg-surface-100 py-2.5 text-sm font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-50';

  return (
    <div className="card flex flex-1 flex-col p-3 text-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-surface-200">Place Order</span>
        <span className="rounded border border-surface-700 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-surface-400">Spot</span>
      </div>

      {/* Fallback selector only when not locked to a route pair (the chart header
          already shows the pair, so no symbol box when locked). */}
      {!lockedSymbol && (
        <select value={symbol} onChange={(e) => setSymbol(e.target.value)}
          className="mb-4 w-full rounded border border-surface-700 bg-[#1c1c23] px-2.5 py-2 text-sm text-surface-100 outline-none">
          {tickers.map((t) => <option key={t.symbol} value={t.symbol}>{t.displayName ?? t.symbol}</option>)}
        </select>
      )}

      {/* Order type tabs */}
      <div className="mb-4 flex text-xs">
        {(['MARKET', 'LIMIT'] as const).map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`flex-1 border-b-2 py-1.5 ${type === t ? 'border-surface-200 text-surface-100' : 'border-transparent text-surface-400 hover:text-surface-200'}`}>
            {t === 'MARKET' ? 'Market' : 'Limit'}
          </button>
        ))}
      </div>

      {/* Buy / Sell */}
      <div className="mb-4 grid grid-cols-2 gap-1.5">
        <button onClick={() => { setSide('BUY'); resetAmounts(); }}
          className={`rounded py-2 text-sm font-semibold ${!isSell ? 'bg-win-500 text-black' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}>Buy</button>
        <button onClick={() => { setSide('SELL'); resetAmounts(); }}
          className={`rounded py-2 text-sm font-semibold ${isSell ? 'bg-loss-500 text-black' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}>Sell</button>
      </div>

      {/* Limit price */}
      {type === 'LIMIT' && (
        <div className="mb-4">
          <div className="mb-1.5 text-xs text-surface-400">Price</div>
          <InlineInput value={limitPrice} onChange={setLimitPrice} suffix="USDC" placeholder={mark > 0 ? String(mark) : '0.00'} />
        </div>
      )}

      {/* Size dual input — Size (token) ⇄ Total (USDC) */}
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="text-surface-400">Size</span>
        <button onClick={setMax} className="text-surface-400 hover:text-surface-100">
          Avail: {isSell ? `${qty(available, 4)} ${base}` : usd(available)} · Max
        </button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <InlineInput value={sizeTok} onChange={setTok} suffix={base} />
        <InlineInput value={totalUsd} onChange={setUsd} suffix="USDC" />
      </div>

      {/* % buttons */}
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {[0.25, 0.5, 0.75, 1].map((p) => (
          <button key={p} onClick={() => setPct(p)} disabled={available <= 0}
            className="rounded bg-surface-800 py-1 text-xs text-surface-300 hover:bg-surface-700 disabled:opacity-40">
            {p === 1 ? '100%' : `${p * 100}%`}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="my-1 space-y-2 text-xs">
        <Row label="Price" value={pxFmt(refPrice)} />
        <Row label="Order Value" value={notional > 0 ? usd(notional) : 'N/A'} />
        <Row label={isSell ? 'You receive ≈' : 'You get ≈'} value={baseSize > 0 ? (isSell ? usd(notional) : `${qty(baseSize)} ${base}`) : 'N/A'} />
      </div>
      <div className="mt-2 min-h-[1rem]">
        {belowMin && <div className="text-2xs text-surface-400">Heads up: HyperLiquid may reject orders under ~$10.</div>}
        {!belowMin && tooSmall && <div className="text-2xs text-loss-500">Amount too small for {base}.</div>}
        {exceedsBal && <div className="text-2xs text-loss-500">Exceeds your {isSell ? `${base} balance` : 'USDC balance'}.</div>}
      </div>

      {/* Primary action */}
      <div className="mt-3">
        {!!walletAddress && !tradingEnabled ? (
          <button onClick={enableTrading} disabled={enabling} className={ctaCls}>
            {enabling ? 'Enabling…' : 'Enable Trading'}
          </button>
        ) : (
          <button onClick={submit} disabled={!canSubmit}
            className={`w-full rounded py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${!isSell ? 'bg-win-500' : 'bg-loss-500'}`}>
            {busy ? 'Placing…' : isSell ? `Sell ${base}` : `Buy ${base}`}
          </button>
        )}
      </div>

      {/* Funding — spot orders settle from the Spot USDC balance; Transfer moves it
          between Perps and Spot. */}
      <div className="mt-4 grid grid-cols-3 gap-1.5">
        <button onClick={() => setShowDeposit(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↓ Deposit</button>
        <button onClick={() => setShowTransfer(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800" title="Move USDC between Perps and Spot">⇄ Transfer</button>
        <button onClick={() => setShowWithdraw(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↑ Withdraw</button>
      </div>

      {/* Account overview (same as perps): Account Equity Spot/Perps + overview. */}
      <div className="mt-4">
        <AccountInfo evmAddress={evmAddress} spot />
      </div>

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
      {HAS_PRIVY && <WithdrawModal open={showWithdraw} onClose={() => setShowWithdraw(false)} evmAddress={evmAddress} />}
      {HAS_PRIVY && <TransferModal open={showTransfer} onClose={() => setShowTransfer(false)} evmAddress={evmAddress} />}
    </div>
  );
}

function InlineInput({ value, onChange, suffix, placeholder = '0.00' }: { value: string; onChange: (v: string) => void; suffix: string; placeholder?: string }) {
  return (
    <div className="flex items-center rounded border border-surface-800 bg-[#1c1c23] px-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder={placeholder}
        className="w-full bg-transparent py-2 tabular outline-none placeholder:text-surface-500"
      />
      <span className="text-xs text-surface-500">{suffix}</span>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className="tabular text-surface-200">{value}</span>
    </div>
  );
}
