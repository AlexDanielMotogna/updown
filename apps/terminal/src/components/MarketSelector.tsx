'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticker } from '@/lib/types';

const fmtPrice = (s: string) => Number(s).toLocaleString(undefined, { maximumFractionDigits: Number(s) >= 100 ? 1 : 4 });

/** Symbol picker with search — clicking a market navigates to its trade page. */
export function MarketSelector({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [markets, setMarkets] = useState<Ticker[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || markets.length) return;
    fetch('/api/markets', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => j.success && setMarkets(j.data));
  }, [open, markets.length]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const filtered = markets.filter((m) => m.symbol.toLowerCase().includes(q.toLowerCase())).slice(0, 50);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-800"
      >
        <span className="text-base font-semibold">{symbol}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-surface-400">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-72 card-elevated animate-fade-in">
          <div className="border-b border-surface-800 p-2">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search market…"
              className="input py-1.5 text-sm"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 && <div className="p-3 text-sm text-surface-400">No markets</div>}
            {filtered.map((m) => {
              const chg = Number(m.change24h);
              return (
                <button
                  key={m.symbol}
                  onClick={() => {
                    setOpen(false);
                    router.push(`/market/${encodeURIComponent(m.symbol)}`);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-surface-800 ${
                    m.symbol === symbol ? 'bg-surface-800' : ''
                  }`}
                >
                  <span className="font-medium">{m.symbol}</span>
                  <span className="flex items-center gap-3 tabular">
                    <span className="text-surface-300">{fmtPrice(m.mark)}</span>
                    <span className={chg >= 0 ? 'text-win-500' : 'text-loss-500'}>
                      {chg >= 0 ? '+' : ''}
                      {chg.toFixed(2)}%
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
