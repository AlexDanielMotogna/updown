'use client';

import { useCallback, useEffect, useState } from 'react';
import { cancelOrder, placeOrder, setTpsl, IS_TESTNET } from '@/lib/api';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useToast } from './Toast';
import { Modal } from './Modal';
import { TokenIcon } from './TokenIcon';
import { HoldingsTab, useSpotHoldings } from './Holdings';

type CloseMode = 'market' | 'limit' | 'reverse';

type Tab = 'positions' | 'orders' | 'holdings' | 'trades' | 'funding' | 'orderhistory';
const TABS: { key: Tab; label: string; short: string }[] = [
  { key: 'positions', label: 'Positions', short: 'Positions' },
  { key: 'orders', label: 'Open Orders', short: 'Orders' },
  { key: 'holdings', label: 'Spot Holdings', short: 'Spot' },
  { key: 'trades', label: 'Trade History', short: 'Trades' },
  { key: 'funding', label: 'Funding History', short: 'Funding' },
  { key: 'orderhistory', label: 'Order History', short: 'History' },
];

const n = (s: string | number, dp = 2) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });
/** Adaptive price formatter — more decimals for low-priced assets. */
const px = (s: string | number) => {
  const v = Number(s);
  const a = Math.abs(v);
  const md = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
  return v.toLocaleString(undefined, { maximumFractionDigits: md });
};

interface Position {
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
  liquidationPrice: string;
  margin: string;
  funding: string;
  metadata?: { positionValue?: string; returnOnEquity?: string; leverageType?: string };
}
interface OpenOrder {
  orderId: string | number;
  coin: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: string;
  direction: string;
  size: string;
  remaining: string;
  origSize: string;
  price: string;
  isMarket: boolean;
  orderValue: string;
  reduceOnly: boolean;
  trigger: { condition: string; px: string } | null;
  time: number;
}

function fmtDateTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} - ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function directionColor(d: string): string {
  if (d === 'Open Long') return 'text-win-500';
  if (d === 'Open Short') return 'text-loss-500';
  return 'text-warning'; // Close Long / Close Short
}
interface Fill {
  id: string;
  oid: number;
  coin: string;
  symbol: string;
  direction: string;
  price: string;
  size: string;
  tradeValue: string;
  fee: string;
  pnl: string;
  time: number;
  hash: string;
}
interface AggFill extends Fill { fills: number }

function tradeDirColor(d: string): string {
  if (d === 'Open Long' || d === 'Close Short') return 'text-win-500';
  if (d === 'Open Short') return 'text-loss-500';
  if (d === 'Close Long') return 'text-warning';
  return 'text-surface-300';
}

function aggregateFills(fills: Fill[]): AggFill[] {
  const groups = new Map<number, Fill[]>();
  for (const f of fills) {
    const g = groups.get(f.oid) ?? [];
    g.push(f);
    groups.set(f.oid, g);
  }
  return [...groups.values()].map((g) => {
    const totSize = g.reduce((s, f) => s + Number(f.size), 0);
    const totVal = g.reduce((s, f) => s + Number(f.tradeValue), 0);
    return {
      ...g[0],
      price: String(totSize > 0 ? totVal / totSize : 0),
      size: String(totSize),
      tradeValue: String(totVal),
      fee: String(g.reduce((s, f) => s + Number(f.fee), 0)),
      pnl: String(g.reduce((s, f) => s + Number(f.pnl), 0)),
      time: Math.max(...g.map((f) => f.time)),
      fills: g.length,
    };
  });
}
interface FundingItem { symbol: string; coin: string; usdc: string; rate: string; szi: string; time: number }
interface OrderHistItem {
  orderId: string | number;
  coin: string;
  symbol: string;
  direction: string;
  type: string;
  size: string;
  filledSize: string;
  orderValue: string;
  price: string;
  isMarket: boolean;
  reduceOnly: boolean;
  trigger: { condition: string; px: string } | null;
  status: string;
  time: number;
}

function statusStyle(status: string): { label: string; cls: string } {
  const s = status.toLowerCase();
  if (s === 'open' || s === 'resting') return { label: 'Open', cls: 'text-info' };
  if (s === 'filled') return { label: 'Filled', cls: 'text-win-500' };
  if (s.includes('partial')) return { label: 'Partially Filled', cls: 'text-warning' };
  if (s.includes('reject')) return { label: 'Rejected', cls: 'text-loss-500' };
  if (s.includes('cancel')) return { label: 'Cancelled', cls: 'text-surface-400' };
  if (s.includes('trigger')) return { label: 'Triggered', cls: 'text-info' };
  if (s.includes('expir')) return { label: 'Expired', cls: 'text-surface-400' };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), cls: 'text-surface-300' };
}

