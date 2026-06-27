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
  const [view, setView] = useState<'card' | 'row'>('card');
  const [trade, setTrade] = useState<{ symbol: string; side: OrderSide } | null>(null);
  const [showActivity, setShowActivity] = useState(false); // mobile bottom-sheet for positions/orders
  const activityCount = positions.length + orders.length;

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

      {/* Asset filter tabs + view toggle */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => setFilter(t)}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === t ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:bg-surface-800/60 hover:text-surface-100'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {/* card | row view switch */}
        <div className="flex shrink-0 items-center rounded-md bg-surface-800 p-0.5">
          {([
            ['card', <svg key="g" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>],
            ['row', <svg key="l" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>],
          ] as const).map(([v, icon]) => (
            <button key={v} onClick={() => setView(v)} aria-label={`${v} view`}
              className={`rounded px-2 py-1 transition-colors ${view === v ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {tickers.length === 0 ? (
        view === 'card' ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-xl border border-surface-800 bg-surface-850 p-3">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 animate-pulse rounded-full bg-surface-800" />
                  <div className="h-3 w-16 animate-pulse rounded bg-surface-800" />
                </div>
                <div className="h-5 w-24 animate-pulse rounded bg-surface-800" />
                <div className="h-9 w-full animate-pulse rounded bg-surface-800" />
                <div className="grid grid-cols-2 gap-1.5">
                  <div className="h-7 animate-pulse rounded bg-surface-800" />
                  <div className="h-7 animate-pulse rounded bg-surface-800" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col divide-y divide-surface-800 overflow-hidden rounded-xl border border-surface-800 bg-surface-850">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-3">
                <div className="h-6 w-6 animate-pulse rounded-full bg-surface-800" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-800" />
                <div className="ml-auto h-7 w-36 animate-pulse rounded bg-surface-800" />
              </div>
            ))}
          </div>
        )
      ) : view === 'card' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                    className="rounded border border-brand/40 bg-transparent py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10">Long</button>
                  <button onClick={() => setTrade({ symbol: t.symbol, side: 'SELL' })}
                    className="rounded border border-loss-500/40 bg-transparent py-1.5 text-xs font-semibold text-loss-500 transition-colors hover:bg-loss-500/10">Short</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Row / list view */
        <div className="flex flex-col divide-y divide-surface-800 overflow-hidden rounded-xl border border-surface-800 bg-surface-850">
          {rows.map((t) => {
            const baseSym = t.symbol.replace('-USD', '');
            const chg = Number(t.change24h);
            const up = chg >= 0;
            const chgColor = up ? 'text-win-500' : 'text-loss-500';
            const mark = livePrices[t.symbol] ?? t.mark;
            return (
              <div key={t.symbol}
                onClick={() => setTrade({ symbol: t.symbol, side: 'BUY' })}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-800/50">
                {/* Asset */}
                <div className="flex w-36 min-w-0 items-center gap-2">
                  <TokenIcon symbol={t.symbol} size="md" />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-semibold text-surface-100">{baseSym}</div>
                    <div className="text-2xs font-medium text-surface-500">PERP</div>
                  </div>
                </div>
                {/* Price */}
                <span className="w-24 text-right text-sm font-bold text-surface-100 tabular-nums">{fmtPrice(mark)}</span>
                {/* 24h */}
                <span className={`${chgColor} w-20 text-right text-sm font-semibold tabular-nums`}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
                {/* Volume */}
                <span className="hidden w-24 text-right text-xs font-medium text-surface-300 md:block">{fmtVol(t.volume24h)}</span>
                {/* Sparkline */}
                <div className="hidden w-28 lg:block"><Sparkline symbol={t.symbol} height={28} /></div>
                {/* Trade */}
                <div className="ml-auto flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setTrade({ symbol: t.symbol, side: 'BUY' })}
                    className="rounded border border-brand/40 bg-transparent px-4 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10">Long</button>
                  <button onClick={() => setTrade({ symbol: t.symbol, side: 'SELL' })}
                    className="rounded border border-loss-500/40 bg-transparent px-4 py-1.5 text-xs font-semibold text-loss-500 transition-colors hover:bg-loss-500/10">Short</button>
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

      {/* Right: what the user has open (desktop) */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-surface-800 bg-surface-900/40 lg:block">
        <SimplePositionsSidebar positions={positions} orders={orders} walletAddress={walletAddress} evmAddress={evmAddress} connected={!!evmAddress} />
      </aside>

      {/* Mobile: floating button to open positions/orders (the desktop rail is hidden) */}
      {!!evmAddress && (
        <button
          onClick={() => setShowActivity(true)}
          className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-surface-700 bg-surface-850 px-4 py-3 text-sm font-semibold text-surface-100 shadow-lg shadow-black/40 lg:hidden"
          aria-label="Open positions and orders"
        >
          Positions & Orders
          {activityCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-2xs font-bold text-surface-950">{activityCount}</span>
          )}
        </button>
      )}

      {/* Mobile: bottom sheet with the same positions/orders rail */}
      {showActivity && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowActivity(false)} />
          <div className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-2xl border-t border-surface-800 bg-surface-900">
            {/* Grab handle + close (no redundant title — the rail labels its own sections) */}
            <div className="relative flex items-center justify-center py-2">
              <span className="h-1 w-10 rounded-full bg-surface-700" />
              <button onClick={() => setShowActivity(false)} className="absolute right-3 top-1.5 text-lg text-surface-400 hover:text-surface-100" aria-label="Close">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <SimplePositionsSidebar positions={positions} orders={orders} walletAddress={walletAddress} evmAddress={evmAddress} connected={!!evmAddress} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
