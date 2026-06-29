'use client';

import { useEffect, useState } from 'react';
import { fetchSpotBalances, type SpotBalanceRow } from '@/lib/api';
import { pollWhileVisible } from '@/lib/poll';
import { TokenIcon } from './TokenIcon';

const n = (s: string | number, dp = 4) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });
const usd = (v: number) => (Number.isFinite(v) ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

export interface SpotHoldings {
  balances: SpotBalanceRow[];
  loaded: boolean;
}

/**
 * Spot balances for an account, polled (15s) + refreshed instantly on a spot trade.
 * Lives at the panel level so holdings are fetched on first load (not only when the
 * Spot Holdings tab is opened). Balances/value/contract are computed server-side by
 * TOKEN INDEX (names collide), resolving the EVM/HL account from the Solana wallet.
 */
export function useSpotHoldings(walletAddress?: string): SpotHoldings {
  const [balances, setBalances] = useState<SpotBalanceRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!walletAddress) { setBalances([]); setLoaded(false); return; }
    let alive = true;
    const load = async () => {
      try {
        const r = await fetchSpotBalances(walletAddress);
        if (alive && r.success) setBalances(r.data ?? []);
      } catch { /* keep last */ }
      finally { if (alive) setLoaded(true); }
    };
    load();
    const stop = pollWhileVisible(load, 15000);
    const onTraded = () => load();
    window.addEventListener('updown:spot-traded', onTraded);
    return () => { alive = false; stop(); window.removeEventListener('updown:spot-traded', onTraded); };
  }, [walletAddress]);

  return { balances, loaded };
}

/**
 * Spot holdings tab for the Pro Positions panel — presentational; data comes from
 * useSpotHoldings (hoisted to the panel so it pre-loads). Matches the other tables'
 * design (shared header/row styling, TokenIcon). PnL/ROE vs HL's entryNtl.
 */
export function HoldingsTab({
  balances,
  loaded,
  walletAddress,
  isMobile,
}: {
  balances: SpotBalanceRow[];
  loaded: boolean;
  walletAddress?: string;
  isMobile?: boolean;
}) {
  const rows = balances
    .map((b) => {
      const value = Number(b.usdValue ?? 0);
      // Cost-basis P&L + ROE from HL's entryNtl (no fill persistence needed).
      const entry = Number(b.entryNotional ?? 0);
      const pnl = b.asset !== 'USDC' && entry > 0 ? value - entry : null;
      const roe = pnl != null && entry > 0 ? (pnl / entry) * 100 : null;
      const contract = b.metadata?.contract ?? '';
      return { ...b, value, pnl, roe, contract };
    })
    // Hide sub-lot dust (< 1 lot = 10^-szDecimals): unsellable on the book, HL
    // auto-dusts it. Always keep USDC.
    .filter((r) => {
      if (Number(r.total) <= 0) return false;
      if (r.asset === 'USDC') return true;
      const sz = r.metadata?.szDecimals ?? 0;
      return Number(r.total) >= Math.pow(10, -sz);
    })
    .sort((a, b) => b.value - a.value);

  const shortContract = (c: string) => (c && c.length > 12 ? `${c.slice(0, 6)}…${c.slice(-4)}` : c || '--');

  if (!walletAddress) return <Empty>Connect to view holdings.</Empty>;
  if (!loaded && rows.length === 0) return <Empty>loading…</Empty>;
  if (rows.length === 0) return <Empty>No spot balances.</Empty>;

  if (isMobile) {
    return (
      <div className="space-y-1.5 p-1.5">
        {rows.map((r) => (
          <div key={r.asset} className="flex items-center justify-between rounded-lg border border-surface-800/60 bg-surface-900/50 px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <TokenIcon symbol={r.asset} size="sm" spot />
              <span className="min-w-0">
                <div className="text-sm font-medium text-surface-100">{r.asset}</div>
                <div className="text-2xs text-surface-500">{n(r.total)} · {usd(r.value)}</div>
              </span>
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
      <thead className="sticky top-0 bg-surface-850 text-xs text-surface-300">
        <tr>
          {['Coin', 'Total Balance', 'Available', 'USDC Value', 'PnL (ROE %)', 'Contract'].map((h, i) => (
            <th key={i} className="px-3 py-2 text-left font-medium">{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.asset} className="border-b border-surface-800/60 tabular">
            <td className="px-3 py-1.5">
              <span className="flex items-center gap-1.5">
                <TokenIcon symbol={r.asset} size="sm" spot />
                <span className="font-medium text-surface-100">{r.asset}</span>
              </span>
            </td>
            <td className="px-3 py-1.5 text-surface-100">{n(r.total)}</td>
            <td className="px-3 py-1.5 text-surface-400">{n(r.available)}</td>
            <td className="px-3 py-1.5 text-surface-100">{usd(r.value)}</td>
            <td className={`px-3 py-1.5 ${r.pnl == null ? 'text-surface-500' : r.pnl >= 0 ? 'text-win-500' : 'text-loss-500'}`}>
              {r.pnl == null ? '--' : `${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)}${r.roe != null ? ` (${r.roe >= 0 ? '+' : ''}${r.roe.toFixed(2)}%)` : ''}`}
            </td>
            <td className="px-3 py-1.5 font-mono text-2xs text-surface-400" title={r.contract}>{shortContract(r.contract)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-4 text-xs text-surface-500">{children}</div>;
}
