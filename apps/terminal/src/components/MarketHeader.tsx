'use client';

import { useEffect, useState } from 'react';
import { MarketSelector } from './MarketSelector';
import type { Ticker } from '@/lib/types';

const fmtPrice = (s?: string) =>
  s == null ? '—' : Number(s).toLocaleString(undefined, { maximumFractionDigits: Number(s) >= 100 ? 1 : 4 });
function fmtVol(s?: string) {
  if (s == null) return '—';
  const n = Number(s);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function Stat({ label, value, cls }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-surface-300">{label}</span>
      <span className={`tabular text-sm ${cls ?? 'text-surface-100'}`}>{value}</span>
    </div>
  );
}

export function MarketHeader({ symbol, initial }: { symbol: string; initial?: Ticker | null }) {
  const [t, setT] = useState<Ticker | null>(initial ?? null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/markets', { cache: 'no-store' });
        const json = await res.json();
        if (alive && json.success) setT((json.data as Ticker[]).find((m) => m.symbol === symbol) ?? null);
      } catch {
        /* keep last */
      }
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [symbol]);

  const chg = t ? Number(t.change24h) : 0;

  return (
    <div className="card flex flex-wrap items-center gap-x-6 gap-y-2 px-3 py-2">
      <MarketSelector symbol={symbol} />
      <Stat label="Mark" value={fmtPrice(t?.mark)} />
      <Stat label="24h Change" value={t ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%` : '—'} cls={chg >= 0 ? 'text-win-500' : 'text-loss-500'} />
      <Stat label="24h Volume" value={fmtVol(t?.volume24h)} />
      <Stat
        label="Funding (1h)"
        value={t ? `${(Number(t.funding) * 100).toFixed(4)}%` : '—'}
        cls={t && Number(t.funding) >= 0 ? 'text-win-500' : 'text-loss-500'}
      />
      <Stat label="Max Lev" value={t?.maxLeverage ? `${t.maxLeverage}×` : '—'} cls="text-surface-300" />
    </div>
  );
}
