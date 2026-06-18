'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Orderbook as Book } from 'exchange-core';
import { getStream } from '@/lib/stream';

const LEVELS = 12;

function fmt(n: string, dp = 2) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: dp });
}

export function Orderbook({ symbol }: { symbol: string }) {
  const [book, setBook] = useState<Book | null>(null);

  useEffect(() => {
    setBook(null);
    const unsub = getStream().subscribeOrderbook(symbol, setBook);
    return unsub;
  }, [symbol]);

  const { asks, bids, spread } = useMemo(() => {
    if (!book) return { asks: [], bids: [], spread: null as string | null };
    const a = book.asks.slice(0, LEVELS);
    const b = book.bids.slice(0, LEVELS);
    const sp = a[0] && b[0] ? (Number(a[0][0]) - Number(b[0][0])).toString() : null;
    const maxSz = Math.max(
      ...a.map((l) => Number(l[1])),
      ...b.map((l) => Number(l[1])),
      1
    );
    return {
      asks: a.map((l) => ({ px: l[0], sz: l[1], pct: (Number(l[1]) / maxSz) * 100 })),
      bids: b.map((l) => ({ px: l[0], sz: l[1], pct: (Number(l[1]) / maxSz) * 100 })),
      spread: sp,
    };
  }, [book]);

  return (
    <div className="rounded border border-border bg-bg-surface text-xs">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
        <span className="font-semibold">Order Book</span>
        <span className="text-muted">{symbol}</span>
      </div>
      {!book ? (
        <div className="p-4 text-center text-muted">connecting…</div>
      ) : (
        <div className="px-2 py-1">
          <div className="flex justify-between px-1 pb-1 text-[10px] uppercase text-muted">
            <span>Price</span>
            <span>Size</span>
          </div>
          {/* Asks (high → low, so best ask sits next to the spread) */}
          {[...asks].reverse().map((l, i) => (
            <Row key={`a${i}`} px={l.px} sz={l.sz} pct={l.pct} side="ask" />
          ))}
          <div className="my-1 flex justify-between border-y border-border/60 px-1 py-1 text-muted">
            <span>Spread</span>
            <span className="tabular-nums">{spread ? fmt(spread) : '—'}</span>
          </div>
          {/* Bids (high → low) */}
          {bids.map((l, i) => (
            <Row key={`b${i}`} px={l.px} sz={l.sz} pct={l.pct} side="bid" />
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ px, sz, pct, side }: { px: string; sz: string; pct: number; side: 'ask' | 'bid' }) {
  const color = side === 'ask' ? 'text-down' : 'text-up';
  const bar = side === 'ask' ? 'bg-down/10' : 'bg-up/10';
  return (
    <div className="relative flex justify-between px-1 py-0.5 tabular-nums">
      <div className={`absolute inset-y-0 right-0 ${bar}`} style={{ width: `${pct}%` }} />
      <span className={`relative ${color}`}>{fmt(px, 4)}</span>
      <span className="relative text-[#c9cfdb]">{fmt(sz, 4)}</span>
    </div>
  );
}
