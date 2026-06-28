'use client';

import { useEffect, useState } from 'react';
import { fetchSpotBalances, type SpotBalanceRow } from '@/lib/api';
import type { Ticker } from '@/lib/types';

const n = (s: string | number, dp = 4) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });
const usd = (v: number) => (Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/**
 * Spot holdings tab for the Pro Positions panel: token balances priced with the
 * spot catalog. The EVM/HL account is resolved server-side from the Solana
 * walletAddress (the client never needs its own EVM address).
 */
export function HoldingsTab({ walletAddress, isMobile }: { walletAddress?: string; isMobile?: boolean }) {
  const [balances, setBalances] = useState<SpotBalanceRow[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({}); // token -> USD mark
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!walletAddress) return;
    let alive = true;
    const load = async () => {
      try {
        const [bRes, mRes] = await Promise.all([
          fetchSpotBalances(walletAddress),
          fetch('/api/markets?kind=spot', { cache: 'no-store' }).then((r) => r.json()),
        ]);
        if (!alive) return;
        if (bRes.success) setBalances(bRes.data ?? []);
        if (mRes.success) {
          const map: Record<string, number> = {};
          for (const t of (mRes.data ?? []) as Ticker[]) {
            const base = (t.displayName ?? t.symbol).split('/')[0];
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
  }, [walletAddress]);

  const rows = balances
    .map((b) => {
      const price = b.asset === 'USDC' ? 1 : prices[b.asset] ?? 0;
      const value = Number(b.total) * price;
      // Cost-basis P&L + ROE from HL's entryNtl (no fill persistence needed).
      const entry = Number(b.entryNotional ?? 0);
      const pnl = b.asset !== 'USDC' && entry > 0 ? value - entry : null;
      const roe = pnl != null && entry > 0 ? (pnl / entry) * 100 : null;
      const contract = (b.metadata?.contract as string | undefined) ?? '';
      return { ...b, price, value, pnl, roe, contract };
    })
    .filter((r) => Number(r.total) > 0)
    .sort((a, b) => b.value - a.value);

  const shortContract = (c: string) => (c && c.length > 12 ? `${c.slice(0, 6)}…${c.slice(-4)}` : c || '--');

  if (!walletAddress) return <div className="flex h-full items-center justify-center text-xs text-surface-500">Connect to view holdings.</div>;
  if (!loaded) return <div className="flex h-full items-center justify-center text-xs text-surface-500">loading…</div>;
  if (rows.length === 0) return <div className="flex h-full items-center justify-center text-xs text-surface-500">No spot balances.</div>;

  if (isMobile) {
    return (
      <div className="space-y-1.5 p-1.5">
        {rows.map((r) => (
          <div key={r.asset} className="flex items-center justify-between rounded-lg border border-surface-800/60 bg-surface-900/50 px-3 py-2">
            <span className="min-w-0">
              <div className="text-sm font-medium text-surface-100">{r.asset}</div>
              <div className="text-2xs text-surface-500">{n(r.total)} · {usd(r.value)}</div>
            </span>
            <span className={`text-right text-xs tabular ${r.pnl == null ? 'text-surface-500' : r.pnl >= 0 ? 'text-win-400' : 'text-loss-400'}`}>
              {r.pnl == null ? '--' : `${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)}`}
              {r.roe != null && <div className="text-2xs">{r.roe >= 0 ? '+' : ''}{r.roe.toFixed(2)}%</div>}
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
          <th className="px-3 py-2 font-medium">Coin</th>
          <th className="px-3 py-2 text-right font-medium">Total Balance</th>
          <th className="px-3 py-2 text-right font-medium">Available Balance</th>
          <th className="px-3 py-2 text-right font-medium">USDC Value</th>
          <th className="px-3 py-2 text-right font-medium">PNL (ROE %)</th>
          <th className="px-3 py-2 text-right font-medium">Contract</th>
        </tr>
      </thead>
      <tbody className="tabular">
        {rows.map((r) => (
          <tr key={r.asset} className="border-t border-surface-800/60">
            <td className="px-3 py-2 font-medium text-surface-100">{r.asset}</td>
            <td className="px-3 py-2 text-right text-surface-200">{n(r.total)}</td>
            <td className="px-3 py-2 text-right text-surface-300">{n(r.available)}</td>
            <td className="px-3 py-2 text-right text-surface-100">{usd(r.value)}</td>
            <td className={`px-3 py-2 text-right ${r.pnl == null ? 'text-surface-500' : r.pnl >= 0 ? 'text-win-400' : 'text-loss-400'}`}>
              {r.pnl == null ? '--' : `${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)}${r.roe != null ? ` (${r.roe >= 0 ? '+' : ''}${r.roe.toFixed(2)}%)` : ''}`}
            </td>
            <td className="px-3 py-2 text-right font-mono text-2xs text-surface-400" title={r.contract}>{shortContract(r.contract)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