export function Positions({ address, walletAddress }: { address?: string; walletAddress?: string }) {
  const [tab, setTab] = useState<Tab>('positions');
  const isMobile = useIsMobile();
  const [expandedPos, setExpandedPos] = useState<Set<string>>(new Set());
  const togglePos = (sym: string) => setExpandedPos((s) => { const n = new Set(s); n.has(sym) ? n.delete(sym) : n.add(sym); return n; });
  const [trades, setTrades] = useState<Fill[]>([]);
  const [funding, setFunding] = useState<FundingItem[]>([]);
  const [orderHist, setOrderHist] = useState<OrderHistItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [closeTarget, setCloseTarget] = useState<{ p: Position; mode: CloseMode } | null>(null);
  const [tpslTarget, setTpslTarget] = useState<Position | null>(null);
  const [ordSort, setOrdSort] = useState<{ col: 'time' | 'price'; dir: 'asc' | 'desc' }>({ col: 'time', dir: 'desc' });
  const [tradeAgg, setTradeAgg] = useState(false);
  const [tradeFilter, setTradeFilter] = useState('');
  const [tradeSort, setTradeSort] = useState<{ col: 'time' | 'price' | 'tradeValue' | 'fee' | 'pnl'; dir: 'asc' | 'desc' }>({ col: 'time', dir: 'desc' });
  const [fundFilter, setFundFilter] = useState('');
  const [fundSort, setFundSort] = useState<{ col: 'time' | 'payment'; dir: 'asc' | 'desc' }>({ col: 'time', dir: 'desc' });
  const [ohFilter, setOhFilter] = useState('');
  const [ohSort, setOhSort] = useState<{ col: 'time' | 'price'; dir: 'asc' | 'desc' }>({ col: 'time', dir: 'desc' });

  const toast = useToast();

  // Positions, OPEN ORDERS and TP/SL all come straight from the WS account stream
  // (browser → HyperLiquid, no backend hop). The server REST routes /api/orders +
  // /api/tpsl read HL `frontendOpenOrders`, which HL returns EMPTY when the call
  // comes from a datacenter IP (Railway) — so on prod they showed nothing while HL
  // held the orders (worked on localhost = residential IP). The WS carries the
  // same data, incl. trigger orders, reliably and live — so derive from it.
  const ws = useAccountStream(address);
  const positions: Position[] = ws.positions;
  // Pre-load spot holdings at the panel level so the Spot Holdings tab is ready on
  // first open (not only fetched on click).
  const holdings = useSpotHoldings(walletAddress);

  const orders: OpenOrder[] = ws.orders.map((o) => {
    const m = (o.metadata ?? {}) as { orderType?: string; isTrigger?: boolean; triggerPx?: string; triggerCondition?: string };
    const buy = o.side === 'BUY';
    const reduce = o.reduceOnly;
    const direction = reduce ? (buy ? 'Close Short' : 'Close Long') : buy ? 'Open Long' : 'Open Short';
    const type = m.orderType ?? 'Limit';
    return {
      orderId: o.orderId,
      coin: o.symbol.replace('-USD', ''),
      symbol: o.symbol,
      side: o.side,
      type,
      direction,
      size: o.remaining,
      remaining: o.remaining,
      origSize: o.amount,
      price: o.price,
      isMarket: type.toLowerCase() === 'market',
      orderValue: String(Number(o.price) * Number(o.remaining)),
      reduceOnly: reduce,
      trigger: m.isTrigger ? { condition: m.triggerCondition ?? '', px: m.triggerPx ?? '' } : null,
      time: o.createdAt,
    };
  });

  // Each position's TP/SL = its reduce-only trigger orders, derived from the feed.
  const tpslMap: Record<string, { tp?: string; sl?: string }> = {};
  for (const o of ws.orders) {
    const m = (o.metadata ?? {}) as { orderType?: string; isTrigger?: boolean; triggerPx?: string };
    if (!m.isTrigger || !m.triggerPx) continue;
    const t = (m.orderType ?? '').toLowerCase();
    (tpslMap[o.symbol] ??= {});
    if (t.includes('take profit')) tpslMap[o.symbol].tp = m.triggerPx;
    else if (t.includes('stop')) tpslMap[o.symbol].sl = m.triggerPx;
  }

  const refresh = useCallback(async () => {
    // positions + orders are WS-driven; only the history tabs use REST.
    if (!address || tab === 'positions' || tab === 'orders') return;
    const get = async (path: string) => (await fetch(`${path}?address=${address}`, { cache: 'no-store' })).json();
    try {
      if (tab === 'trades') {
        const r = await get('/api/trades');
        if (r.success) setTrades(r.data);
      } else if (tab === 'funding') {
        const r = await get('/api/funding');
        if (r.success) setFunding(r.data);
      } else {
        const r = await get('/api/orderhistory');
        if (r.success) setOrderHist(r.data);
      }
      setLoaded(true);
    } catch {/* keep */}
  }, [address, tab]);

  // Poll only the ACTIVE history tab (Positions/Open Orders are WS-driven). No
  // setLoaded(false) here — once the initial data is in, switching tabs shows it
  // instantly (the prefetch below already filled every tab).
  useEffect(() => {
    if (tab === 'positions' || tab === 'orders') return; // WS-driven tabs
    refresh();
    const id = window.setInterval(refresh, 4000);
    return () => window.clearInterval(id);
  }, [refresh, tab]);

  // Prefetch all history tabs ONCE on mount / address change, so their count
  // badges + data are ready without clicking — and without adding any polling
  // (only the active tab polls, above). One-shot per address.
  useEffect(() => {
    if (!address) return;
    let alive = true;
    const get = async (path: string) => (await fetch(`${path}?address=${address}`, { cache: 'no-store' })).json();
    (async () => {
      try {
        const [tr, fu, oh] = await Promise.all([get('/api/trades'), get('/api/funding'), get('/api/orderhistory')]);
        if (!alive) return;
        if (tr.success) setTrades(tr.data);
        if (fu.success) setFunding(fu.data);
        if (oh.success) setOrderHist(oh.data);
        setLoaded(true);
      } catch { /* keep whatever we have */ }
    })();
    return () => { alive = false; };
  }, [address]);

  async function onCancel(o: OpenOrder) {
    if (!walletAddress) return;
    const tid = toast.loading(`Cancelling ${o.coin} order #${o.orderId}…`);
    const res = await cancelOrder({ walletAddress, symbol: o.symbol, orderId: o.orderId });
    toast.update(tid, res.success ? 'success' : 'error', res.success ? `Order #${o.orderId} cancelled` : res.error?.message ?? 'Cancel failed');
    refresh();
  }

  async function onCancelAllOrders() {
    if (!walletAddress || orders.length === 0) return;
    const tid = toast.loading(`Cancelling all ${orders.length} orders…`);
    const res = await Promise.all(orders.map((o) => cancelOrder({ walletAddress, symbol: o.symbol, orderId: o.orderId })));
    const failed = res.filter((r) => !r.success).length;
    toast.update(tid, failed ? 'error' : 'success', failed ? `${failed}/${orders.length} cancels failed` : `Cancelled ${orders.length} orders`);
    refresh();
  }

  const sortedOrders = [...orders].sort((a, b) => {
    const m = ordSort.dir === 'asc' ? 1 : -1;
    return ordSort.col === 'time' ? (a.time - b.time) * m : (Number(a.price) - Number(b.price)) * m;
  });
  const toggleSort = (col: 'time' | 'price') =>
    setOrdSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));

  // Trade history: aggregate (by order) / filter / sort.
  const tradeVal = (x: AggFill): number => {
    switch (tradeSort.col) {
      case 'time': return x.time;
      case 'price': return Number(x.price);
      case 'tradeValue': return Number(x.tradeValue);
      case 'fee': return Number(x.fee);
      case 'pnl': return Number(x.pnl);
    }
  };
  const tradeRows: AggFill[] = (tradeAgg ? aggregateFills(trades) : trades.map((f) => ({ ...f, fills: 1 })))
    .filter((r) => !tradeFilter || r.coin.toLowerCase().includes(tradeFilter.toLowerCase()))
    .sort((a, b) => (tradeVal(a) - tradeVal(b)) * (tradeSort.dir === 'asc' ? 1 : -1));
  const toggleTradeSort = (col: typeof tradeSort.col) =>
    setTradeSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  const explorerTx = (hash: string) => `https://app.hyperliquid${IS_TESTNET ? '-testnet' : ''}.xyz/explorer/tx/${hash}`;
  function exportTradesCsv() {
    const head = ['Time', 'Coin', 'Direction', 'Price', 'Size', 'TradeValue', 'Fee', 'PnL'];
    const lines = tradeRows.map((r) => [fmtDateTime(r.time), r.coin, r.direction, r.price, r.size, r.tradeValue, r.fee, r.pnl].join(','));
    const csv = [head.join(','), ...lines].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trade-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Funding history: filter / sort.
  const fundRows = funding
    .filter((f) => !fundFilter || f.coin.toLowerCase().includes(fundFilter.toLowerCase()))
    .sort((a, b) => (fundSort.col === 'time' ? a.time - b.time : Number(a.usdc) - Number(b.usdc)) * (fundSort.dir === 'asc' ? 1 : -1));
  const toggleFundSort = (col: typeof fundSort.col) =>
    setFundSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  function exportFundingCsv() {
    const head = ['Time', 'Coin', 'Size', 'Side', 'Payment', 'Rate'];
    const lines = fundRows.map((f) => [fmtDateTime(f.time), f.coin, Math.abs(Number(f.szi)), Number(f.szi) >= 0 ? 'Long' : 'Short', f.usdc, f.rate].join(','));
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'funding-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  // Order history: filter (coin or order id) / sort.
  const ohRows = orderHist
    .filter((o) => !ohFilter || o.coin.toLowerCase().includes(ohFilter.toLowerCase()) || String(o.orderId).includes(ohFilter))
    .sort((a, b) => (ohSort.col === 'time' ? a.time - b.time : Number(a.price) - Number(b.price)) * (ohSort.dir === 'asc' ? 1 : -1));
  const toggleOhSort = (col: typeof ohSort.col) =>
    setOhSort((s) => ({ col, dir: s.col === col && s.dir === 'desc' ? 'asc' : 'desc' }));
  function exportOhCsv() {
    const head = ['Time', 'Type', 'Coin', 'Direction', 'Size', 'Filled', 'OrderValue', 'Price', 'ReduceOnly', 'Trigger', 'Status', 'OrderId'];
    const lines = ohRows.map((o) =>
      [fmtDateTime(o.time), o.type, o.coin, o.direction, o.size, o.filledSize, o.orderValue, o.isMarket ? 'Market' : o.price, o.reduceOnly ? 'Yes' : 'No', o.trigger?.condition ?? 'N/A', statusStyle(o.status).label, o.orderId].join(','),
    );
    const url = URL.createObjectURL(new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'order-history.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Cancel any resting TP/SL trigger orders for a coin. These are reduce-only and
   * survive a manual close, so without this they'd attach to the NEXT position
   * opened on the same coin. Best-effort. */
  async function cancelTpslOrders(symbol: string) {
    if (!walletAddress) return;
    // Trigger orders come from the live WS feed (the REST route is empty on prod).
    const triggers = orders.filter((o) => o.symbol === symbol && o.trigger);
    try {
      await Promise.all(triggers.map((o) => cancelOrder({ walletAddress, symbol, orderId: o.orderId })));
    } catch { /* best-effort */ }
  }

  async function onClose(p: Position, mode: CloseMode, opts?: { size?: string; limitPrice?: string }) {
    if (!walletAddress) return;
    const opp = p.side === 'LONG' ? 'SELL' : 'BUY';
    const size = opts?.size && Number(opts.size) > 0 ? opts.size : p.amount;
    const base = p.symbol.replace('-USD', '');
    const verb = mode === 'reverse' ? 'Reversing' : 'Closing';
    const tid = toast.loading(`${verb} ${base} position…`);
    let res;
    if (mode === 'reverse') {
      // Flip the entire position: market opposite for 2× size.
      res = await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'MARKET', amount: String(Number(p.amount) * 2) });
    } else if (mode === 'limit') {
      if (!opts?.limitPrice) { toast.dismiss(tid); return; }
      res = await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'LIMIT', amount: size, price: opts.limitPrice, reduceOnly: true, timeInForce: 'GTC' });
    } else {
      res = await placeOrder({ walletAddress, symbol: p.symbol, side: opp, type: 'MARKET', amount: size, reduceOnly: true });
    }
    toast.update(tid, res.success ? 'success' : 'error', res.success ? `${base} position ${mode === 'reverse' ? 'reversed' : 'close submitted'}` : res.error?.message ?? 'Close failed');
    // Cancel any TP/SL triggers after a full close/reverse so they don't attach to
    // the next position. HL stores these as plain reduce-only triggers
    // (isPositionTpsl=false), so they do NOT auto-cancel on close. signer.cancel is
    // idempotent, so if any are already gone this is a safe no-op (no 502).
    const fullClose = !opts?.size || Number(opts.size) >= Number(p.amount);
    if (res.success && (mode === 'reverse' || (mode === 'market' && fullClose))) {
      await cancelTpslOrders(p.symbol);
    }
    // positions/orders/TP-SL refresh themselves via the WS feed.
  }

  async function onCloseAll() {
    if (!walletAddress) return;
    await Promise.all(positions.map((p) => onClose(p, 'market')));
  }

  async function onSetTpSl(p: Position, tp?: string, sl?: string) {
    if (!walletAddress || (!tp && !sl)) return;
    const opp = p.side === 'LONG' ? 'SELL' : 'BUY';
    const base = p.symbol.replace('-USD', '');
    const tid = toast.loading(`Setting ${base} TP/SL…`);
    // REPLACE, don't pile up: HL stores these as plain triggers (isPositionTpsl=false)
    // that don't get replaced on a new set, so cancel the coin's existing TP/SL first.
    await cancelTpslOrders(p.symbol);
    const res = await setTpsl({ walletAddress, symbol: p.symbol, side: opp, amount: p.amount, tpTriggerPrice: tp || undefined, slTriggerPrice: sl || undefined });
    if (res.success) {
      toast.update(tid, 'success', `${base} TP/SL set`);
    } else {
      const detail = res.data?.results?.filter((r) => !r.success).map((r) => r.error).filter(Boolean).join('; ') || res.error?.message || 'failed';
      toast.update(tid, 'error', `${base} TP/SL failed — ${detail}`);
    }
    // The new trigger orders surface via the WS feed → the cell updates itself.
  }

  const counts: Record<Tab, number> = {
    positions: positions.length,
    orders: orders.length,
    // Non-dust spot balances (same filter the table uses) — pre-loaded via useSpotHoldings.
    holdings: holdings.balances.filter((b) => Number(b.total) > 0 && (b.asset === 'USDC' || Number(b.total) >= Math.pow(10, -(b.metadata?.szDecimals ?? 0)))).length,
    trades: trades.length,
    funding: funding.length,
    orderhistory: orderHist.length,
  };

  return (
    <div className="card flex h-full flex-col">
      {/* Tabs — scroll horizontally instead of widening the card (mobile: short
          labels). [scrollbar hidden] so it doesn't show a bar. */}
      <div className="flex overflow-x-auto text-xs [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 ${tab === t.key ? 'border-surface-200 text-surface-100' : 'border-transparent text-surface-400 hover:text-surface-200'}`}
          >
            {isMobile ? t.short : t.label}
            {counts[t.key] > 0 && <span className="rounded bg-surface-700 px-1.5 py-0.5 text-2xs">{counts[t.key]}</span>}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!address ? (
          <Empty>Connect to view {tab}.</Empty>
        ) : (tab === 'positions' || tab === 'orders' ? !ws.ready : tab === 'holdings' ? false : !loaded) ? (
          <Empty>loading…</Empty>
        ) : tab === 'holdings' ? (
          <HoldingsTab balances={holdings.balances} loaded={holdings.loaded} walletAddress={walletAddress} isMobile={isMobile} />
        ) : tab === 'positions' ? (
          positions.length === 0 ? <Empty>No open positions.</Empty> : isMobile ? (
            <div className="space-y-1.5 p-1.5">
              <button onClick={onCloseAll} disabled={!walletAddress} className="w-full rounded border border-surface-700 py-2 text-xs font-semibold text-surface-300 hover:bg-surface-800 disabled:opacity-40">Close All</button>
              {positions.map((p) => {
                const base = p.symbol.replace('-USD', '');
                const long = p.side === 'LONG';
                const pnl = Number(p.unrealizedPnl);
                const roe = Number(p.metadata?.returnOnEquity ?? 0) * 100;
                const fund = -Number(p.funding);
                const ts = tpslMap[p.symbol] ?? {};
                const open = expandedPos.has(p.symbol);
                return (
                  <div key={p.symbol} className="rounded-lg border border-surface-800/60 bg-surface-900/50">
                    <button onClick={() => togglePos(p.symbol)} className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <TokenIcon symbol={p.symbol} size="sm" />
                        <span className="text-sm font-medium text-surface-100">{base}</span>
                        <span className={`rounded px-1.5 py-0.5 text-2xs font-semibold ${long ? 'bg-win-500/20 text-win-400' : 'bg-loss-500/20 text-loss-400'}`}>{p.leverage}x {long ? 'Long' : 'Short'}</span>
                        <span className={`tabular text-xs font-medium ${pnl >= 0 ? 'text-win-400' : 'text-loss-400'}`}>{pnl >= 0 ? '+' : ''}${n(pnl)} ({roe.toFixed(1)}%)</span>
                      </span>
                      <svg className={`shrink-0 text-surface-400 transition-transform ${open ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                    </button>
                    {open && (
                      <div className="px-3 pb-3">
                        <div className="grid grid-cols-3 gap-x-3 gap-y-2.5 text-[11px] tabular">
                          <Field label="Size" v={`${n(p.amount, 4)} ${base}`} />
                          <Field label="Pos. Value" v={`$${n(p.metadata?.positionValue ?? '0')}`} />
                          <Field label="Entry" v={px(p.entryPrice)} />
                          <Field label="Mark" v={px(p.markPrice)} />
                          <Field label="Liq. Price" v={Number(p.liquidationPrice) > 0 ? px(p.liquidationPrice) : 'N/A'} />
                          <Field label="Margin" v={`$${n(p.margin)} (${String(p.metadata?.leverageType ?? 'cross')})`} />
                          <Field label="Funding" v={`${fund >= 0 ? '+' : '-'}$${n(Math.abs(fund))}`} cls={fund >= 0 ? 'text-win-500' : 'text-loss-500'} />
                          <Field label="TP / SL" v={`${ts.tp ? px(ts.tp) : '--'} / ${ts.sl ? px(ts.sl) : '--'}`} />
                        </div>
                        <div className="mt-3 flex gap-2 border-t border-surface-800/60 pt-2.5">
                          <button onClick={() => setCloseTarget({ p, mode: 'market' })} disabled={!walletAddress} className="rounded bg-surface-700 px-3 py-1.5 text-xs font-medium text-win-400 hover:bg-surface-600 disabled:opacity-40">Market</button>
                          <button onClick={() => setCloseTarget({ p, mode: 'limit' })} disabled={!walletAddress} className="rounded bg-surface-700 px-3 py-1.5 text-xs font-medium text-surface-100 hover:bg-surface-600 disabled:opacity-40">Limit</button>
                          <button onClick={() => setCloseTarget({ p, mode: 'reverse' })} disabled={!walletAddress} className="rounded bg-surface-500/20 px-3 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-500/30 disabled:opacity-40">Flip</button>
                          <button onClick={() => setTpslTarget(p)} disabled={!walletAddress} className="ml-auto rounded border border-surface-700 px-3 py-1.5 text-xs font-medium text-surface-300 hover:bg-surface-800 disabled:opacity-40">TP/SL</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <Table head={['Coin', 'Size', 'Pos. Value', 'Entry', 'Mark', 'PnL (ROE %)', 'Liq. Price', 'Margin', 'Funding',
              <button key="closeall" onClick={onCloseAll} disabled={!walletAddress} className="font-semibold text-surface-300 hover:text-surface-100 disabled:opacity-40">Close All</button>,
              'TP/SL']}>
              {positions.map((p) => {
                const base = p.symbol.replace('-USD', '');
                const long = p.side === 'LONG';
                const pnl = Number(p.unrealizedPnl);
                const roe = Number(p.metadata?.returnOnEquity ?? 0) * 100;
                // HL cumFunding.sinceOpen is positive when funding was PAID (a cost),
                // so negate it: paid → negative (red), received → positive (green).
                const fund = -Number(p.funding);
                return (
                  <tr key={p.symbol} className="border-b border-surface-800/60 tabular">
                    <Td>
                      <span className="flex items-center gap-1.5">
                        <span className={`h-3 w-0.5 ${long ? 'bg-win-500' : 'bg-loss-500'}`} />
                        <TokenIcon symbol={p.symbol} size="sm" />
                        <span className="font-medium text-surface-100">{base}</span>
                        <span className={`rounded px-1 text-2xs ${long ? 'bg-win-500/15 text-win-500' : 'bg-loss-500/15 text-loss-500'}`}>{p.leverage}x</span>
                      </span>
                    </Td>
                    <Td className="text-surface-400">{n(p.amount, 4)} {base}</Td>
                    <Td className="text-surface-100">${n(p.metadata?.positionValue ?? '0')}</Td>
                    <Td className="text-surface-100">{px(p.entryPrice)}</Td>
                    <Td className="text-surface-100">{px(p.markPrice)}</Td>
                    <Td className={pnl >= 0 ? 'text-win-500' : 'text-loss-500'}>
                      {pnl >= 0 ? '+' : ''}${n(pnl)} ({roe.toFixed(1)}%)
                    </Td>
                    <Td className="text-surface-100">{Number(p.liquidationPrice) > 0 ? px(p.liquidationPrice) : 'N/A'}</Td>
                    <Td className="text-surface-100">
                      ${n(p.margin)} <span className="text-2xs capitalize text-surface-400">({String(p.metadata?.leverageType ?? 'cross')})</span>
                    </Td>
                    <Td className={fund >= 0 ? 'text-win-500' : 'text-loss-500'}>{fund >= 0 ? '+' : '-'}${n(Math.abs(fund))}</Td>
                    <Td>
                      <div className="flex gap-1">
                        {(['limit', 'market', 'reverse'] as const).map((m) => (
                          <button
                            key={m}
                            onClick={() => setCloseTarget({ p, mode: m })}
                            disabled={!walletAddress}
                            className="rounded border border-surface-700 px-2 py-0.5 text-xs capitalize text-surface-300 hover:bg-surface-800 disabled:opacity-40"
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                    </Td>
                    <Td>
                      {(() => {
                        const t = tpslMap[p.symbol] ?? {};
                        return (
                          <button
                            onClick={() => setTpslTarget(p)}
                            disabled={!walletAddress}
                            className="flex items-center gap-1.5 text-xs tabular hover:opacity-80 disabled:opacity-40"
                            title="Set TP/SL"
                          >
                            <span className={t.tp ? 'text-win-500' : 'text-surface-500'}>{t.tp ? px(t.tp) : '--'}</span>
                            <span className="text-surface-600">/</span>
                            <span className={t.sl ? 'text-loss-500' : 'text-surface-500'}>{t.sl ? px(t.sl) : '--'}</span>
                            <span className="text-surface-400">✎</span>
                          </button>
                        );
                      })()}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )
        ) : tab === 'orders' ? (
          orders.length === 0 ? <Empty>No open orders.</Empty> : isMobile ? (
            <div className="space-y-1.5 p-1.5">
              <button onClick={onCancelAllOrders} disabled={!walletAddress} className="w-full rounded border border-surface-700 py-2 text-xs font-semibold text-surface-300 hover:bg-surface-800 disabled:opacity-40">Cancel All</button>
              {sortedOrders.map((o) => (
                <div key={String(o.orderId)} className="rounded-lg border border-surface-800/60 bg-surface-900/50 p-3 tabular">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="text-sm font-medium text-surface-100">{o.coin}</span>
                      <span className={`text-xs font-medium ${directionColor(o.direction)}`}>{o.direction}</span>
                      <span className="text-2xs text-surface-400">{o.type}</span>
                    </span>
                    <button onClick={() => onCancel(o)} disabled={!walletAddress} className="shrink-0 rounded border border-surface-700 px-2 py-0.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-40">Cancel</button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                    <Field label="Size" v={n(o.size, 4)} />
                    <Field label="Price" v={o.isMarket ? 'Market' : px(o.price)} />
                    <Field label="Order Value" v={o.isMarket ? '--' : `$${n(o.orderValue)}`} />
                    <Field label="Trigger" v={o.trigger ? o.trigger.condition || `Price ${px(o.trigger.px)}` : '--'} />
                    <Field label="Reduce" v={o.reduceOnly ? 'Yes' : 'No'} />
                    <Field label="Time" v={fmtDateTime(o.time)} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <Table
                head={[
                  <button key="t" onClick={() => toggleSort('time')} className="font-semibold text-surface-300 hover:text-surface-100">
                    Time {ordSort.col === 'time' ? (ordSort.dir === 'asc' ? '↑' : '↓') : ''}
                  </button>,
                  'Type', 'Coin', 'Direction', 'Size', 'Orig. Size', 'Order Value',
                  <button key="p" onClick={() => toggleSort('price')} className="font-semibold text-surface-300 hover:text-surface-100">
                    Price {ordSort.col === 'price' ? (ordSort.dir === 'asc' ? '↑' : '↓') : ''}
                  </button>,
                  'Reduce', 'Trigger', 'TP/SL',
                  <button key="c" onClick={onCancelAllOrders} disabled={!walletAddress} className="font-semibold text-surface-300 hover:text-surface-100 disabled:opacity-40">Cancel All</button>,
                ]}
              >
                {sortedOrders.map((o) => (
                  <tr key={String(o.orderId)} className="border-b border-surface-800/60 tabular">
                    <Td className="whitespace-nowrap text-surface-400">{fmtDateTime(o.time)}</Td>
                    <Td className="whitespace-nowrap text-surface-200">{o.type}</Td>
                    <Td className="font-medium text-surface-100">{o.coin}</Td>
                    <Td className={`whitespace-nowrap ${directionColor(o.direction)}`}>{o.direction}</Td>
                    <Td className="text-surface-100">{n(o.size, 4)}</Td>
                    <Td className="text-surface-400">{n(o.origSize, 4)}</Td>
                    <Td className="text-surface-100">{o.isMarket ? '--' : `$${n(o.orderValue)}`}</Td>
                    <Td className="text-surface-100">{o.isMarket ? 'Market' : px(o.price)}</Td>
                    <Td className="text-surface-400">{o.reduceOnly ? 'Yes' : 'No'}</Td>
                    <Td className="whitespace-nowrap text-surface-300">{o.trigger ? o.trigger.condition || `Price ${px(o.trigger.px)}` : '--'}</Td>
                    <Td className="text-surface-500">--</Td>
                    <Td>
                      <button onClick={() => onCancel(o)} disabled={!walletAddress} className="rounded border border-surface-700 px-2 py-0.5 text-xs text-surface-300 hover:bg-surface-800 disabled:opacity-40">
                        Cancel
                      </button>
                    </Td>
                  </tr>
                ))}
              </Table>
              <button onClick={() => setTab('orderhistory')} className="px-3 py-2 text-xs text-info hover:underline">
                View All →
              </button>
            </>
          )
        ) : tab === 'trades' ? (
          trades.length === 0 ? <Empty>No trades executed yet.</Empty> : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <button
                  onClick={() => setTradeAgg((v) => !v)}
                  className={`rounded border px-2 py-1 ${tradeAgg ? 'border-info text-info' : 'border-surface-700 text-surface-300 hover:bg-surface-800'}`}
                >
                  Aggregate
                </button>
                <input
                  value={tradeFilter}
                  onChange={(e) => setTradeFilter(e.target.value)}
                  placeholder="Search coin"
                  className="w-28 rounded-md border border-surface-700 bg-transparent px-2 py-1 outline-none transition-colors focus:border-brand placeholder:text-surface-500"
                />
                <button onClick={exportTradesCsv} className="ml-auto rounded border border-surface-700 px-2 py-1 text-surface-300 hover:bg-surface-800">
                  Export CSV
                </button>
              </div>
              {isMobile ? (
                <div className="space-y-1.5 p-1.5">
                  {tradeRows.map((f) => { const pnl = Number(f.pnl); return (
                    <div key={f.id} className="rounded-lg border border-surface-800/60 bg-surface-900/50 p-3 tabular">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><span className="text-sm font-medium text-surface-100">{f.coin}</span><span className={`text-xs font-medium ${tradeDirColor(f.direction)}`}>{f.direction}</span></span>
                        <span className={`text-xs font-medium ${pnl >= 0 ? 'text-win-500' : 'text-loss-500'}`}>{pnl >= 0 ? '+' : ''}${n(pnl)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                        <Field label="Price" v={px(f.price)} />
                        <Field label="Size" v={n(f.size, 4)} />
                        <Field label="Value" v={`$${n(f.tradeValue)}`} />
                        <Field label="Fee" v={`$${n(f.fee, 4)}`} />
                        <Field label="Time" v={fmtDateTime(f.time)} />
                      </div>
                    </div>
                  ); })}
                </div>
              ) : (
              <Table
                head={[
                  <SortTh key="t" label="Time" active={tradeSort.col === 'time'} dir={tradeSort.dir} onClick={() => toggleTradeSort('time')} />,
                  'Coin', 'Direction',
                  <SortTh key="p" label="Price" active={tradeSort.col === 'price'} dir={tradeSort.dir} onClick={() => toggleTradeSort('price')} />,
                  'Size',
                  <SortTh key="v" label="Trade Value" active={tradeSort.col === 'tradeValue'} dir={tradeSort.dir} onClick={() => toggleTradeSort('tradeValue')} />,
                  <SortTh key="f" label="Fee" active={tradeSort.col === 'fee'} dir={tradeSort.dir} onClick={() => toggleTradeSort('fee')} />,
                  <SortTh key="pn" label="Realized PnL" active={tradeSort.col === 'pnl'} dir={tradeSort.dir} onClick={() => toggleTradeSort('pnl')} />,
                  '',
                ]}
              >
                {tradeRows.map((f) => {
                  const pnl = Number(f.pnl);
                  return (
                    <tr key={f.id} className="border-b border-surface-800/60 tabular">
                      <Td className="whitespace-nowrap text-surface-400">{fmtDateTime(f.time)}</Td>
                      <Td className="font-medium text-surface-100">{f.coin}</Td>
                      <Td className={`whitespace-nowrap ${tradeDirColor(f.direction)}`}>{f.direction}</Td>
                      <Td className="text-surface-100">{px(f.price)}</Td>
                      <Td className="text-surface-100">{n(f.size, 4)} {tradeAgg && f.fills > 1 ? <span className="text-surface-500">×{f.fills}</span> : null}</Td>
                      <Td className="text-surface-100">${n(f.tradeValue)}</Td>
                      <Td className="text-surface-400">${n(f.fee, 4)}</Td>
                      <Td className={pnl >= 0 ? 'text-win-500' : 'text-loss-500'}>{pnl >= 0 ? '+' : ''}${n(pnl)}</Td>
                      <Td>
                        {f.hash ? (
                          <a href={explorerTx(f.hash)} target="_blank" rel="noreferrer" className="text-info hover:underline" title="Explorer">↗</a>
                        ) : null}
                      </Td>
                    </tr>
                  );
                })}
              </Table>
              )}
            </>
          )
        ) : tab === 'funding' ? (
          funding.length === 0 ? <Empty>No funding payments recorded yet.</Empty> : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <input
                  value={fundFilter}
                  onChange={(e) => setFundFilter(e.target.value)}
                  placeholder="Search coin"
                  className="w-28 rounded-md border border-surface-700 bg-transparent px-2 py-1 outline-none transition-colors focus:border-brand placeholder:text-surface-500"
                />
                <button onClick={exportFundingCsv} className="ml-auto rounded border border-surface-700 px-2 py-1 text-surface-300 hover:bg-surface-800">
                  Export CSV
                </button>
              </div>
              {isMobile ? (
                <div className="space-y-1.5 p-1.5">
                  {fundRows.map((f, i) => { const pay = Number(f.usdc); const szi = Number(f.szi); const long = szi >= 0; const rate = Number(f.rate) * 100; return (
                    <div key={i} className="rounded-lg border border-surface-800/60 bg-surface-900/50 p-3 tabular">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><span className="text-sm font-medium text-surface-100">{f.coin}</span><span className={`text-xs font-medium ${long ? 'text-win-500' : 'text-loss-500'}`}>{long ? 'Long' : 'Short'}</span></span>
                        <span className={`text-xs font-medium ${pay >= 0 ? 'text-win-500' : 'text-loss-500'}`}>{pay >= 0 ? '+' : '-'}${n(Math.abs(pay), 4)}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                        <Field label="Size" v={`${n(Math.abs(szi), 4)} ${f.coin}`} />
                        <Field label="Rate" v={`${rate.toFixed(4)}%`} />
                        <Field label="Time" v={fmtDateTime(f.time)} />
                      </div>
                    </div>
                  ); })}
                </div>
              ) : (
              <Table
                head={[
                  <SortTh key="t" label="Time" active={fundSort.col === 'time'} dir={fundSort.dir} onClick={() => toggleFundSort('time')} />,
                  'Coin', 'Size', 'Side',
                  <SortTh key="p" label="Funding Payment" active={fundSort.col === 'payment'} dir={fundSort.dir} onClick={() => toggleFundSort('payment')} />,
                  'Funding Rate',
                ]}
              >
                {fundRows.map((f, i) => {
                  const pay = Number(f.usdc);
                  const szi = Number(f.szi);
                  const long = szi >= 0;
                  const rate = Number(f.rate) * 100;
                  return (
                    <tr key={i} className="border-b border-surface-800/60 tabular">
                      <Td className="whitespace-nowrap text-surface-400">{fmtDateTime(f.time)}</Td>
                      <Td className="font-medium text-surface-100">{f.coin}</Td>
                      <Td className="text-surface-100">{n(Math.abs(szi), 4)} {f.coin}</Td>
                      <Td className={long ? 'text-win-500' : 'text-loss-500'}>{long ? 'Long' : 'Short'}</Td>
                      <Td className={pay >= 0 ? 'text-win-500' : 'text-loss-500'}>{pay >= 0 ? '+' : '-'}${n(Math.abs(pay), 4)}</Td>
                      <Td className={rate >= 0 ? 'text-win-500' : 'text-loss-500'}>{rate.toFixed(4)}%</Td>
                    </tr>
                  );
                })}
              </Table>
              )}
            </>
          )
        ) : (
          orderHist.length === 0 ? <Empty>No order history available.</Empty> : (
            <>
              <div className="flex items-center gap-2 px-3 py-2 text-xs">
                <input
                  value={ohFilter}
                  onChange={(e) => setOhFilter(e.target.value)}
                  placeholder="Search coin / order id"
                  className="w-40 rounded-md border border-surface-700 bg-transparent px-2 py-1 outline-none transition-colors focus:border-brand placeholder:text-surface-500"
                />
                <button onClick={exportOhCsv} className="ml-auto rounded border border-surface-700 px-2 py-1 text-surface-300 hover:bg-surface-800">
                  Export CSV
                </button>
              </div>
              {isMobile ? (
                <div className="space-y-1.5 p-1.5">
                  {ohRows.map((o, i) => { const st = statusStyle(o.status); return (
                    <div key={i} className="rounded-lg border border-surface-800/60 bg-surface-900/50 p-3 tabular">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2"><span className="text-sm font-medium text-surface-100">{o.coin}</span><span className={`text-xs font-medium ${directionColor(o.direction)}`}>{o.direction}</span><span className="text-2xs text-surface-400">{o.type}</span></span>
                        <span className={`text-xs font-medium ${st.cls}`}>{st.label}</span>
                      </div>
                      <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1.5 text-[11px]">
                        <Field label="Size" v={n(o.size, 4)} />
                        <Field label="Filled" v={Number(o.filledSize) > 0 ? n(o.filledSize, 4) : '--'} />
                        <Field label="Price" v={o.isMarket ? 'Market' : px(o.price)} />
                        <Field label="Order Value" v={o.isMarket ? '--' : `$${n(o.orderValue)}`} />
                        <Field label="Trigger" v={o.trigger ? o.trigger.condition || `Price ${px(o.trigger.px)}` : 'N/A'} />
                        <Field label="Time" v={fmtDateTime(o.time)} />
                      </div>
                    </div>
                  ); })}
                </div>
              ) : (
              <Table
                head={[
                  <SortTh key="t" label="Time" active={ohSort.col === 'time'} dir={ohSort.dir} onClick={() => toggleOhSort('time')} />,
                  'Type', 'Coin', 'Direction', 'Size', 'Filled', 'Order Value',
                  <SortTh key="p" label="Price" active={ohSort.col === 'price'} dir={ohSort.dir} onClick={() => toggleOhSort('price')} />,
                  'Reduce', 'Trigger', 'Status', 'Order ID',
                ]}
              >
                {ohRows.map((o, i) => {
                  const st = statusStyle(o.status);
                  return (
                    <tr key={i} className="border-b border-surface-800/60 tabular">
                      <Td className="whitespace-nowrap text-surface-400">{fmtDateTime(o.time)}</Td>
                      <Td className="whitespace-nowrap text-surface-200">{o.type}</Td>
                      <Td className="font-medium text-surface-100">{o.coin}</Td>
                      <Td className={`whitespace-nowrap ${directionColor(o.direction)}`}>{o.direction}</Td>
                      <Td className="text-surface-100">{n(o.size, 4)}</Td>
                      <Td className="text-surface-400">{Number(o.filledSize) > 0 ? n(o.filledSize, 4) : '--'}</Td>
                      <Td className="text-surface-100">{o.isMarket ? '--' : `$${n(o.orderValue)}`}</Td>
                      <Td className="text-surface-100">{o.isMarket ? 'Market' : px(o.price)}</Td>
                      <Td className="text-surface-400">{o.reduceOnly ? 'Yes' : 'No'}</Td>
                      <Td className="whitespace-nowrap text-surface-300">{o.trigger ? o.trigger.condition || `Price ${px(o.trigger.px)}` : 'N/A'}</Td>
                      <Td className={st.cls}>{st.label}</Td>
                      <Td className="text-surface-500">{o.orderId}</Td>
                    </tr>
                  );
                })}
              </Table>
              )}
            </>
          )
        )}
      </div>

      {closeTarget && (
        <CloseModal
          target={closeTarget}
          onCancel={() => setCloseTarget(null)}
          onConfirm={async (opts) => {
            const { p, mode } = closeTarget;
            setCloseTarget(null);
            await onClose(p, mode, opts);
          }}
        />
      )}

      {tpslTarget && (
        <TpSlModal
          p={tpslTarget}
          existing={tpslMap[tpslTarget.symbol]}
          onCancel={() => setTpslTarget(null)}
          onConfirm={async (tp, sl) => {
            const p = tpslTarget;
            setTpslTarget(null);
            await onSetTpSl(p, tp, sl);
          }}
          onRemoveTpsl={async () => {
            const p = tpslTarget;
            setTpslTarget(null);
            const tid = toast.loading(`Removing ${p.symbol.replace('-USD', '')} TP/SL…`);
            await cancelTpslOrders(p.symbol);
            toast.update(tid, 'success', 'TP/SL removed');
            // The WS feed drops the cancelled triggers → the cell clears itself.
          }}
        />
      )}
    </div>
  );
}

/** Set Take Profit / Stop Loss for an existing position (price ⇄ gain/loss %). */
function TpSlModal({ p, existing, onConfirm, onCancel, onRemoveTpsl }: { p: Position; existing?: { tp?: string; sl?: string }; onConfirm: (tp?: string, sl?: string) => void; onCancel: () => void; onRemoveTpsl: () => void }) {
  const base = p.symbol.replace('-USD', '');
  const isLong = p.side === 'LONG';
  const ref = Number(p.entryPrice) || Number(p.markPrice);
  const lev = p.leverage || 1;
  const fmtP = (v: number) => String(Number(v.toFixed(ref >= 100 ? 2 : 5)));
  const [tp, setTp] = useState('');
  const [tpG, setTpG] = useState('');
  const [sl, setSl] = useState('');
  const [slL, setSlL] = useState('');

  const onTp = (v: string) => { setTp(v); setTpG(ref > 0 && v ? ((isLong ? (Number(v) - ref) / ref : (ref - Number(v)) / ref) * lev * 100).toFixed(2) : ''); };
  const onTpG = (v: string) => { setTpG(v); setTp(ref > 0 && v ? fmtP(ref * (isLong ? 1 + Number(v) / 100 / lev : 1 - Number(v) / 100 / lev)) : ''); };
  const onSl = (v: string) => { setSl(v); setSlL(ref > 0 && v ? ((isLong ? (ref - Number(v)) / ref : (Number(v) - ref) / ref) * lev * 100).toFixed(2) : ''); };
  const onSlL = (v: string) => { setSlL(v); setSl(ref > 0 && v ? fmtP(ref * (isLong ? 1 - Number(v) / 100 / lev : 1 + Number(v) / 100 / lev)) : ''); };

  return (
    <Modal open onClose={onCancel} title={`TP / SL · ${base}`}>
      <div className="space-y-3 text-sm">
        <RowKV label="Position" value={`${p.side} ${n(p.amount, 4)} ${base} · ${p.leverage}x`} />
        <RowKV label="Entry / Mark" value={`${px(p.entryPrice)} / ${px(p.markPrice)}`} />

        <div className="grid grid-cols-2 gap-2 pt-2">
          <Labeled label="TP Price"><Inp value={tp} onChange={onTp} /></Labeled>
          <Labeled label="Gain %"><Inp value={tpG} onChange={onTpG} /></Labeled>
          <Labeled label="SL Price"><Inp value={sl} onChange={onSl} /></Labeled>
          <Labeled label="Loss %"><Inp value={slL} onChange={onSlL} /></Labeled>
        </div>

        <button
          onClick={() => onConfirm(tp || undefined, sl || undefined)}
          disabled={!tp && !sl}
          className="mt-1 w-full rounded bg-win-500 py-2 font-semibold text-black disabled:opacity-40"
        >
          Set TP / SL
        </button>
        <p className="text-2xs text-surface-500">HyperLiquid position TP/SL — OCO, and auto-cancels when the position closes.</p>

        {(existing?.tp || existing?.sl) && (
          <div className="mt-1 border-t border-surface-800 pt-3">
            <div className="mb-2 text-2xs text-surface-400">
              Current{existing?.tp ? ` · TP ${existing.tp}` : ''}{existing?.sl ? ` · SL ${existing.sl}` : ''}
            </div>
            <button
              onClick={onRemoveTpsl}
              className="w-full rounded border border-loss-500/40 py-2 text-sm font-semibold text-loss-500 hover:bg-loss-500/10"
            >
              Remove TP / SL
            </button>
            <p className="mt-1.5 text-2xs text-surface-500">Cancels the existing TP/SL trigger orders for this position.</p>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-2xs text-surface-400">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
function Inp({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" placeholder="0.00" className="input tabular" />;
}

/** Professional confirmation modal for Market / Limit / Reverse close (HL-style):
 * choose how much to close (size + % of position), set a limit price, see the
 * estimated realized PnL. Reverse always flips the whole position. */
function CloseModal({
  target,
  onConfirm,
  onCancel,
}: {
  target: { p: Position; mode: CloseMode };
  onConfirm: (opts: { size?: string; limitPrice?: string }) => void;
  onCancel: () => void;
}) {
  const { p, mode } = target;
  const base = p.symbol.replace('-USD', '');
  const full = Number(p.amount);
  const reverse = mode === 'reverse';
  const [size, setSize] = useState(p.amount);
  const [price, setPrice] = useState(p.markPrice);
  const title = reverse ? 'Reverse Position' : mode === 'limit' ? 'Limit Close' : 'Market Close';
  const opp = p.side === 'LONG' ? 'Sell' : 'Buy';

  const closeSize = reverse ? full : Math.min(Number(size) || 0, full);
  const pct = full > 0 ? (closeSize / full) * 100 : 0;
  const exit = mode === 'limit' ? Number(price) : Number(p.markPrice);
  const sign = p.side === 'LONG' ? 1 : -1;
  const estPnl = (exit - Number(p.entryPrice)) * closeSize * sign;
  const valid = reverse || closeSize > 0;

  return (
    <Modal open onClose={onCancel} title={title}>
      <div className="space-y-3 text-sm">
        <div className="space-y-1">
          <RowKV label="Market" value={p.symbol} />
          <RowKV label="Position" value={`${p.side} ${n(p.amount, 4)} ${base} · ${p.leverage}x`} />
          <RowKV label="Entry / Mark" value={`${px(p.entryPrice)} / ${px(p.markPrice)}`} />
        </div>

        {reverse ? (
          <p className="rounded border border-surface-800 bg-surface-900 p-2 text-xs text-surface-300">
            Flips the entire position: {opp} {n(full * 2, 4)} {base} at market (closes {base} {p.side} and opens the inverse).
          </p>
        ) : (
          <>
            <label className="block">
              <span className="text-xs text-surface-400">Close Size ({base})</span>
              <input value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" className="input mt-1 tabular" />
            </label>
            <div className="grid grid-cols-4 gap-1">
              {[25, 50, 75, 100].map((q) => (
                <button
                  key={q}
                  onClick={() => setSize(String(+((full * q) / 100).toFixed(5)))}
                  className={`rounded py-1 text-2xs ${Math.abs(pct - q) < 0.5 ? 'bg-surface-700 text-surface-100' : 'bg-surface-800 text-surface-300 hover:bg-surface-700'}`}
                >
                  {q}%
                </button>
              ))}
            </div>
            {mode === 'limit' && (
              <label className="block">
                <span className="text-xs text-surface-400">Limit Price</span>
                <div className="mt-1 flex items-center gap-1">
                  <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" className="input tabular" />
                  <button onClick={() => setPrice(p.markPrice)} className="rounded border border-surface-700 px-2 py-1 text-2xs text-surface-300 hover:bg-surface-800">Mark</button>
                </div>
              </label>
            )}
            <div className="space-y-1 pt-2">
              <RowKV label="Closing" value={`${n(closeSize, 4)} ${base} (${pct.toFixed(0)}%)`} />
              <div className="flex justify-between">
                <span className="text-surface-400">Est. Realized PnL</span>
                <span className={`tabular ${estPnl >= 0 ? 'text-win-500' : 'text-loss-500'}`}>{estPnl >= 0 ? '+' : ''}${n(estPnl)}</span>
              </div>
            </div>
          </>
        )}

        <button
          onClick={() => onConfirm({ size: reverse ? undefined : String(closeSize), limitPrice: mode === 'limit' ? price : undefined })}
          disabled={!valid}
          className={`mt-1 w-full rounded py-2 font-semibold text-black disabled:opacity-40 ${reverse ? 'bg-info' : opp === 'Sell' ? 'bg-loss-500' : 'bg-win-500'}`}
        >
          Confirm {title}
        </button>
      </div>
    </Modal>
  );
}

function RowKV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-surface-400">{label}</span>
      <span className="tabular text-surface-100">{value}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="p-4 text-sm text-surface-400">{children}</div>;
}
/** Label/value cell for the mobile position cards (grid grid-cols-3). */
function Field({ label, v, cls = '' }: { label: string; v: string; cls?: string }) {
  return (
    <div>
      <div className="text-surface-500">{label}</div>
      <div className={`text-surface-100 ${cls}`}>{v}</div>
    </div>
  );
}
function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-850 text-xs text-surface-300">
        <tr>
          {head.map((h, i) => (
            <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}
function Td({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-1.5 ${className}`}>{children}</td>;
}

function SortTh({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="whitespace-nowrap font-medium text-surface-300 hover:text-surface-100">
      {label} {active ? (dir === 'asc' ? '↑' : '↓') : ''}
    </button>
  );
}

