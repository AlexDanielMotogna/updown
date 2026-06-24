'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ticker, OrderSide } from '@/lib/types';
import { TokenIcon } from '../TokenIcon';
import { Sparkline } from './Sparkline';
import { SimpleTradeModal } from './SimpleTradeModal';
import { SimplePositionsSidebar } from './SimplePositionsSidebar';
import { useIdentity } from '@/hooks/useIdentity';
import { useAccountStream } from '@/hooks/useAccountStream';
import { getStream } from '@/lib/stream';

const TOP_N = 20; // cap the catalog to the top markets by volume (API load + clarity)

function fmtPrice(s: string) {
  const n = Number(s);
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n >= 100 ? 2 : 4 })}`;
}
function fmtVol(s: string) {
  const n = Number(s);
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/**
 * Kalshi/Robinhood-style perps catalog — the Simple Mode landing
 * (PLAN-SIMPLE-MODE §4.1). Styled with the app's tokens (surface/brand/win/loss,
 * TokenIcon, card). Tapping a row or LONG/SHORT opens the trade modal (no nav).
 */
export function SimpleMarketsList({ devWallet, devEvm }: { devWallet?: string; devEvm?: string }) {
  const id = useIdentity();
  const walletAddress = id.walletAddress ?? devWallet;
  const evmAddress = id.evmAddress ?? devEvm;
  const { positions, orders } = useAccountStream(evmAddress);
  const [tickers, setTickers] = useState<Ticker[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<string>('ALL');
  const [trade, setTrade] = useState<{ symbol: string; side: OrderSide } | null>(null);

  // Static-ish fields (24h change, volume, the list) over REST — slow poll, since
  // live price now comes from the WS below.
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
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Live mark prices over ONE WS subscription (allMids) — every coin in a single
  // feed, so cards update in realtime without hammering the REST endpoint.
  useEffect(() => {
    const unsub = getStream().subscribePrices((prices) => {
      setLivePrices((cur) => {
        const next = { ...cur };
        for (const p of prices) next[p.symbol] = p.mark;
        return next;
      });
    });
    return unsub;
  }, []);

  // Top-N markets by volume (the catalog cap). Used for both the cards and the tabs.
  const top = useMemo(
    () => [...tickers].sort((a, b) => Number(b.volume24h) - Number(a.volume24h)).slice(0, TOP_N),
    [tickers],
  );
  const tabs = useMemo(() => ['ALL', ...top.map((t) => t.symbol.replace('-USD', ''))], [top]);

  const rows = useMemo(
    () => (filter === 'ALL' ? top : tickers.filter((t) => t.symbol.replace('-USD', '') === filter)),
    [top, tickers, filter],
  );

  return (
    <div className="flex h-full">
      {/* Left: catalog (left-aligned, fills the space) */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="px-4 py-5 lg:px-6">
      <h1 className="mb-4 text-xl font-bold text-surface-100">Perpetuals</h1>

      {/* Asset filter tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              filter === t ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-800/60 hover:text-surface-100'
            }`}>
            {t}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-surface-800 bg-surface-850 px-4 py-16 text-center text-sm text-surface-500">Loading markets…</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {rows.map((t) => {
            const baseSym = t.symbol.replace('-USD', '');
            const chg = Number(t.change24h);
            const up = chg >= 0;
            const chgColor = up ? 'text-win-500' : 'text-loss-500';
            const mark = livePrices[t.symbol] ?? t.mark; // live (WS) price, REST fallback
            return (
              <div key={t.symbol}
                onClick={() => setTrade({ symbol: t.symbol, side: 'BUY' })}
                className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-surface-800 bg-surface-850 p-3 transition-colors hover:border-surface-600">
                {/* Asset row */}
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <TokenIcon symbol={t.symbol} size="lg" />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-semibold text-surface-100">{baseSym}</div>
                      <div className="text-2xs font-medium text-surface-500">PERP</div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-surface-300">Vol {fmtVol(t.volume24h)}</span>
                </div>

                {/* Price + 24h */}
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-surface-100 tabular-nums">{fmtPrice(mark)}</span>
                  <span className={`${chgColor} text-sm font-semibold tabular-nums`}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
                </div>

                {/* Sparkline */}
                <div className="py-1"><Sparkline symbol={t.symbol} height={36} /></div>

                {/* LONG / SHORT — same look as the Pro terminal's Buy/Sell (rounded, semibold) */}
                <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setTrade({ symbol: t.symbol, side: 'BUY' })}
                    className="rounded bg-win-500 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90">Long</button>
                  <button onClick={() => setTrade({ symbol: t.symbol, side: 'SELL' })}
                    className="rounded bg-loss-500 py-1.5 text-xs font-semibold text-black transition-opacity hover:opacity-90">Short</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {trade && (
        <SimpleTradeModal open onClose={() => setTrade(null)} symbol={trade.symbol} initialSide={trade.side} devWallet={devWallet} devEvm={devEvm} />
      )}
        </div>
      </div>

      {/* Right: what the user has open */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-surface-800 bg-surface-900/40 lg:block">
        <SimplePositionsSidebar positions={positions} orders={orders} walletAddress={walletAddress} connected={!!evmAddress} />
      </aside>
    </div>
  );
}
