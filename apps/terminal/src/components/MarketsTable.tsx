'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { tradeHref } from '@/lib/api';
import type { Ticker } from '@/lib/types';

function fmtPrice(s: string) {
  const n = Number(s);
  return n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 1 : 4 });
}
function fmtVol(s: string) {
  const n = Number(s);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

export function MarketsTable({ initial }: { initial: Ticker[] }) {
  const [tickers, setTickers] = useState<Ticker[]>(initial);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/markets', { cache: 'no-store' });
        const json = await res.json();
        if (alive && json.success) {
          setTickers(json.data);
          setUpdatedAt(Date.now());
        }
      } catch {
        /* keep last data on transient error */
      }
    };
    const id = setInterval(tick, 3000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <div className="rounded border border-border bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
        <span className="font-semibold">Markets · HyperLiquid</span>
        <span className="text-muted text-xs">
          {tickers.length} · {updatedAt ? `updated ${new Date(updatedAt).toLocaleTimeString()}` : 'live'}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead className="text-muted text-xs">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium">Market</th>
            <th className="px-3 py-2 text-right font-medium">Mark</th>
            <th className="px-3 py-2 text-right font-medium">24h</th>
            <th className="px-3 py-2 text-right font-medium">Volume</th>
            <th className="px-3 py-2 text-right font-medium">Max Lev</th>
          </tr>
        </thead>
        <tbody>
          {tickers.slice(0, 40).map((t) => {
            const chg = Number(t.change24h);
            return (
              <tr key={t.symbol} className="border-b border-border/50 hover:bg-bg-elevated">
                <td className="px-3 py-1.5 text-left font-medium">
                  <Link href={tradeHref(t)} className="hover:text-up">
                    {t.symbol}
                  </Link>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmtPrice(t.mark)}</td>
                <td className={`px-3 py-1.5 text-right tabular-nums ${chg >= 0 ? 'text-up' : 'text-down'}`}>
                  {chg >= 0 ? '+' : ''}
                  {chg.toFixed(2)}%
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">{fmtVol(t.volume24h)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums text-muted">
                  {t.maxLeverage ? `${t.maxLeverage}×` : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
