'use client';

import { useEffect, useState } from 'react';
import type { Balance } from 'exchange-core';
import type { Ticker } from '@/lib/types';

const n = (s: string | number, dp = 4) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });
const usd = (v: number) => (Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/**
 * Spot holdings tab for the Pro Positions panel: token balances from
 * `/api/spot-balances`, priced with the spot catalog (`/api/markets?kind=spot`).
 * Read-only for now (Phase 3); buy/sell + cost-basis P&L land in later phases.
 */
export function HoldingsTab({ address, isMobile }: { address?: string; isMobile?: boolean }) {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({}); // token -> USD mark
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const load = async () => {
      try {
        const [bRes, mRes] = await Promise.all([
          fetch(`/api/spot-balances?address=${encodeURIComponent(address)}`, { cache: 'no-store' }).then((r) => r.json()),
          fetch('/api/markets?kind=spot', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (!alive) return;
        if (bRes.success) setBalances(bRes.data ?? []);
        if (mRes.success) {
          const map: Record<string, number> = {};
          for (const t of (mRes.data ?? []) as Ticker[]) {
            const base = t.symbol.split('/')[0];
            map[base] = Number(t.mark);
          }
          setPrices(map);
        }
      } catch { /* keep last */ }
      finally { if (alive) setLoaded(true); }
    };
    load();
    const id = setInterval(load, 15000);
    return () => { alive = false; clearInterval(id); };
  }, [address]);

  const rows = balances
    .map((b) => {
      const price = b.asset === 'USDC' ? 1 : prices[b.asset] ?? 0;
      const value = Number(b.total) * price;
      return { ...b, price, value };
    })
    .filter((r) => Number(r.total) > 0)
    .sort((a, b) => b.value - a.value);

  if (!address) return <div className="flex h-full items-center justify-center text-xs text-surface-500">Connect to view holdings.</div>;
  if (!loaded) return <div className="flex h-full items-center justify-center text-xs text-surface-500">loading…</div>;
  if (rows.length === 0) return <div className="flex h-full items-center justify-center text-xs text-surface-500">No spot balances.</div>;

  if (isMobile) {
    return (
      <div className="space-y-1.5 p-1.5">
        {rows.map((r) => (
          <div key={r.asset} className="flex items-center justify-between rounded-lg border border-surface-800/60 bg-surface-900/50 px-3 py-2">
            <span className="text-sm font-medium text-surface-100">{r.asset}</span>
            <span className="text-right text-xs tabular text-surface-300">
              <div>{n(r.total)} </div>
              <div className="text-surface-500">{usd(r.value)}</div>
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-surface-900 text-surface-400">
        <tr className="text-left">
          <th className="px-3 py-2 font-medium">Asset</th>
          <th className="px-3 py-2 text-right font-medium">Total</th>
          <th className="px-3 py-2 text-right font-medium">Available</th>
          <th className="px-3 py-2 text-right font-medium">Price</th>
          <th className="px-3 py-2 text-right font-medium">Value</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r) => (
          <tr key={r.asset} className="border-t border-surface-800/60">
            <td className="px-3 py-2 font-medium text-surface-100">{r.asset}</td>
            <td className="px-3 py-2 text-right text-surface-200">{n(r.total)}</td>
            <td className="px-3 py-2 text-right text-surface-300">{n(r.available)}</td>
            <td className="px-3 py-2 text-right text-surface-300">{r.asset === 'USDC' ? '--' : usd(r.price)}</td>
            <td className="px-3 py-2 text-right text-surface-100">{usd(r.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
