'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { placeOrder, setLeverage as setLeverageApi } from '@/lib/api';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useTrading } from '@/hooks/useTrading';
import { useToast } from './Toast';
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
  const [slippage, setSlippage] = useState('8');
  // HL-style confirmation modals for the risk-bearing settings.
  const [showLeverage, setShowLeverage] = useState(false);
  const [showMargin, setShowMargin] = useState(false);
  const [showSlippage, setShowSlippage] = useState(false);
  const [pendingLev, setPendingLev] = useState(5);
  const [pendingMode, setPendingMode] = useState<'cross' | 'isolated'>('cross');
  const [pendingSlip, setPendingSlip] = useState('8');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const [mark, setMark] = useState(0);
  const [maxLev, setMaxLev] = useState(50);
  const [available, setAvailable] = useState(0);
  const { account: acct } = useAccountStream(evmAddress);
  const { enabled: tradingEnabled, busy: enabling, enableTrading, approveBuilder } = useTrading(walletAddress, evmAddress);
  const toast = useToast();

  // Leverage / margin-mode application to HyperLiquid (signed by the agent key
  // server-side — no per-change wallet popup). `appliedRef` dedupes so identical
  // settings aren't re-sent; reset when the market changes (HL leverage is
  // per-asset).
  const [levBusy, setLevBusy] = useState(false);
  const [levMsg, setLevMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const appliedRef = useRef<string>('');
  useEffect(() => { appliedRef.current = ''; setLevMsg(null); }, [symbol]);

  /** Push leverage + margin mode to HL. Returns ok + a message; dedupes.
   * `kind` only changes the toast wording (leverage and margin mode are one HL
   * action), so a Cross↔Isolated change reads as "Margin mode…", not leverage. */
  async function applyLeverage(
    lev: number,
    cross: boolean,
    kind: 'leverage' | 'margin' = 'leverage'
  ): Promise<{ ok: boolean; text: string }> {
    if (!walletAddress) return { ok: false, text: 'Connect a wallet first' };
    const key = `${symbol}:${lev}:${cross}`;
    if (appliedRef.current === key) return { ok: true, text: '' };
    const mode = cross ? 'Cross' : 'Isolated';
    const label = `${lev}x ${mode}`;
    const pending = kind === 'margin' ? `Margin mode change pending — ${mode}` : `Leverage change pending — ${label}`;
    const done = kind === 'margin' ? `Margin mode set — ${mode}` : `Leverage changed — ${label}`;
    const tid = toast.loading(pending);
    setLevBusy(true);
    setLevMsg(null);
    const res = await setLeverageApi({ walletAddress, symbol, leverage: lev, isCross: cross });
    setLevBusy(false);
    if (res.success) {
      appliedRef.current = key;
      setLevMsg({ ok: true, text: label });
      toast.update(tid, 'success', done);
      return { ok: true, text: label };
    }
    const text = res.error?.message ?? `${kind === 'margin' ? 'Margin mode' : 'Leverage'} update failed`;
    setLevMsg({ ok: false, text });
    toast.update(tid, 'error', text);
    return { ok: false, text };
  }

  // Modal confirm handlers — apply only on Confirm (HL-style).
  async function confirmLeverage() {
    setLeverage(pendingLev);
    const r = await applyLeverage(pendingLev, marginMode === 'cross');
    if (r.ok) setShowLeverage(false);
  }
  async function confirmMargin() {
    setMarginMode(pendingMode);
    const r = await applyLeverage(leverage, pendingMode === 'cross', 'margin');
    if (r.ok) setShowMargin(false);
  }
  function confirmSlippage() {
    const v = Math.min(Math.max(Number(pendingSlip) || 0, 0), 50);
    saveSlippage(String(v));
    setShowSlippage(false);
    toast.show('success', `Max slippage set to ${v}%`);
  }

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

  // Available balance for the connected account (live over the WS account stream).
  useEffect(() => {
    setAvailable(acct ? Number(acct.availableToSpend) : 0);
  }, [acct]);

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
  // Estimated slippage for the current order. Limit orders cross at their price
  // (0%); a real market estimate needs order-book depth, so show 0 for now.
  const estSlip = 0;
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
    // Make sure HL has the intended leverage + margin mode before the order
    // (applyLeverage shows its own toast).
    const lev = await applyLeverage(leverage, marginMode === 'cross');
    if (!lev.ok) {
      setBusy(false);
      setMsg({ ok: false, text: lev.text });
      return;
    }

    const verb = side === 'BUY' ? 'Buy' : 'Sell';
    const tid = toast.loading(`${verb} ${sizeBtc} ${base} — order pending`);
    const orderParams = {
      walletAddress,
      symbol,
      side,
      type: tabToType(tab),
      amount: sizeBtc,
      price: needsPrice ? price : undefined,
      triggerPrice: needsTrigger ? triggerPrice : undefined,
      reduceOnly,
      timeInForce: tab === 'LIMIT' ? ('GTC' as const) : undefined,
      maxSlippagePct: Number(slippage) || undefined,
    };
    let res = await placeOrder(orderParams);

    // First order on an agent enabled before builder-fee approval existed: HL
    // rejects it. Approve the builder fee (one wallet signature) and retry once.
    if (!res.success && /builder fee/i.test(res.error?.message ?? '')) {
      toast.update(tid, 'loading', 'Approving builder fee — sign in your wallet…');
      try {
        await approveBuilder();
        toast.update(tid, 'loading', `${verb} ${sizeBtc} ${base} — order pending`);
        res = await placeOrder(orderParams);
      } catch (e) {
        setBusy(false);
        const text = (e as Error).message || 'Builder fee approval failed';
        setMsg({ ok: false, text });
        toast.update(tid, 'error', text);
        return;
      }
    }

    if (!res.success) {
      setBusy(false);
      const text = res.error?.message ?? 'Order failed';
      setMsg({ ok: false, text });
      toast.update(tid, 'error', text);
      return;
    }

    // Attach TP/SL as reduce-only trigger orders on the opposite (closing) side.
    if (tpSl && !reduceOnly && (tpPrice || slPrice)) {
      const opp: OrderSide = side === 'BUY' ? 'SELL' : 'BUY';
      const cap = (trigger: string) => String(Number(trigger) * (opp === 'BUY' ? 1.05 : 0.95));
      if (tpPrice)
        await placeOrder({ walletAddress, symbol, side: opp, type: 'TAKE_PROFIT_MARKET', amount: sizeBtc, triggerPrice: tpPrice, price: cap(tpPrice), reduceOnly: true });
      if (slPrice)
        await placeOrder({ walletAddress, symbol, side: opp, type: 'STOP_MARKET', amount: sizeBtc, triggerPrice: slPrice, price: cap(slPrice), reduceOnly: true });
    }

    setBusy(false);
    const ok = `${verb} ${sizeBtc} ${base} — ${String(res.data?.status ?? 'submitted').toLowerCase()}${res.data?.orderId ? ` · #${res.data.orderId}` : ''}`;
    setMsg({ ok: true, text: ok });
    toast.update(tid, 'success', ok);
  }

  const buy = side === 'BUY';

  return (
    <div className="card flex h-full flex-col p-3 text-sm">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-surface-200">Place Order</span>
        <button
          onClick={() => { setPendingMode(marginMode); setShowMargin(true); }}
          title="Margin mode"
          className="rounded border border-surface-700 px-2 py-0.5 text-xs capitalize text-surface-300 hover:bg-surface-800"
        >
          {marginMode} ▾
        </button>
      </div>

      {/* Order type tabs */}
      <div className="mb-4 flex text-xs">
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
      <div className="mb-4 grid grid-cols-2 gap-1.5">
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

      {/* Leverage — opens a confirmation modal (HL-style). */}
      <div className="mb-4 flex items-center justify-between text-xs">
        <span className="text-surface-400">Leverage</span>
        <button
          onClick={() => { setPendingLev(leverage); setShowLeverage(true); }}
          title="Adjust leverage"
          className="rounded border border-surface-700 px-2.5 py-1 font-semibold text-surface-100 hover:bg-surface-800"
        >
          {leverage}x ▾
        </button>
      </div>

      {/* Trigger price (stop) */}
      {needsTrigger && (
        <Field label="Trigger Price" value={triggerPrice} onChange={setTriggerPrice} suffix="USD" />
      )}
      {/* Limit price */}
      {needsPrice && <Field label="Price" value={price} onChange={setPrice} suffix="USD" />}

      {/* Size dual input */}
      <div className="mb-1.5 text-xs text-surface-400">Size</div>
      <div className="mb-3 grid grid-cols-2 gap-1.5">
        <InlineInput value={sizeBtc} onChange={setBtc} suffix={base} />
        <InlineInput value={sizeUsd} onChange={setUsd} suffix="USD" />
      </div>
      <div className="mb-3 flex justify-between text-xs text-surface-400">
        <span>Margin: {usd(marginUsd)}</span>
        <span>Max: {usd(maxUsd)} ({leverage}x)</span>
      </div>

      {/* % buttons */}
      <div className="mb-4 grid grid-cols-4 gap-1.5">
        {PCTS.map((p) => (
          <button key={p} onClick={() => setPct(p)} className="rounded bg-surface-800 py-1 text-xs text-surface-300 hover:bg-surface-700">
            {p}%
          </button>
        ))}
      </div>

      {/* Toggles — Reduce Only closes a position, so TP/SL (which attach to a new
          entry) are mutually exclusive with it. */}
      <div className="mb-1 space-y-2.5">
        <Toggle
          label="Reduce Only"
          on={reduceOnly}
          onClick={() => setReduceOnly((v) => { if (!v) setTpSl(false); return !v; })}
        />
        <Toggle
          label="Take Profit / Stop Loss"
          on={tpSl}
          disabled={reduceOnly}
          hint="off with Reduce Only"
          onClick={() => setTpSl((v) => !v)}
        />
      </div>
      {tpSl && !reduceOnly && (
        <div className="mb-2 mt-2 space-y-2.5">
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
      <div className="my-4 space-y-2 text-xs">
        {/* Slippage: estimated vs max; click the value to adjust the max. */}
        <div className="flex justify-between">
          <span className="text-surface-400">Slippage</span>
          <button
            onClick={() => { setPendingSlip(slippage); setShowSlippage(true); }}
            title="click to adjust"
            className="tabular text-surface-200 hover:text-surface-100"
          >
            Est: {trimNum(estSlip, 2) || '0'}% / Max: {Number(slippage).toFixed(2)}%
          </button>
        </div>
        <Row label="Est. Liq Price" value={estLiq ? usd(estLiq) : 'N/A'} />
        <Row label="Margin" value={marginUsd ? usd(marginUsd) : 'N/A'} />
        <Row label="Available" value={usd(available)} />
      </div>

      {/* Submit — when the wallet is connected but the trading agent isn't
          approved yet, this becomes the Enable Trading CTA (one-time setup). */}
      {walletAddress && !tradingEnabled ? (
        <button
          onClick={enableTrading}
          disabled={enabling}
          className="w-full rounded bg-surface-100 py-2.5 font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-50"
        >
          {enabling ? 'Enabling…' : 'Enable Trading'}
        </button>
      ) : (
        <button
          onClick={submit}
          disabled={!canSubmit}
          className={`w-full rounded py-2.5 font-semibold ${buy ? 'bg-win-500 text-black' : 'bg-loss-500 text-black'} disabled:cursor-not-allowed disabled:opacity-40`}
        >
          {busy ? 'Placing…' : !walletAddress ? 'Connect to trade' : buy ? `Buy / Long` : `Sell / Short`}
        </button>
      )}

      {msg && <div className={`mt-2 text-xs ${msg.ok ? 'text-win-500' : 'text-loss-500'}`}>{msg.text}</div>}

      {/* Deposit / Withdraw */}
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button onClick={() => setShowDeposit(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↓ Deposit</button>
        <button onClick={() => setShowWithdraw(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↑ Withdraw</button>
      </div>
      <div className="mt-4">
        <AccountInfo evmAddress={evmAddress} />
      </div>

      {/* Modals */}
      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
      {HAS_PRIVY && <WithdrawModal open={showWithdraw} onClose={() => setShowWithdraw(false)} evmAddress={evmAddress} />}

      {/* Adjust Leverage */}
      <Modal open={showLeverage} onClose={() => setShowLeverage(false)} title="Adjust Leverage" size="md">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm text-surface-300">Leverage for {base}</span>
          <span className="text-2xl font-semibold tabular text-surface-100">{pendingLev}x</span>
        </div>
        <input
          type="range" min={1} max={maxLev} step={1} value={pendingLev}
          onChange={(e) => setPendingLev(Number(e.target.value))}
          className="w-full accent-surface-300"
        />
        <div className="mb-4 flex justify-between text-xs text-surface-400">
          <span>1x</span><span>{Math.round(maxLev / 2)}x</span><span>{maxLev}x</span>
        </div>
        <div className="mb-4 flex gap-1.5">
          {[2, 5, 10, 20, Math.min(50, maxLev), maxLev].filter((v, i, a) => v <= maxLev && a.indexOf(v) === i).map((v) => (
            <button
              key={v}
              onClick={() => setPendingLev(v)}
              className={`flex-1 rounded border py-1.5 text-sm ${pendingLev === v ? 'border-surface-400 bg-surface-700 text-surface-100' : 'border-surface-700 text-surface-300 hover:bg-surface-800'}`}
            >
              {v}x
            </button>
          ))}
        </div>
        <p className="mb-4 text-xs text-surface-300">
          Higher leverage increases the risk of liquidation. Max for {base} is {maxLev}x. This is a signed action on HyperLiquid.
        </p>
        {levMsg && !levMsg.ok && <p className="mb-3 text-xs text-loss-500">{levMsg.text}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowLeverage(false)} className="rounded border border-surface-700 py-2.5 text-sm text-surface-200 hover:bg-surface-800">Cancel</button>
          <button onClick={confirmLeverage} disabled={levBusy} className="rounded bg-surface-100 py-2.5 text-sm font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-50">
            {levBusy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </Modal>

      {/* Margin Mode */}
      <Modal open={showMargin} onClose={() => setShowMargin(false)} title="Margin Mode" size="md">
        <div className="mb-4 space-y-2">
          {([
            { key: 'cross', title: 'Cross', desc: 'All cross positions share a single margin balance. More margin-efficient, but a liquidation can affect all positions.' },
            { key: 'isolated', title: 'Isolated', desc: 'Margin is restricted to this position. Limits losses to the assigned margin, but liquidates sooner.' },
          ] as const).map((o) => (
            <button
              key={o.key}
              onClick={() => setPendingMode(o.key)}
              className={`block w-full rounded border p-3 text-left ${pendingMode === o.key ? 'border-surface-400 bg-surface-800' : 'border-surface-700 hover:bg-surface-800'}`}
            >
              <div className="text-base font-semibold text-surface-100">{o.title}</div>
              <div className="mt-1 text-xs text-surface-300">{o.desc}</div>
            </button>
          ))}
        </div>
        <p className="mb-4 text-xs text-surface-300">This is a signed action on HyperLiquid and applies to {base}.</p>
        {levMsg && !levMsg.ok && <p className="mb-3 text-xs text-loss-500">{levMsg.text}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowMargin(false)} className="rounded border border-surface-700 py-2.5 text-sm text-surface-200 hover:bg-surface-800">Cancel</button>
          <button onClick={confirmMargin} disabled={levBusy} className="rounded bg-surface-100 py-2.5 text-sm font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-50">
            {levBusy ? 'Confirming…' : 'Confirm'}
          </button>
        </div>
      </Modal>

      {/* Max Slippage */}
      <Modal open={showSlippage} onClose={() => setShowSlippage(false)} title="Max Slippage" size="md">
        <label className="block">
          <span className="text-sm text-surface-300">Maximum slippage (%)</span>
          <div className="mt-1.5 flex items-center rounded border border-surface-700 bg-[#1c1c23] px-3">
            <input
              autoFocus
              value={pendingSlip}
              onChange={(e) => setPendingSlip(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirmSlippage()}
              inputMode="decimal"
              className="w-full bg-transparent py-2.5 text-base tabular text-surface-100 outline-none"
            />
            <span className="text-surface-300">%</span>
          </div>
        </label>
        <div className="mb-4 mt-2.5 flex gap-1.5">
          {['1', '3', '5', '8', '15'].map((v) => (
            <button
              key={v}
              onClick={() => setPendingSlip(v)}
              className={`flex-1 rounded border py-1.5 text-sm ${pendingSlip === v ? 'border-surface-400 bg-surface-700 text-surface-100' : 'border-surface-700 text-surface-300 hover:bg-surface-800'}`}
            >
              {v}%
            </button>
          ))}
        </div>
        <p className="mb-4 text-xs text-surface-300">Market orders won&apos;t fill beyond this slippage from the mid price. Saved locally.</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setShowSlippage(false)} className="rounded border border-surface-700 py-2.5 text-sm text-surface-200 hover:bg-surface-800">Cancel</button>
          <button onClick={confirmSlippage} className="rounded bg-surface-100 py-2.5 text-sm font-semibold text-surface-900 hover:bg-surface-200">Confirm</button>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 text-xs text-surface-400">{label}</div>
      <InlineInput value={value} onChange={onChange} suffix={suffix} />
    </div>
  );
}
function LabeledInput({ label, value, onChange, suffix }: { label: string; value: string; onChange: (v: string) => void; suffix: string }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs text-surface-400">{label}</div>
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
        className="w-full bg-transparent py-2 tabular outline-none placeholder:text-surface-500"
      />
      <span className="text-xs text-surface-500">{suffix}</span>
    </div>
  );
}
function Toggle({ label, on, onClick, disabled, hint }: { label: string; on: boolean; onClick: () => void; disabled?: boolean; hint?: string }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? hint : undefined}
      className={`flex w-full items-center gap-2 text-xs ${disabled ? 'cursor-not-allowed text-surface-500' : 'text-surface-300'}`}
    >
      <span className={`flex h-4 w-7 items-center rounded-full px-0.5 transition-colors ${on ? 'bg-win-500' : 'bg-surface-700'} ${disabled ? 'opacity-50' : ''}`}>
        <span className={`h-3 w-3 rounded-full bg-white transition-transform ${on ? 'translate-x-3' : ''}`} />
      </span>
      {label}
      {disabled && hint ? <span className="ml-auto text-2xs text-surface-600">{hint}</span> : null}
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
