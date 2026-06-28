'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { placeOrder, setTpsl, setLeverage as setLeverageApi } from '@/lib/api';
import { marginUsd as calcMargin, maxPositionUsd, liquidationPrice as calcLiq } from '@/lib/tradeMath';
import { usePrivy } from '@privy-io/react-auth';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useAccountValue } from '@/hooks/useAccountValue';
import { useTrading } from '@/hooks/useTrading';
import { useToast } from './Toast';
import { AccountInfo } from './AccountInfo';
import { DepositModal } from './DepositModal';
import { BridgeFundModal } from './BridgeFundModal';
import { Modal } from './Modal';
import type { OrderSide, OrderType } from '@/lib/types';

// Lazy: Withdraw pulls the HL SDK (signed action). Only under Privy. No Spot↔Perps
// Transfer: under HL Unified Account spot + perps share one balance.
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
  initialSide,
}: {
  symbol: string;
  walletAddress?: string;
  evmAddress?: string;
  /** Preselect Buy/Sell (e.g. mobile sticky buttons opening the order sheet). */
  initialSide?: OrderSide;
}) {
  const base = symbol.replace('-USD', '');
  const [tab, setTab] = useState<Tab>('MARKET');
  const [side, setSide] = useState<OrderSide>(initialSide ?? 'BUY');
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
  const [showDeposit, setShowDeposit] = useState(false);
  const [showFund, setShowFund] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);

  const [mark, setMark] = useState(0);
  const [maxLev, setMaxLev] = useState(50);
  const { positions, ready: accountReady } = useAccountStream(evmAddress);
  // Buying power under Unified Account = free USDC in the (unified) balance — the
  // perps clearinghouse equity reads ~0 there, so don't use it. total drives the
  // "needs funding" gate; usdcAvailable is "Available to Trade".
  const { total: unifiedValue, usdcAvailable } = useAccountValue(evmAddress);
  const available = usdcAvailable ?? 0;
  const { enabled: tradingEnabled, builderApproved, busy: enabling, enableTrading, approveBuilder } = useTrading(walletAddress, evmAddress);
  const { ready: privyReady, authenticated, login, connectWallet } = usePrivy();
  const [approvingBuilder, setApprovingBuilder] = useState(false);
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
    persistLeveragePref(pendingLev, marginMode === 'cross');
    const r = await applyLeverage(pendingLev, marginMode === 'cross');
    if (r.ok) setShowLeverage(false);
  }
  async function confirmMargin() {
    setMarginMode(pendingMode);
    persistLeveragePref(leverage, pendingMode === 'cross');
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

  // clamp leverage to the market max
  useEffect(() => { setLeverage((l) => Math.min(l, maxLev)); }, [maxLev]);

  // The open HL position for this market (if any) — the authoritative source of
  // the current leverage + margin mode.
  const pos = useMemo(() => positions.find((p) => p.symbol === symbol), [positions, symbol]);

  // Restore the user's last leverage/margin for THIS market on a symbol change or
  // page reload, so the panel doesn't snap back to the 5x default (HL leverage is
  // per-asset and persists server-side). localStorage is the fast fallback; the
  // live HL position below is authoritative and overrides it when one exists.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`updown-lev-${symbol}`);
      if (raw) {
        const { lev, cross } = JSON.parse(raw) as { lev?: number; cross?: boolean };
        if (typeof lev === 'number' && lev > 0) setLeverage(lev);
        if (typeof cross === 'boolean') setMarginMode(cross ? 'cross' : 'isolated');
      } else {
        setLeverage(5);
        setMarginMode('cross');
      }
    } catch {/* ignore */}
  }, [symbol]);

  // Authoritative sync from the live HL position: whatever leverage/margin mode HL
  // actually holds for this market wins (e.g. after a reload, or if it was changed
  // elsewhere). Only runs when a position exists; the modal uses pendingLev so this
  // never fights an in-progress edit.
  useEffect(() => {
    if (!pos) return;
    if (typeof pos.leverage === 'number' && pos.leverage > 0) setLeverage(pos.leverage);
    const lt = pos.metadata?.leverageType as 'cross' | 'isolated' | undefined;
    if (lt === 'cross' || lt === 'isolated') setMarginMode(lt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, pos?.leverage, pos?.metadata?.leverageType]);

  /** Remember the user's leverage/margin choice for this market across reloads. */
  function persistLeveragePref(lev: number, cross: boolean) {
    try { window.localStorage.setItem(`updown-lev-${symbol}`, JSON.stringify({ lev, cross })); } catch {/* ignore */}
  }

  // Persisted max-slippage preference.
  useEffect(() => {
    const s = typeof window !== 'undefined' ? window.localStorage.getItem('updown-slippage') : null;
    if (s) setSlippage(s);
  }, []);
  function saveSlippage(v: string) {
    setSlippage(v);
    window.localStorage.setItem('updown-slippage', v);
  }

  // Shared trade math (lib/tradeMath) so Simple Mode and Pro compute identically.
  const marginUsd = calcMargin(Number(sizeUsd), leverage);
  const maxUsd = maxPositionUsd(available, leverage);
  // Estimated slippage for the current order. Limit orders cross at their price
  // (0%); a real market estimate needs order-book depth, so show 0 for now.
  const estSlip = 0;
  const estLiq = useMemo(
    () => (Number(sizeBtc) ? calcLiq(mark, side, leverage) : null),
    [mark, sizeBtc, side, leverage]
  );

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
    // Make sure HL has the intended leverage + margin mode before the order
    // (applyLeverage shows its own toast).
    const lev = await applyLeverage(leverage, marginMode === 'cross');
    if (!lev.ok) {
      setBusy(false);
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
        toast.update(tid, 'error', (e as Error).message || 'Builder fee approval failed');
        return;
      }
    }

    if (!res.success) {
      setBusy(false);
      toast.update(tid, 'error', res.error?.message ?? 'Order failed');
      return;
    }

    // Attach TP/SL as ONE HyperLiquid `positionTpsl` group — OCO + auto-cancel when
    // the position closes, so it never lingers onto the next position. Side is the
    // closing side; price cap + tick formatting are handled server-side.
    let tpslError = '';
    if (tpSl && !reduceOnly && (tpPrice || slPrice)) {
      const opp: OrderSide = side === 'BUY' ? 'SELL' : 'BUY';
      const r = await setTpsl({ walletAddress, symbol, side: opp, amount: sizeBtc, tpTriggerPrice: tpPrice || undefined, slTriggerPrice: slPrice || undefined, maxSlippagePct: Number(slippage) || undefined });
      if (!r.success) tpslError = r.data?.results?.filter((x) => !x.success).map((x) => x.error).filter(Boolean).join('; ') || r.error?.message || 'failed';
    }

    setBusy(false);
    if (tpslError) {
      toast.update(tid, 'error', `Order placed, but TP/SL failed — ${tpslError}`);
      return;
    }
    const ok = `${verb} ${sizeBtc} ${base} — ${String(res.data?.status ?? 'submitted').toLowerCase()}${res.data?.orderId ? ` · #${res.data.orderId}` : ''}`;
    toast.update(tid, 'success', ok);
  }

  async function handleApproveBuilder() {
    setApprovingBuilder(true);
    const tid = toast.loading('Approving builder fee — sign in your wallet…');
    try {
      await approveBuilder();
      toast.update(tid, 'success', 'Builder fee approved — you can trade now');
    } catch (e) {
      toast.update(tid, 'error', (e as Error).message || 'Builder approval failed');
    } finally {
      setApprovingBuilder(false);
    }
  }

  const buy = side === 'BUY';
  const needsAgent = !!walletAddress && !tradingEnabled;
  const needsBuilder = !!walletAddress && tradingEnabled && builderApproved === false;
  // A brand-new HL account (created via our app, never funded) has 0 balance, and
  // HyperLiquid rejects approveAgent/orders with "Must deposit before performing
  // actions". Prompt a deposit first instead of a failing "Enable Trading". Under
  // Unified Account the balance lives in the spot clearinghouse (perps equity reads
  // ~0), so gate on the UNIFIED value, not acct.accountEquity. Wait until it has
  // loaded (usdcAvailable != null) so we don't flash the gate on a funded account.
  const needsDeposit =
    !!walletAddress && !!evmAddress && accountReady && usdcAvailable != null && unifiedValue <= 0;
  // Primary-action button gating, in order. All of it lives on the order button
  // (no separate cards): sign in → connect wallet → enable trading → approve
  // builder fee → Buy/Long.
  const ctaCls = 'w-full rounded bg-surface-100 py-2.5 font-semibold text-surface-900 hover:bg-surface-200 disabled:opacity-50';

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
        <Row label="Order Value" value={Number(sizeUsd) > 0 ? usd(Number(sizeUsd)) : 'N/A'} />
        <Row label="Margin Required" value={marginUsd ? usd(marginUsd) : 'N/A'} />
        <Row label="Liquidation Price" value={estLiq ? usd(estLiq) : 'N/A'} />
        <Row label="Available to Trade" value={usd(available)} />
      </div>

      {/* Primary action — sign in / connect / enable / approve all on this button. */}
      {!privyReady ? (
        <button disabled className={ctaCls}>…</button>
      ) : !authenticated ? (
        <button onClick={login} className={ctaCls}>Connect to trade</button>
      ) : !evmAddress ? (
        <button onClick={() => connectWallet({ walletChainType: 'ethereum-only' })} className={ctaCls}>Connect wallet</button>
      ) : needsDeposit ? (
        <button onClick={() => setShowFund(true)} className="w-full rounded bg-brand py-2.5 font-semibold text-surface-950 transition-colors hover:bg-brand-600">
          Deposit USDC to start trading
        </button>
      ) : needsAgent ? (
        <button onClick={enableTrading} disabled={enabling} className={ctaCls}>
          {enabling ? 'Enabling…' : 'Enable Trading'}
        </button>
      ) : needsBuilder ? (
        <button onClick={handleApproveBuilder} disabled={approvingBuilder} className={ctaCls}>
          {approvingBuilder ? 'Approving…' : 'Approve Builder Fee'}
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


      {/* Deposit / Withdraw — one unified balance (Unified Account), no Spot↔Perps transfer. */}
      <div className="mt-4 grid grid-cols-2 gap-1.5">
        <button onClick={() => setShowDeposit(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↓ Deposit</button>
        <button onClick={() => setShowWithdraw(true)} className="rounded border border-surface-700 py-1.5 text-xs text-surface-300 hover:bg-surface-800">↑ Withdraw</button>
      </div>
      <div className="mt-4">
        <AccountInfo evmAddress={evmAddress} />
      </div>

      {/* Modals */}
      <DepositModal open={showDeposit} onClose={() => setShowDeposit(false)} evmAddress={evmAddress} />
      <BridgeFundModal open={showFund} onClose={() => setShowFund(false)} solanaAddress={walletAddress} evmAddress={evmAddress} />
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
          <button onClick={confirmLeverage} disabled={levBusy} className="rounded bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600 disabled:opacity-50">
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
          <button onClick={confirmMargin} disabled={levBusy} className="rounded bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600 disabled:opacity-50">
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
          <button onClick={confirmSlippage} className="rounded bg-brand py-2.5 text-sm font-semibold text-surface-950 hover:bg-brand-600">Confirm</button>
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
