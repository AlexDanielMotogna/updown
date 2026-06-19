'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Orderbook as Book, RecentTrade } from 'exchange-core';
import { getStream } from '@/lib/stream';

const ROWS = 12; // rows per side

// ── tick / price helpers ────────────────────────────────────────────────────
const snap = (x: number) => Number(x.toPrecision(8));

/** Largest 1/2/5×10^k value ≤ x. */
function niceFloor(x: number): number {
  const exp = Math.floor(Math.log10(x));
  const f = x / 10 ** exp;
  const nice = f >= 5 ? 5 : f >= 2 ? 2 : 1;
  return snap(nice * 10 ** exp);
}
/** 1-2-5 ladder of `count` tick sizes starting at `base`. */
function ladder(base: number, count: number): number[] {
  const out = [snap(base)];
  const ratios = [2, 2.5, 2];
  const exp = Math.floor(Math.log10(base));
  const m = Math.round(base / 10 ** exp);
  let r = m === 1 ? 0 : m === 2 ? 1 : 2;
  let v = base;
  while (out.length < count) {
    v *= ratios[r % 3];
    r++;
    out.push(snap(v));
  }
  return out;
}
function tickDp(tick: number): number {
  if (tick >= 1) return 0;
  const s = snap(tick).toString();
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}
function fmtSz(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}
function hhmmss(ts: number) {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface Level {
  px: number;
  sz: number;
  total: number; // cumulative size from the spread outward
  pct: number; // depth bar width %
}

const FILTERS = [
  { key: 'all', label: 'All Orders' },
  { key: 'large', label: 'Large Orders' },
  { key: 'whale', label: 'Whale Levels' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];

/** Aggregate raw `[px, sz]` levels into tick buckets, best-first. */
function aggregate(levels: [string, string][], tick: number, side: 'ask' | 'bid'): { px: number; sz: number }[] {
  const map = new Map<number, number>();
  for (const [p, s] of levels) {
    const price = Number(p);
    const bucket = side === 'ask' ? Math.ceil(price / tick) * tick : Math.floor(price / tick) * tick;
    const key = Number(bucket.toFixed(10));
    map.set(key, (map.get(key) ?? 0) + Number(s));
  }
  const arr = [...map.entries()].map(([px, sz]) => ({ px, sz }));
  arr.sort((a, b) => (side === 'ask' ? a.px - b.px : b.px - a.px));
  return arr;
}

export function Orderbook({ symbol }: { symbol: string }) {
  const base = symbol.replace('-USD', '');
  const [tab, setTab] = useState<'book' | 'trades'>('book');
  const [book, setBook] = useState<Book | null>(null);
  const [tickOverride, setTickOverride] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  // Live order book stream.
  useEffect(() => {
    setBook(null);
    setTickOverride(null);
    const unsub = getStream().subscribeOrderbook(symbol, setBook);
    return unsub;
  }, [symbol]);

  // Recent trades (poll while the Trades tab is active).
  useEffect(() => {
    if (tab !== 'trades') return;
    let alive = true;
    const load = () =>
      fetch(`/api/recenttrades?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
        .then((r) => r.json())
        .then((j) => { if (alive && j.success) setTrades(j.data); })
        .catch(() => {});
    load();
    const id = window.setInterval(load, 2000);
    return () => { alive = false; window.clearInterval(id); };
  }, [tab, symbol]);

  // Tick-size options derived from the real level spacing.
  const tickOptions = useMemo(() => {
    if (!book) return [] as number[];
    const prices = [...book.asks.slice(0, 30), ...book.bids.slice(0, 30)].map((l) => Number(l[0])).sort((a, b) => a - b);
    let min = Infinity;
    for (let i = 1; i < prices.length; i++) {
      const d = prices[i] - prices[i - 1];
      if (d > 1e-12 && d < min) min = d;
    }
    if (!Number.isFinite(min)) min = (prices[0] || 1) * 0.0001;
    return ladder(niceFloor(min), 6);
  }, [book]);

  const tick = tickOverride ?? tickOptions[0] ?? 1;
  const dp = tickDp(tick);
  const fmtPx = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

  const { asks, bids, spread, spreadPct, bidPct, askPct } = useMemo(() => {
    const empty = { asks: [] as Level[], bids: [] as Level[], spread: null as number | null, spreadPct: 0, bidPct: 50, askPct: 50 };
    if (!book) return empty;

    const aAll = aggregate(book.asks, tick, 'ask');
    const bAll = aggregate(book.bids, tick, 'bid');

    // Filter threshold (applied to which rows display, not to cumulative totals).
    const sizes = [...aAll, ...bAll].map((l) => l.sz);
    const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const thr = filter === 'whale' ? avg * 4 : filter === 'large' ? avg * 1.75 : 0;

    const build = (rows: { px: number; sz: number }[]): Level[] => {
      let cum = 0;
      const withTotal = rows.map((l) => { cum += l.sz; return { ...l, total: cum, pct: 0 }; });
      return withTotal.filter((l) => l.sz >= thr).slice(0, ROWS);
    };
    const asks = build(aAll);
    const bids = build(bAll);

    const max = Math.max(asks.at(-1)?.total ?? 0, bids.at(-1)?.total ?? 0, asks[0]?.total ?? 0, bids[0]?.total ?? 0, 1);
    asks.forEach((l) => (l.pct = (l.total / max) * 100));
    bids.forEach((l) => (l.pct = (l.total / max) * 100));

    const bestAsk = aAll[0]?.px ?? 0;
    const bestBid = bAll[0]?.px ?? 0;
    const sp = bestAsk && bestBid ? bestAsk - bestBid : null;
    const spPct = sp && bestBid ? (sp / bestBid) * 100 : 0;
    const totalAsk = aAll.reduce((a, l) => a + l.sz, 0);
    const totalBid = bAll.reduce((a, l) => a + l.sz, 0);
    const sum = totalAsk + totalBid || 1;
    return { asks, bids, spread: sp, spreadPct: spPct, bidPct: (totalBid / sum) * 100, askPct: (totalAsk / sum) * 100 };
  }, [book, tick, filter]);

  return (
    <div className="card flex h-full flex-col text-xs">
      {/* Tabs + asset indicator */}
      <div className="flex items-center justify-between border-b border-surface-800 px-2 py-1.5">
        <div className="flex gap-1">
          {(['book', 'trades'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 text-xs font-semibold ${
                tab === t ? 'bg-surface-800 text-surface-100' : 'text-surface-400 hover:text-surface-100'
              }`}
            >
              {t === 'book' ? 'Order Book' : 'Trades'}
            </button>
          ))}
        </div>
        <span className="text-xs font-medium text-surface-300">{base}</span>
      </div>

      {tab === 'book' ? (
        <>
          {/* Tick selector */}
          <div className="flex items-center justify-between border-b border-surface-800 px-3 py-1">
            <MiniDropdown
              label={fmtPx(tick)}
              prefix=""
              options={tickOptions.map((t) => ({ key: String(t), label: t.toLocaleString(undefined, { maximumFractionDigits: tickDp(t) }) }))}
              selected={String(tick)}
              onSelect={(k) => setTickOverride(Number(k))}
            />
            <span className="text-2xs text-surface-500">Tick size</span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-3 px-3 py-1 text-2xs font-medium text-surface-400">
            <span>Price</span>
            <span className="text-right">Size ({base})</span>
            <span className="text-right">Total</span>
          </div>

          {!book ? (
            <div className="flex-1 p-4 text-center text-surface-400">connecting…</div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Asks (worst at top → best near the spread) */}
              <div className="flex flex-1 flex-col-reverse justify-start overflow-hidden">
                {asks.map((l, i) => (
                  <Row key={`a${i}`} l={l} side="ask" fmtPx={fmtPx} />
                ))}
              </div>

              {/* Spread */}
              <div className="flex items-center justify-center gap-2 border-y border-surface-800 bg-surface-900/60 px-3 py-1 text-2xs">
                <span className="text-surface-400">Spread</span>
                <span className="tabular text-surface-100">{spread != null ? fmtPx(spread) : '—'}</span>
                <span className="text-surface-600">|</span>
                <span className="tabular text-surface-300">{spreadPct.toFixed(3)}%</span>
              </div>

              {/* Bids (best at top → worst) */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {bids.map((l, i) => (
                  <Row key={`b${i}`} l={l} side="bid" fmtPx={fmtPx} />
                ))}
              </div>

              {/* Footer: filter + buy/sell ratio */}
              <div className="mt-auto flex flex-col gap-1.5 border-t border-surface-800 px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-2xs text-win-500">B {bidPct.toFixed(0)}%</span>
                  <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
                    <div className="h-full bg-win-500" style={{ width: `${bidPct}%` }} />
                    <div className="h-full bg-loss-500" style={{ width: `${askPct}%` }} />
                  </div>
                  <span className="text-2xs text-loss-500">{askPct.toFixed(0)}% S</span>
                </div>
                <MiniDropdown
                  label={FILTERS.find((f) => f.key === filter)!.label}
                  prefix=""
                  options={FILTERS.map((f) => ({ key: f.key, label: f.label }))}
                  selected={filter}
                  onSelect={(k) => setFilter(k as FilterKey)}
                  full
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <TradesTab symbol={symbol} trades={trades} />
      )}
    </div>
  );
}

function Row({ l, side, fmtPx }: { l: Level; side: 'ask' | 'bid'; fmtPx: (n: number) => string }) {
  const color = side === 'ask' ? 'text-loss-500' : 'text-win-500';
  const bar = side === 'ask' ? 'bg-loss-500/15' : 'bg-win-500/15';
  return (
    <div className="relative grid grid-cols-3 px-3 py-0.5 tabular hover:bg-surface-800/40">
      <div className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${l.pct}%` }} />
      <span className={`relative ${color}`}>{fmtPx(l.px)}</span>
      <span className="relative text-right text-surface-200">{fmtSz(l.sz)}</span>
      <span className="relative text-right text-surface-400">{fmtSz(l.total)}</span>
    </div>
  );
}

function TradesTab({ symbol, trades }: { symbol: string; trades: RecentTrade[] }) {
  const base = symbol.replace('-USD', '');
  const fmtPx = (s: string) => {
    const v = Number(s);
    const a = Math.abs(v);
    const md = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
    return v.toLocaleString(undefined, { maximumFractionDigits: md });
  };
  return (
    <>
      <div className="grid grid-cols-3 px-3 py-1 text-2xs font-medium text-surface-400">
        <span>Price</span>
        <span className="text-right">Size ({base})</span>
        <span className="text-right">Time</span>
      </div>
      <div className="flex-1 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="p-4 text-center text-surface-400">no recent trades</div>
        ) : (
          trades.map((t) => {
            const buy = t.side === 'BUY';
            return (
              <div key={t.id} className="grid grid-cols-3 px-3 py-0.5 tabular hover:bg-surface-800/40">
                <span className={buy ? 'text-win-500' : 'text-loss-500'}>{fmtPx(t.price)}</span>
                <span className="text-right text-surface-200">{fmtSz(Number(t.amount))}</span>
                <span className="text-right text-surface-400">{hhmmss(t.timestamp)}</span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

// ── small dropdown ──────────────────────────────────────────────────────────
function MiniDropdown({
  label,
  prefix,
  options,
  selected,
  onSelect,
  full,
}: {
  label: string;
  prefix?: string;
  options: { key: string; label: string }[];
  selected: string;
  onSelect: (k: string) => void;
  full?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  return (
    <div className={`relative ${full ? 'w-full' : ''}`} ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-1 rounded bg-surface-900 px-2 py-1 text-2xs text-surface-200 hover:bg-surface-800 ${full ? 'w-full' : ''}`}
      >
        <span className="tabular">{prefix}{label}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" className="text-surface-400">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-50 mt-1 ${full ? 'w-full' : 'min-w-[5rem]'} card-elevated py-1`}>
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => { onSelect(o.key); setOpen(false); }}
              className={`block w-full px-3 py-1 text-left text-2xs tabular hover:bg-surface-800 ${
                o.key === selected ? 'text-info' : 'text-surface-200'
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
