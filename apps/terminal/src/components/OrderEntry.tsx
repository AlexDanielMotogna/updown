'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { placeOrder } from '@/lib/api';
import { AccountInfo } from './AccountInfo';
import { DepositModal } from './DepositModal';
import { Modal } from './Modal';
import type { OrderSide, OrderType } from '@/lib/types';

// Lazy: WithdrawModal pulls the HL SDK (signed withdraw). Only under Privy.
const WithdrawModal = dynamic(() => import('./WithdrawModal').then((m) => m.WithdrawModal), { ssr: false });
const HAS_PRIVY = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

type Tab = 'MARKET' | 'LIMIT' | 'STOP' | 'STOP_LIMIT';
const TABS: { key: Tab; label: string }[] = [
  { key: 'MARKET', label: 'Market' },
  { key: 'LIMIT', label: 'Limit' },
  { key: 'STOP', label: 'Stop' },
  { key: 'STOP_LIMIT', label: 'Stop Limit' },
];
const PCTS = [25, 50, 75, 100];

function tabToType(tab: Tab): OrderType {
  switch (tab) {
    case 'MARKET': return 'MARKET';
    case 'LIMIT': return 'LIMIT';
    case 'STOP': return 'STOP_MARKET';
    case 'STOP_LIMIT': return 'STOP_LIMIT';
  }
}
const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const trimNum = (n: number, dp: number) => (Number.isFinite(n) ? n.toFixed(dp).replace(/\.?0+$/, '') : '');

