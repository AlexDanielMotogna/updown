'use client';

import { useEffect, useState } from 'react';

interface PositionView {
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: string;
  entryPrice: string;
  markPrice: string;
  unrealizedPnl: string;
  leverage: number;
}
interface AccountView {
  accountEquity: string;
  availableToSpend: string;
  marginUsed: string;
  unrealizedPnl: string;
}

const n = (s: string, dp = 2) => Number(s).toLocaleString(undefined, { maximumFractionDigits: dp });

export function Positions({ address }: { address?: string }) {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [positions, setPositions] = useState<PositionView[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!address) return;
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(`/api/positions?address=${address}`, { cache: 'no-store' });
        const json = await res.json();
        if (alive && json.success) {
          setAccount(json.data.account);
          setPositions(json.data.positions);
          setLoaded(true);
        }
      } catch {
        /* keep last */
      }
    };
    tick();
    const id = window.setInterval(tick, 4000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [address]);

  if (!address) {
    return (
      <div className="rounded border border-border bg-bg-surface p-3 text-sm text-muted">
        Connect to view positions.
      </div>
    );
  }

  return (
    <div className="rounded border border-border bg-bg-surface text-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-3 py-2">
        <span className="font-semibold">Positions</span>
        {account && (
          <>
            <Metric label="Equity" value={`$${n(account.accountEquity)}`} />
            <Metric label="Avail" value={`$${n(account.availableToSpend)}`} />
            <Metric label="Margin" value={`$${n(account.marginUsed)}`} />
            <Metric
              label="uPnL"
              value={`$${n(account.unrealizedPnl)}`}
              cls={Number(account.unrealizedPnl) >= 0 ? 'text-up' : 'text-down'}
            />
          </>
        )}
      </div>

      {!loaded ? (
        <div className="p-3 text-muted">loading…</div>
      ) : positions.length === 0 ? (
        <div className="p-3 text-muted">No open positions.</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-muted">
            <tr className="border-b border-border">
              <th className="px-3 py-1.5 text-left font-medium">Market</th>
              <th className="px-3 py-1.5 text-left font-medium">Side</th>
              <th className="px-3 py-1.5 text-right font-medium">Size</th>
              <th className="px-3 py-1.5 text-right font-medium">Entry</th>
              <th className="px-3 py-1.5 text-right font-medium">Mark</th>
              <th className="px-3 py-1.5 text-right font-medium">uPnL</th>
              <th className="px-3 py-1.5 text-right font-medium">Lev</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.symbol} className="border-b border-border/50 tabular-nums">
                <td className="px-3 py-1.5 text-left font-medium">{p.symbol}</td>
                <td className={`px-3 py-1.5 text-left ${p.side === 'LONG' ? 'text-up' : 'text-down'}`}>{p.side}</td>
                <td className="px-3 py-1.5 text-right">{n(p.amount, 4)}</td>
                <td className="px-3 py-1.5 text-right">{n(p.entryPrice, 4)}</td>
                <td className="px-3 py-1.5 text-right">{n(p.markPrice, 4)}</td>
                <td className={`px-3 py-1.5 text-right ${Number(p.unrealizedPnl) >= 0 ? 'text-up' : 'text-down'}`}>
                  {n(p.unrealizedPnl)}
                </td>
                <td className="px-3 py-1.5 text-right text-muted">{p.leverage}×</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Metric({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <span className="text-xs">
      <span className="text-muted">{label} </span>
      <span className={`tabular-nums ${cls ?? ''}`}>{value}</span>
    </span>
  );
}
