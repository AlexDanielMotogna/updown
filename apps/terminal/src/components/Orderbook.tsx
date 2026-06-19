'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Orderbook as Book } from 'exchange-core';
import { getStream } from '@/lib/stream';

const LEVELS = 11;

function fmt(n: string | number, dp = 2) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp, minimumFractionDigits: dp });
}
function fmtSz(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

interface Level {
  px: string;
  sz: string;
  total: number; // cumulative size from the spread outward
  pct: number; // depth bar width %
}

export function Orderbook({ symbol }: { symbol: string }) {
  const base = symbol.replace('-USD', '');
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    setBook(null);
    const unsub = getStream().subscribeOrderbook(symbol, setBook);
    return unsub;
  }, [symbol]);

  const { asks, bids, spread, spreadPct, bidPct, askPct } = useMemo(() => {
    if (!book) return { asks: [] as Level[], bids: [] as Level[], spread: null as string | null, spreadPct: 0, bidPct: 50, askPct: 50 };
    const rawAsks = book.asks.slice(0, LEVELS);
    const rawBids = book.bids.slice(0, LEVELS);

    let cum = 0;
    const asks: Level[] = rawAsks.map((l) => {
      cum += Number(l[1]);
      return { px: l[0], sz: l[1], total: cum, pct: 0 };
    });
    const askMax = cum;
    cum = 0;
    const bids: Level[] = rawBids.map((l) => {
      cum += Number(l[1]);
      return { px: l[0], sz: l[1], total: cum, pct: 0 };
    });
    const bidMax = cum;
    const max = Math.max(askMax, bidMax, 1);
    asks.forEach((l) => (l.pct = (l.total / max) * 100));
    bids.forEach((l) => (l.pct = (l.total / max) * 100));

    const bestAsk = rawAsks[0] ? Number(rawAsks[0][0]) : 0;
    const bestBid = rawBids[0] ? Number(rawBids[0][0]) : 0;
    const sp = bestAsk && bestBid ? bestAsk - bestBid : null;
    const spPct = sp && bestBid ? (sp / bestBid) * 100 : 0;
    const totalBid = bidMax;
    const totalAsk = askMax;
    const sum = totalBid + totalAsk || 1;
    return { asks, bids, spread: sp != null ? String(sp) : null, spreadPct: spPct, bidPct: (totalBid / sum) * 100, askPct: (totalAsk / sum) * 100 };
  }, [book]);

  return (
    <div className="card flex h-full flex-col text-xs">
      <div className="flex items-center justify-between border-b border-surface-800 px-3 py-2">
        <span className="text-xs font-semibold text-surface-200">Order Book</span>
        <span className="text-xs text-surface-400">{base}</span>
      </div>

      {/* Column headers */}
      <div className="flex justify-between px-3 py-1 text-xs font-medium text-surface-300">
        <span>Price</span>
        <span>Size ({base})</span>
        <span>Total</span>
      </div>

      {!book ? (
        <div className="flex-1 p-4 text-center text-surface-400">connecting…</div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Asks (worst at top → best near the spread) */}
          <div className="flex flex-1 flex-col-reverse justify-start overflow-hidden">
            {asks.map((l, i) => (
              <Row key={`a${i}`} l={l} side="ask" />
            ))}
          </div>

          {/* Spread */}
          <div className="flex items-center justify-between border-y border-surface-800 px-3 py-1 text-2xs text-surface-400">
            <span>Spread</span>
            <span className="tabular">{spread ? fmt(spread) : '—'}</span>
            <span className="tabular">{spreadPct.toFixed(3)}%</span>
          </div>

          {/* Bids (best at top → worst) */}
          <div className="flex flex-1 flex-col overflow-hidden">
            {bids.map((l, i) => (
              <Row key={`b${i}`} l={l} side="bid" />
            ))}
          </div>

          {/* Buy / Sell ratio bar */}
          <div className="mt-auto flex items-center gap-2 px-3 py-1.5">
            <span className="text-2xs text-win-500">B {bidPct.toFixed(0)}%</span>
            <div className="flex h-1.5 flex-1 overflow-hidden rounded-full">
              <div className="h-full bg-win-500" style={{ width: `${bidPct}%` }} />
              <div className="h-full bg-loss-500" style={{ width: `${askPct}%` }} />
            </div>
            <span className="text-2xs text-loss-500">{askPct.toFixed(0)}% S</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ l, side }: { l: Level; side: 'ask' | 'bid' }) {
  const color = side === 'ask' ? 'text-loss-500' : 'text-win-500';
  const bar = side === 'ask' ? 'bg-loss-500/10' : 'bg-win-500/10';
  return (
    <div className="relative flex justify-between px-3 py-0.5 tabular">
      <div className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${l.pct}%` }} />
      <span className={`relative ${color}`}>{fmt(l.px, 2)}</span>
      <span className="relative text-surface-200">{fmtSz(Number(l.sz))}</span>
      <span className="relative text-surface-400">{fmtSz(l.total)}</span>
    </div>
  );
}
