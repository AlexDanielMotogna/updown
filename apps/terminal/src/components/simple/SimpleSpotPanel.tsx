'use client';

import { useEffect, useMemo, useState } from 'react';
import { placeOrder, fetchSpotBalances, type SpotBalanceRow } from '@/lib/api';
import { useTrading } from '@/hooks/useTrading';
import { useMarkets } from '@/lib/marketsCache';
import { pollWhileVisible } from '@/lib/poll';
import { useToast } from '../Toast';
import { ConnectGate } from '../ConnectGate';
import { DepositModal } from '../DepositModal';
import { TokenIcon } from '../TokenIcon';
import type { OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const qty = (n: number, dp = 6) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: dp }) : '0');
const trim = (n: number, dp: number) => (Number.isFinite(n) && n > 0 ? n.toFixed(dp).replace(/\.?0+$/, '') : '');
const pxFmt = (n: number) => (!Number.isFinite(n) || n <= 0 ? '—' : n >= 1 ? usd(n) : `$${Number(n.toPrecision(4))}`);

/**
 * Simple-mode SPOT trade panel — same Robinhood-style shell as SimpleTradePanel
 * (perps): hero amount, Buy/Sell, quick %, summary, one CTA. Buy spends USDC, Sell
 * delivers the token. Reuses the same backend (placeOrder kind:'spot'); UI only.
 */
