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
/** USD value — thousands separated, no decimals (e.g. 513,289). */
function fmtUsd(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function hhmmss(ts: number) {
  const d = new Date(ts);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

interface Level {
  px: number;
  sz: number;
  total: number; // cumulative size (base asset) from the spread outward
  totalUsd: number; // cumulative USD value (Σ sz·px) from the spread outward
  pct: number; // depth bar width %
}

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
  const [bbo, setBbo] = useState<{ bid: [string, string] | null; ask: [string, string] | null } | null>(null);
  const [tickOverride, setTickOverride] = useState<number | null>(null);
  const [trades, setTrades] = useState<RecentTrade[]>([]);

  // Live order book. l2Book is throttled (~0.5–2s); the bbo feed pushes on every
  // block the best bid/offer changes, so it keeps the top of book moving in
  // realtime (HL's own UI uses an internal gRPC depth feed not on the public WS).
  useEffect(() => {
    setBook(null);
    setBbo(null);
    setTickOverride(null);
    const unsubBook = getStream().subscribeOrderbook(symbol, setBook);
    const unsubBbo = getStream().subscribeBbo(symbol, (b) => setBbo({ bid: b.bid, ask: b.ask }));
    return () => { unsubBook(); unsubBbo(); };
  }, [symbol]);

  // Recent trades: REST snapshot for the initial fill, then live WS prepend.
  useEffect(() => {
    if (tab !== 'trades') return;
    let alive = true;
    setTrades([]);
    fetch(`/api/recenttrades?symbol=${encodeURIComponent(symbol)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j.success) setTrades((cur) => (cur.length ? cur : j.data)); })
      .catch(() => {});
    const unsub = getStream().subscribeTrades(symbol, (incoming) => {
      if (!alive) return;
      setTrades((cur) => {
        const seen = new Set(cur.map((t) => t.id));
        const fresh = incoming.filter((t) => !seen.has(t.id)).sort((a, b) => b.timestamp - a.timestamp);
        return [...fresh, ...cur].slice(0, 60);
      });
    });
    return () => { alive = false; unsub(); };
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

    // Safely merge the realtime bbo into the (slower) l2Book WITHOUT dropping
    // levels — only: (a) replace the best level's size when prices match, or
    // (b) prepend when bbo is a strict price improvement over the current best.
    // If bbo is equal/worse/stale, leave l2Book untouched. Filtering out levels
    // (the old approach) caused rows to vanish then refill on the next snapshot.
    const mergeTop = (levels: [string, string][], top: [string, string] | null | undefined, side: 'ask' | 'bid'): [string, string][] => {
      if (!top) return levels;
      const tp = Number(top[0]);
      const bestPx = levels[0] ? Number(levels[0][0]) : null;
      if (bestPx == null) return [top];
      if (tp === bestPx) return [top, ...levels.slice(1)]; // same level → refresh size
      const improves = side === 'ask' ? tp < bestPx : tp > bestPx;
      return improves ? [top, ...levels] : levels; // strict improvement → prepend
    };
    const rawAsks = mergeTop(book.asks, bbo?.ask, 'ask');
    const rawBids = mergeTop(book.bids, bbo?.bid, 'bid');

    const aAll = aggregate(rawAsks, tick, 'ask');
    const bAll = aggregate(rawBids, tick, 'bid');

    const build = (rows: { px: number; sz: number }[]): Level[] => {
      let cum = 0, cumUsd = 0;
      return rows.slice(0, ROWS).map((l) => { cum += l.sz; cumUsd += l.sz * l.px; return { ...l, total: cum, totalUsd: cumUsd, pct: 0 }; });
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
  }, [book, bbo, tick]);

  return (
    <div className="card flex h-full flex-col text-xs">
      {/* Tabs + asset indicator */}
      <div className="flex items-center justify-between px-2 py-1.5">
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
          <div className="flex items-center justify-between px-3 py-1">
            <MiniDropdown
              label={fmtPx(tick)}
              prefix=""
              options={tickOptions.map((t) => ({ key: String(t), label: t.toLocaleString(undefined, { maximumFractionDigits: tickDp(t) }) }))}
              selected={String(tick)}
              onSelect={(k) => setTickOverride(Number(k))}
            />
            <span className="text-2xs text-surface-500">{base} / USD</span>
          </div>

          {/* Column headers */}
          <div className="grid grid-cols-3 px-3 py-1 text-2xs font-medium text-surface-400">
            <span>Price</span>
            <span className="text-right">Size ({base})</span>
            <span className="text-right">Total (USD)</span>
          </div>

          {!book ? (
            <div className="flex-1 p-4 text-center text-surface-400">connecting…</div>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              {/* Asks (worst at top → best near the spread). Fixed ROWS height so
                  the list never grows/shrinks (placeholders fill empty slots). */}
              <div className="flex flex-1 flex-col-reverse justify-start overflow-hidden">
                {Array.from({ length: ROWS }, (_, i) => (
                  <Row key={`a${i}`} l={asks[i]} side="ask" fmtPx={fmtPx} />
                ))}
              </div>

              {/* Spread — same 3-col grid as the order rows so it lines up with the
                  numbers (Spread · value · %), one uniform font/size/color. */}
              <div className="grid grid-cols-3 bg-surface-900/60 px-3 py-1 text-2xs tabular text-surface-100">
                <span>Spread</span>
                <span className="text-right">{spread != null ? fmtPx(spread) : '—'}</span>
                <span className="text-right">{spreadPct.toFixed(3)}%</span>
              </div>

              {/* Bids (best at top → worst). Fixed ROWS height (see asks). */}
              <div className="flex flex-1 flex-col overflow-hidden">
                {Array.from({ length: ROWS }, (_, i) => (
                  <Row key={`b${i}`} l={bids[i]} side="bid" fmtPx={fmtPx} />
                ))}
              </div>

              {/* Footer: buy/sell pressure — full-bleed split bar, each band fading
                  to black toward the center. % labels are OVERLAID at each end, so
                  the bar never reflows / flickers as the value goes 9 → 90 → 100. */}
              <div className="mt-auto">
                <div className="relative flex h-6 w-full overflow-hidden tabular">
                  <div
                    className="h-full bg-gradient-to-r from-win-500/50 to-win-500/20 transition-[width] duration-500 ease-out"
                    style={{ width: `${bidPct}%` }}
                  />
                  <div className="h-full flex-1 bg-gradient-to-l from-loss-500/50 to-loss-500/20" />
                  <span className="absolute inset-y-0 left-2 flex items-center text-2xs font-semibold text-win-400">
                    B {bidPct.toFixed(0)}%
                  </span>
                  <span className="absolute inset-y-0 right-2 flex items-center text-2xs font-semibold text-loss-400">
                    {askPct.toFixed(0)}% S
                  </span>
                </div>
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

function Row({ l, side, fmtPx }: { l?: Level; side: 'ask' | 'bid'; fmtPx: (n: number) => string }) {
  const color = side === 'ask' ? 'text-loss-500' : 'text-win-500';
  // Same treatment as the footer pressure bar: strong color at the outer (total)
  // edge fading to a lighter shade of itself toward the price (no black tips).
  const bar = side === 'ask'
    ? 'bg-gradient-to-l from-loss-500/50 to-loss-500/20'
    : 'bg-gradient-to-l from-win-500/50 to-win-500/20';
  // Empty slot — keep the row height so the book never changes size.
  if (!l) return <div className="grid grid-cols-3 px-3 py-0.5">&nbsp;</div>;
  return (
    <div className="relative grid grid-cols-3 px-3 py-0.5 tabular hover:bg-surface-800/40">
      <div
        className={`absolute inset-y-0 right-0 ${bar} transition-[width] duration-300 ease-out`}
        style={{ width: `${l.pct}%` }}
      />
      <span className={`relative ${color}`}>{fmtPx(l.px)}</span>
      <span className="relative text-right text-surface-200">{fmtSz(l.sz)}</span>
      <span className="relative text-right text-surface-200">{fmtUsd(l.totalUsd)}</span>
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