export function OrderEntry({
  symbol,
  walletAddress,
  evmAddress,
}: {
  symbol: string;
  walletAddress?: string;
  evmAddress?: string;
}) {
  const base = symbol.replace('-USD', '');
  const [tab, setTab] = useState<Tab>('MARKET');
  const [side, setSide] = useState<OrderSide>('BUY');
  const [marginMode, setMarginMode] = useState<'cross' | 'isolated'>('cross');
  const [leverage, setLeverage] = useState(5);
  const [sizeBtc, setSizeBtc] = useState('');
  const [sizeUsd, setSizeUsd] = useState('');
  const [price, setPrice] = useState('');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [reduceOnly, setReduceOnly] = useState(false);
  const [tpSl, setTpSl] = useState(false);
  const [tpPrice, setTpPrice] = useState('');
  const [slPrice, setSlPrice] = useState('');
  const [tpGain, setTpGain] = useState('');
  const [slLoss, setSlLoss] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [mark, setMark] = useState(0);
  const [maxLev, setMaxLev] = useState(50);
  const [available, setAvailable] = useState(0);

  // Live mark + max leverage for this market.
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/markets', { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !j.success) return;
        const t = (j.data as Array<{ symbol: string; mark: string; maxLeverage: number | null }>).find((m) => m.symbol === symbol);
        if (t) {
          setMark(Number(t.mark));
          if (t.maxLeverage) setMaxLev(t.maxLeverage);
        }
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => { alive = false; window.clearInterval(id); };
  }, [symbol]);

  // Available balance for the connected account.
  useEffect(() => {
    if (!evmAddress) { setAvailable(0); return; }
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch(`/api/positions?address=${evmAddress}`, { cache: 'no-store' });
        const j = await r.json();
        if (alive && j.success) setAvailable(Number(j.data.account?.availableToSpend ?? 0));
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => { alive = false; window.clearInterval(id); };
  }, [evmAddress]);

  // clamp leverage to the market max
  useEffect(() => { setLeverage((l) => Math.min(l, maxLev)); }, [maxLev]);

  // Persisted max-slippage preference.
  useEffect(() => {
    const s = typeof window !== 'undefined' ? window.localStorage.getItem('updown-slippage') : null;
    if (s) setSlippage(s);
  }, []);
  function saveSlippage(v: string) {
    setSlippage(v);
    window.localStorage.setItem('updown-slippage', v);
  }

  const marginUsd = Number(sizeUsd) / leverage || 0;
  const maxUsd = available * leverage;
  const estLiq = useMemo(() => {
    if (!mark || !Number(sizeBtc)) return null;
    return side === 'BUY' ? mark * (1 - 1 / leverage) : mark * (1 + 1 / leverage);
  }, [mark, sizeBtc, side, leverage]);

  function setBtc(v: string) {
    setSizeBtc(v);
    setSizeUsd(mark && v ? trimNum(Number(v) * mark, 2) : '');
  }
  function setUsd(v: string) {
    setSizeUsd(v);
    setSizeBtc(mark && v ? trimNum(Number(v) / mark, 5) : '');
  }
  function setPct(p: number) {
    if (!mark || !maxUsd) return;
    const targetUsd = (maxUsd * p) / 100;
    setSizeUsd(trimNum(targetUsd, 2));
    setSizeBtc(trimNum(targetUsd / mark, 5));
  }

  const needsPrice = tab === 'LIMIT' || tab === 'STOP_LIMIT';
  const needsTrigger = tab === 'STOP' || tab === 'STOP_LIMIT';
  const canSubmit =
    !!walletAddress && Number(sizeBtc) > 0 && (!needsPrice || !!price) && (!needsTrigger || !!triggerPrice) && !busy;

  // TP/SL: link price ⇄ gain/loss % (ROE, i.e. price move × leverage) off the
  // expected entry (limit price, or mark for market orders).
  const refPrice = needsPrice ? Number(price) : mark;
  const isLong = side === 'BUY';
  const fmtP = (v: number) => String(Number(v.toFixed(refPrice >= 100 ? 2 : 5)));
  function onTpPrice(v: string) {
    setTpPrice(v);
    if (refPrice > 0 && v) {
      const move = isLong ? (Number(v) - refPrice) / refPrice : (refPrice - Number(v)) / refPrice;
      setTpGain((move * leverage * 100).toFixed(2));
    } else setTpGain('');
  }
  function onTpGain(v: string) {
    setTpGain(v);
    if (refPrice > 0 && v) {
      const m = Number(v) / 100 / leverage;
      setTpPrice(fmtP(refPrice * (isLong ? 1 + m : 1 - m)));
    } else setTpPrice('');
  }
  function onSlPrice(v: string) {
    setSlPrice(v);
    if (refPrice > 0 && v) {
      const move = isLong ? (refPrice - Number(v)) / refPrice : (Number(v) - refPrice) / refPrice;
      setSlLoss((move * leverage * 100).toFixed(2));
    } else setSlLoss('');
  }
  function onSlLoss(v: string) {
    setSlLoss(v);
    if (refPrice > 0 && v) {
      const m = Number(v) / 100 / leverage;
      setSlPrice(fmtP(refPrice * (isLong ? 1 - m : 1 + m)));
    } else setSlPrice('');
  }

  async function submit() {
    if (!walletAddress) return;
    setBusy(true);
    setMsg(null);
    const res = await placeOrder({
      walletAddress,
      symbol,
      side,
      type: tabToType(tab),
      amount: sizeBtc,
      price: needsPrice ? price : undefined,
      triggerPrice: needsTrigger ? triggerPrice : undefined,
      reduceOnly,
      timeInForce: tab === 'LIMIT' ? 'GTC' : undefined,
    });
    if (!res.success) {
      setBusy(false);
      setMsg({ ok: false, text: res.error?.message ?? 'Order failed' });
      return;
    }

    // Attach TP/SL as reduce-only trigger orders on the opposite (closing) side.
    if (tpSl && (tpPrice || slPrice)) {
      const opp: OrderSide = side === 'BUY' ? 'SELL' : 'BUY';
      const cap = (trigger: string) => String(Number(trigger) * (opp === 'BUY' ? 1.05 : 0.95));
      if (tpPrice)
        await placeOrder({ walletAddress, symbol, side: opp, type: 'TAKE_PROFIT_MARKET', amount: sizeBtc, triggerPrice: tpPrice, price: cap(tpPrice), reduceOnly: true });
      if (slPrice)
        await placeOrder({ walletAddress, symbol, side: opp, type: 'STOP_MARKET', amount: sizeBtc, triggerPrice: slPrice, price: cap(slPrice), reduceOnly: true });
    }

    setBusy(false);
    setMsg({ ok: true, text: `Order ${res.data?.status} · #${res.data?.orderId}` });
  }

  const buy = side === 'BUY';

  return (
    <div className="card flex h-full flex-col p-3 text-sm">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-surface-200">Place Order</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMarginMode((m) => (m === 'cross' ? 'isolated' : 'cross'))}
            className="rounded border border-surface-700 px-2 py-0.5 text-xs capitalize text-surface-300 hover:bg-surface-800"
          >
            {marginMode} ▾
          </button>
          <button onClick={() => setShowSettings(true)} className="text-surface-400 hover:text-surface-100" aria-label="Settings" title="Settings">⚙</button>
        </div>
      </div>

      {/* Order type tabs */}
      <div className="mb-2 flex border-b border-surface-800 text-xs">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 border-b-2 py-1.5 ${tab === t.key ? 'border-surface-200 text-surface-100' : 'border-transparent text-surface-400 hover:text-surface-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Buy / Sell */}
      <div className="mb-3 grid grid-cols-2 gap-1">
        <button
          onClick={() => setSide('BUY')}
          className={`rounded py-2 text-sm font-semibold ${buy ? 'bg-win-500 text-black' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}
        >
          Buy / Long
        </button>
        <button
          onClick={() => setSide('SELL')}
          className={`rounded py-2 text-sm font-semibold ${!buy ? 'bg-loss-500 text-black' : 'bg-surface-800 text-surface-400 hover:text-surface-200'}`}
        >
          Sell / Short
        </button>
      </div>

      {/* Leverage */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-surface-400">Leverage</span>
          <span className="font-semibold">{leverage}x</span>
        </div>
        <input
          type="range" min={1} max={maxLev} step={1} value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full accent-win-500"
        />
        <div className="flex justify-between text-xs text-surface-500">
          <span>1x</span><span>{Math.round(maxLev / 2)}x</span><span>{maxLev}x</span>
        </div>
      </div>

      {/* Trigger price (stop) */}
      {needsTrigger && (
        <Field label="Trigger Price" value={triggerPrice} onChange={setTriggerPrice} suffix="USD" />
      )}
      {/* Limit price */}
      {needsPrice && <Field label="Price" value={price} onChange={setPrice} suffix="USD" />}

      {/* Size dual input */}
      <div className="mb-1 text-xs text-surface-400">Size</div>
      <div className="mb-2 grid grid-cols-2 gap-1">
        <InlineInput value={sizeBtc} onChange={setBtc} suffix={base} />
        <InlineInput value={sizeUsd} onChange={setUsd} suffix="USD" />
      </div>
      <div className="mb-2 flex justify-between text-xs text-surface-400">
        <span>Margin: {usd(marginUsd)}</span>
        <span>Max: {usd(maxUsd)} ({leverage}x)</span>
      </div>

      {/* % buttons */}
      <div className="mb-3 grid grid-cols-4 gap-1">
        {PCTS.map((p) => (
          <button key={p} onClick={() => setPct(p)} className="rounded bg-surface-800 py-1 text-xs text-surface-300 hover:bg-surface-700">
            {p}%
          </button>
        ))}
      </div>

      {/* Toggles */}
      <Toggle label="Reduce Only" on={reduceOnly} onClick={() => setReduceOnly((v) => !v)} />
      <Toggle label="Take Profit / Stop Loss" on={tpSl} onClick={() => setTpSl((v) => !v)} />
      {tpSl && (
        <div className="mb-2 mt-1 space-y-2">
          <div className="grid grid-cols-2 gap-1">
            <LabeledInput label="TP Price" value={tpPrice} onChange={onTpPrice} suffix="USD" />
            <LabeledInput label="Gain" value={tpGain} onChange={onTpGain} suffix="%" />
          </div>
          <div className="grid grid-cols-2 gap-1">
            <LabeledInput label="SL Price" value={slPrice} onChange={onSlPrice} suffix="USD" />
            <LabeledInput label="Loss" value={slLoss} onChange={onSlLoss} suffix="%" />
          </div>
        </div>
      )}

      {/* Info rows */}
      <div className="my-2 space-y-1 text-xs">
        <Row label="Max Slippage" value={`${slippage}%`} />
        <Row label="Est. Liq Price" value={estLiq ? usd(estLiq) : 'N/A'} />
        <Row label="Margin" value={marginUsd ? usd(marginUsd) : 'N/A'} />
        <Row label="Available" value={usd(available)} />
      </div>

      {/* Submit */}
      <button
        onClick={submit}
        disabled={!canSubmit}
        className={`mt-1 w-full rounded py-2.5 font-semibold ${buy ? 'bg-win-500 text-black' : 'bg-loss-500 text-black'} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {busy ? 'Placing…' : !walletAddress ? 'Connect to trade' : buy ? `Buy / Long` : `Sell / Short`}
      </button>

      {msg && <div className={`mt-2 text-xs ${msg.ok ? 'text-win-500' : 'text-loss-500'}`}>{msg.text}</div>}

      {/* Deposit / Withdraw */}
      <div className="mt-2 grid grid-cols-2 gap-1">
        <button onClick={() => setShowDeposit(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↓ Deposit</button>
        <button onClick={() => setShowWithdraw(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↑ Withdraw</button>
      </div>
      <div className="mt-2">
        <AccountInfo evmAddress={evmAddress} />
      </div>

      {/* Modals */}
      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
      {HAS_PRIVY && <WithdrawModal open={showWithdraw} onClose={() => setShowWithdraw(false)} evmAddress={evmAddress} />}
      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Settings">
        <label className="block text-sm">
          <span className="text-xs text-surface-400">Max Slippage (%)</span>
          <input value={slippage} onChange={(e) => saveSlippage(e.target.value)} inputMode="decimal" className="input mt-1 tabular" />
        </label>
        <p className="mt-2 text-2xs text-surface-500">Saved locally. (Market-order cap wiring to the signer is pending.)</p>
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="mb-2">
      <div className="mb-1 text-xs text-surface-400">{label}</div>
      <InlineInput value={value} onChange={onChange} suffix={suffix} />
    </div>
  );
}
function LabeledInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div>
      <div className="mb-1 text-2xs text-surface-400">{label}</div>
      <InlineInput value={value} onChange={onChange} suffix={suffix} />
    </div>
  );
}
function InlineInput({ value, onChange, suffix }: { value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="flex items-center rounded border border-surface-800 bg-[#1c1c23] px-2">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        placeholder="0.00"
        className="w-full bg-transparent py-1.5 tabular outline-none placeholder:text-surface-500"
      />
      <span className="text-xs text-surface-500">{suffix}</span>
    </div>
  );
}
function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="mb-1 flex w-full items-center gap-2 text-xs text-surface-300">
      <span className={`flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${on ? 'bg-win-500' : 'bg-surface-700'}`}>
        <span className={`h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`} />
      </span>
      {label}
    </button>
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
