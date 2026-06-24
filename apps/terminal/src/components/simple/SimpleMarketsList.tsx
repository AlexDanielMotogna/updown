'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticker } from '@/lib/types';
import type { OrderSide } from '@/lib/types';
import { Sparkline } from './Sparkline';
import { SimpleTradeModal } from './SimpleTradeModal';

const MAJORS = ['BTC', 'ETH', 'SOL', 'XRP', 'LINK'];

function fmtPrice(s: string) {
  const n = Number(s);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 1 : 4 })}`;
}
function fmtVol(s: string) {
  const n = Number(s);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Kalshi-style markets list — the Simple Mode landing (PLAN-SIMPLE-MODE §4.1).
 * Trade straight from a row via LONG/SHORT (opens the modal, no page change); tap
 * the row to open the simple market page.
 */
export function SimpleMarketsList({ devWallet, devEvm }: { devWallet?: string; devEvm?: string }) {
  const router = useRouter();
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [filter, setFilter] = useState<string>('ALL');
  const [trade, setTrade] = useState<{ symbol: string; side: OrderSide } | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch('/api/markets', { cache: 'no-store' });
        const j = await r.json();
        if (alive && j.success) setTickers(j.data);
      } catch {/* keep last */}
    };
    tick();
    const id = setInterval(tick, 4000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Asset tabs = ALL + the majors that actually exist in the feed.
  const tabs = useMemo(() => {
    const present = new Set(tickers.map((t) => t.symbol.replace('-USD', '')));
    return ['ALL', ...MAJORS.filter((m) => present.has(m))];
  }, [tickers]);

  const rows = useMemo(() => {
    const list = filter === 'ALL' ? tickers : tickers.filter((t) => t.symbol.replace('-USD', '') === filter);
    return [...list].sort((a, b) => Number(b.volume24h) - Number(a.volume24h));
  }, [tickers, filter]);

  return (
    <div className="mx-auto max-w-3xl px-2 py-3">
      {/* Asset filter tabs */}
      <div className="mb-3 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold ${filter === t ? 'bg-white/[0.10] text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-col divide-y divide-surface-800 rounded-lg border border-surface-800 bg-surface-900/40">
        {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-surface-500">Loading markets…</div>}
        {rows.map((t) => {
          const baseSym = t.symbol.replace('-USD', '');
          const chg = Number(t.change24h);
          const chgColor = chg >= 0 ? 'text-win-500' : 'text-loss-500';
          return (
            <div key={t.symbol}
              onClick={() => router.push(`/market/${t.symbol}`)}
              className="flex cursor-pointer items-center gap-3 px-3 py-3 hover:bg-white/[0.02]">
              {/* Market + price */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-surface-100">{baseSym}/USD</div>
                <div className="text-lg font-bold text-surface-100 tabular-nums">{fmtPrice(t.mark)}</div>
                <div className="flex gap-3 text-xs">
                  <span className={`${chgColor} tabular-nums`}>{chg >= 0 ? '+' : ''}{chg.toFixed(2)}%</span>
                  <span className="text-surface-500">Vol {fmtVol(t.volume24h)}</span>
                </div>
              </div>

              {/* Sparkline */}
              <div className="hidden sm:block"><Sparkline symbol={t.symbol} /></div>

              {/* LONG / SHORT — stopPropagation so the row click doesn't also fire */}
              <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
                <button onClick={() => setTrade({ symbol: t.symbol, side: 'BUY' })}
                  className="rounded px-4 py-1.5 text-xs font-bold text-[#0a0f15]" style={{ background: '#16c784' }}>LONG</button>
                <button onClick={() => setTrade({ symbol: t.symbol, side: 'SELL' })}
                  className="rounded px-4 py-1.5 text-xs font-bold text-white" style={{ background: '#e8566d' }}>SHORT</button>
              </div>
            </div>
          );
        })}
      </div>

      {trade && (
        <SimpleTradeModal open onClose={() => setTrade(null)} symbol={trade.symbol} initialSide={trade.side} devWallet={devWallet} devEvm={devEvm} />
      )}
    </div>
  );
}