export function SimpleSpotPanel({
  symbol,
  walletAddress,
  evmAddress,
  initialSide,
  onClose,
}: {
  symbol: string; // spot HL coin ("@N")
  walletAddress?: string;
  evmAddress?: string;
  initialSide?: OrderSide;
  onClose?: () => void;
}) {
  const toast = useToast();
  const { enabled: tradingEnabled, busy: enabling, enableTrading, checked } = useTrading(walletAddress, evmAddress);
  const ticker = useMarkets('spot').find((t) => t.symbol === symbol) ?? null; // shared cache
  const [balances, setBalances] = useState<SpotBalanceRow[]>([]);
  const [side, setSide] = useState<OrderSide>(initialSide ?? 'BUY');
  const [amount, setAmount] = useState(''); // USDC for BUY, token qty for SELL
  const [busy, setBusy] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);

  // Spot balances (available USDC / token), polled + instant on a spot trade.
  useEffect(() => {
    if (!walletAddress) return;
    let alive = true;
    const load = async () => {
      const r = await fetchSpotBalances(walletAddress);
      if (alive && r.success) setBalances(r.data ?? []);
    };
    load();
    const stop = pollWhileVisible(load, 15000);
    const onTraded = () => load();
    window.addEventListener('updown:spot-traded', onTraded);
    return () => { alive = false; stop(); window.removeEventListener('updown:spot-traded', onTraded); };
  }, [walletAddress]);

  const mark = Number(ticker?.mark ?? 0);
  const szDecimals = ticker?.szDecimals ?? 0;
  const display = ticker?.displayName ?? symbol;
  const base = display.split('/')[0] || '';
  const isSell = side === 'SELL';
  const factor = 10 ** szDecimals;

  const heldRow = balances.find((b) => b.asset === base);
  const usdcBal = Number(balances.find((b) => b.asset === 'USDC')?.available ?? 0);
  const tokenBal = Number(heldRow?.available ?? 0);
  const oraclePrice = Number(heldRow?.metadata?.price ?? 0) || mark;
  const refPrice = isSell ? oraclePrice : mark;
  const available = isSell ? tokenBal : usdcBal;

  const inAmt = Number(amount);
  const baseSize = isSell
    ? (inAmt > 0 ? Math.floor(inAmt * factor) / factor : 0)
    : (refPrice > 0 && inAmt > 0 ? Math.floor((inAmt / refPrice) * factor) / factor : 0);
  const notional = baseSize * refPrice;

  const exceedsBal = isSell ? baseSize > tokenBal : inAmt > usdcBal;
  const noFunds = useMemo(() => !balances.length ? false : usdcBal <= 0 && tokenBal <= 0, [balances.length, usdcBal, tokenBal]);
  const needsAgent = !!walletAddress && !tradingEnabled;
  const canSubmit = !!walletAddress && refPrice > 0 && baseSize > 0 && !exceedsBal && !busy;

  function quick(pct: number) {
    if (isSell) setAmount(trim(Math.floor(tokenBal * pct * factor) / factor, szDecimals));
    else setAmount((usdcBal * pct).toFixed(2));
  }

  async function submit() {
    if (!walletAddress || !canSubmit) return;
    setBusy(true);
    const tid = toast.loading(`${isSell ? 'Sell' : 'Buy'} ${base} — pending`);
    const res = await placeOrder({
      walletAddress, symbol, side, type: 'MARKET',
      amount: baseSize.toFixed(szDecimals), kind: 'spot', maxSlippagePct: 8,
    });
    setBusy(false);
    if (res.success) {
      toast.update(tid, 'success', `${isSell ? 'Sold' : 'Bought'} ${base}`);
      setAmount('');
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('updown:spot-traded'));
        setTimeout(() => window.dispatchEvent(new Event('updown:spot-traded')), 1500);
      }
      onClose?.();
    } else toast.update(tid, 'error', res.error?.message ?? 'Order failed');
  }

  const Info = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className="font-semibold text-surface-100 tabular-nums">{value}</span>
    </div>
  );

  return (
    <div className="relative flex flex-col gap-4 p-4">
      <ConnectGate devEvm={process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS} />

      {/* Header: asset + live price + close */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenIcon symbol={base} size="md" spot />
          <span className="text-sm font-bold text-surface-100">{display}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-surface-100 tabular-nums">{pxFmt(mark)}</span>
          {onClose && <button onClick={onClose} className="text-lg text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>}
        </div>
      </div>

      {/* Buy / Sell */}
      <div className="grid grid-cols-2 gap-2">
        {(['BUY', 'SELL'] as OrderSide[]).map((s) => {
          const active = side === s;
          const isBuy = s === 'BUY';
          return (
            <button key={s} onClick={() => { setSide(s); setAmount(''); }}
              className={`rounded-lg border py-2.5 text-sm font-bold transition-colors ${
                active
                  ? isBuy ? 'border-win-500/50 bg-transparent text-win-500' : 'border-loss-500/50 bg-transparent text-loss-500'
                  : 'border-transparent bg-white/[0.04] text-surface-400 hover:text-surface-200'
              }`}>
              {isBuy ? 'Buy' : 'Sell'}
            </button>
          );
        })}
      </div>

      {/* Hero amount — USDC for BUY, token qty for SELL */}
      <div className="flex flex-col items-center gap-1 py-3">
        <span className="text-xs font-medium uppercase tracking-wide text-surface-400">{isSell ? `Amount (${base})` : 'Amount'}</span>
        <div className="flex items-center justify-center">
          {!isSell && <span className="text-3xl font-bold text-surface-500">$</span>}
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
            inputMode="decimal" placeholder="0"
            className="w-44 bg-transparent text-center text-4xl font-bold text-surface-100 outline-none placeholder:text-surface-600"
          />
        </div>
        <span className="text-xs text-surface-400">Available {isSell ? `${qty(tokenBal, 4)} ${base}` : usd(usdcBal)}</span>
      </div>

      {/* Quick % */}
      <div className="grid grid-cols-3 gap-2">
        {[0.25, 0.5, 1].map((p) => (
          <button key={p} onClick={() => quick(p)} disabled={available <= 0}
            className="rounded-lg border border-surface-700 py-2 text-xs font-semibold text-surface-300 transition-colors hover:bg-white/[0.04] hover:text-surface-100 disabled:opacity-40">
            {p === 1 ? 'Max' : `${p * 100}%`}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div className="border-t border-surface-800 pt-2">
        <Info label="Price" value={pxFmt(refPrice)} />
        <Info label={isSell ? 'You sell' : 'You pay'} value={isSell ? `${qty(baseSize)} ${base}` : usd(inAmt || 0)} />
        <Info label={isSell ? 'You receive ≈' : 'You get ≈'} value={baseSize > 0 ? (isSell ? usd(notional) : `${qty(baseSize)} ${base}`) : '—'} />
      </div>
      {exceedsBal && <div className="text-xs text-loss-500">Exceeds your {isSell ? `${base} balance` : 'USDC balance'}.</div>}

      {/* CTA */}
      {!!walletAddress && !checked ? (
        <button disabled className="w-full rounded-xl bg-white/[0.04] py-3.5 text-sm font-bold text-surface-400">Loading…</button>
      ) : noFunds ? (
        <button onClick={() => setShowDeposit(true)} className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-surface-950">Deposit USDC to trade</button>
      ) : needsAgent ? (
        <button onClick={enableTrading} disabled={enabling} className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-surface-950 disabled:opacity-50">{enabling ? 'Enabling…' : 'Enable Trading'}</button>
      ) : (
        <button onClick={submit} disabled={!canSubmit}
          className={`w-full rounded-xl py-3.5 text-base font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-40 ${isSell ? 'bg-loss-500' : 'bg-win-500'}`}>
          {busy ? 'Submitting…' : isSell ? `Sell ${base}` : `Buy ${base}`}
        </button>
      )}

      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
    </div>
  );
}
