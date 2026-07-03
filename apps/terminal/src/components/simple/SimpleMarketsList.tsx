'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Ticker, OrderSide } from '@/lib/types';
import { TokenIcon } from '../TokenIcon';
import { Sparkline } from './Sparkline';
import { SimpleTradeModal } from './SimpleTradeModal';
import { SimplePositionsSidebar } from './SimplePositionsSidebar';
import { SimpleSpotPanel } from './SimpleSpotPanel';
import { useSpotHoldings } from '../Holdings';
import { useIdentity } from '@/hooks/useIdentity';
import { useAccountStream } from '@/hooks/useAccountStream';
import { getStream } from '@/lib/stream';
import { useMarkets } from '@/lib/marketsCache';
import { pollWhileVisible } from '@/lib/poll';

const TOP_N = 20; // cap the catalog to the top markets by volume (API load + clarity)
const SPOT_ENABLED = process.env.NEXT_PUBLIC_SPOT_ENABLED === 'true';

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

// Persist the current tab/filter/view in the URL query so a refresh keeps them.
// Written on user action (no effect races); defaults are omitted to keep URLs clean.
function writeMarketsUrl(kind: 'perp' | 'spot', filter: string, view: 'card' | 'row') {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  if (kind === 'spot') params.set('tab', 'spot'); else params.delete('tab');
  if (filter !== 'ALL') params.set('filter', filter); else params.delete('filter');
  if (view === 'card') params.set('view', 'card'); else params.delete('view');
  const qs = params.toString();
  window.history.replaceState(null, '', qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
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
  const [kind, setKind] = useState<'perp' | 'spot'>('perp');
  // Spot holdings for the right rail when in spot mode (perps uses positions/orders).
  const holdings = useSpotHoldings(walletAddress);
  // Shared cache: instant when warm, so the perp↔spot toggle doesn't refetch/flash.
  const tickers = useMarkets(kind);
  const [livePrices, setLivePrices] = useState<Record<string, string>>({});
  const [sparks, setSparks] = useState<Record<string, number[]>>({});
  const [filter, setFilter] = useState<string>('ALL');
  const [view, setView] = useState<'card' | 'row'>('row');
  const [trade, setTrade] = useState<{ symbol: string; side: OrderSide } | null>(null);
  const [spotTrade, setSpotTrade] = useState<string | null>(null); // open spot ticket for a pair
  const [showActivity, setShowActivity] = useState(false); // mobile bottom-sheet for positions/orders
  // Non-USDC, non-dust spot holdings (the "open" things in spot mode).
  const spotHoldingCount = holdings.balances.filter(
    (b) => b.asset !== 'USDC' && Number(b.total) > 0 && Number(b.total) >= Math.pow(10, -(b.metadata?.szDecimals ?? 0)),
  ).length;
  const activityCount = kind === 'spot' ? spotHoldingCount : positions.length + orders.length;

  // Restore tab/filter/view from the URL on mount (survives a page refresh).
  // Runs client-only after hydration, so no SSR mismatch; the brief default
  // flash is hidden by the loading skeletons.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (SPOT_ENABLED && p.get('tab') === 'spot') setKind('spot');
    const f = p.get('filter');
    if (f) setFilter(f);
    if (p.get('view') === 'card') setView('card');
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

  // Sparklines: ONE batched request for all visible perp symbols (spot has none),
  // instead of one /api/klines per card. Slow, visibility-aware refresh.
  const sparkSymbols = useMemo(() => (kind === 'spot' ? '' : top.map((t) => t.symbol).join(',')), [top, kind]);
  useEffect(() => {
    if (!sparkSymbols) { setSparks({}); return; }
    let alive = true;
    const load = () => fetch(`/api/sparklines?symbols=${encodeURIComponent(sparkSymbols)}&interval=1h`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => { if (alive && j.success) setSparks(j.data); })
      .catch(() => {/* keep last */});
    load();
    const stop = pollWhileVisible(load, 60_000);
    return () => { alive = false; stop(); };
  }, [sparkSymbols]);
  // Display label: spot uses the pair displayName base ("HYPE"); perp strips -USD.
  const lbl = (t: Ticker) => (kind === 'spot' ? (t.displayName ?? t.symbol).split('/')[0] : t.symbol.replace('-USD', ''));
  const tabs = useMemo(() => ['ALL', ...top.map(lbl)], [top, kind]);

  const rows = useMemo(
    () => (filter === 'ALL' ? top : tickers.filter((t) => lbl(t) === filter)),
    [top, tickers, filter, kind],
  );

  // Row/button action: spot opens the spot ticket; perp opens the perp trade modal.
  const onPick = (symbol: string, side: OrderSide) => {
    if (kind === 'spot') setSpotTrade(symbol);
    else setTrade({ symbol, side });
  };

  return (
    <div className="flex h-full">
      {/* Left: catalog (left-aligned, fills the space) */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex min-h-full flex-col px-4 py-5 lg:px-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-surface-100">{kind === 'spot' ? 'Spot' : 'Perpetuals'}</h1>
        {SPOT_ENABLED && (
          <div className="relative grid grid-cols-2 overflow-hidden rounded-lg border border-surface-700 bg-surface-900/50 text-xs font-semibold">
            {/* Sliding brand-cyan indicator (futuristic) — exact 50% geometry. */}
            <span
              className={`pointer-events-none absolute inset-y-0 left-0 w-1/2 rounded-[7px] bg-brand/15 ring-1 ring-inset ring-brand/40 shadow-[0_0_14px_-2px_rgba(95,216,239,0.5)] transition-transform duration-300 ease-out ${kind === 'spot' ? 'translate-x-full' : 'translate-x-0'}`}
            />
            {(['perp', 'spot'] as const).map((k) => (
              <button key={k} onClick={() => { setKind(k); setFilter('ALL'); writeMarketsUrl(k, 'ALL', view); }}
                className={`relative z-10 px-5 py-1.5 transition-colors ${kind === k ? 'text-brand' : 'text-surface-400 hover:text-surface-200'}`}>
                {k === 'perp' ? 'Perps' : 'Spot'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Asset filter tabs + view toggle */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button key={t} onClick={() => { setFilter(t); writeMarketsUrl(kind, t, view); }}
              className={`whitespace-nowrap rounded-md px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                filter === t ? 'bg-white/[0.08] text-surface-100' : 'text-surface-400 hover:bg-white/[0.04] hover:text-surface-100'
              }`}>
              {t}
            </button>
          ))}
        </div>
        {/* card | row view switch */}
        <div className="flex shrink-0 items-center rounded-md border border-surface-700 p-0.5">
          {([
            ['card', <svg key="g" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>],
            ['row', <svg key="l" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>],
          ] as const).map(([v, icon]) => (
            <button key={v} onClick={() => { setView(v); writeMarketsUrl(kind, filter, v); }} aria-label={`${v} view`}
              className={`rounded px-2 py-1 transition-colors ${view === v ? 'bg-white/[0.08] text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {tickers.length === 0 ? (
        view === 'card' ? (
          <div className="grid flex-1 content-start grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
          <div className="flex flex-1 flex-col divide-y divide-surface-800 overflow-hidden rounded-xl border border-surface-800 bg-surface-850">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                {/* Asset (icon + name), mirrors the real row's w-36 column */}
                <div className="flex w-36 items-center gap-2">
                  <div className="h-8 w-8 shrink-0 animate-pulse rounded-full bg-surface-800" />
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <div className="h-3 w-16 animate-pulse rounded bg-surface-800" />
                    <div className="h-2 w-9 animate-pulse rounded bg-surface-800" />
                  </div>
                </div>
                {/* Price */}
                <div className="h-3 w-24 animate-pulse rounded bg-surface-800" />
                {/* 24h */}
                <div className="h-3 w-20 animate-pulse rounded bg-surface-800" />
                {/* Volume (md+) */}
                <div className="hidden h-3 w-24 animate-pulse rounded bg-surface-800 md:block" />
                {/* Sparkline (lg+) */}
                <div className="hidden h-7 w-28 animate-pulse rounded bg-surface-800 lg:block" />
                {/* Long / Short */}
                <div className="ml-auto flex gap-1.5">
                  <div className="h-8 w-16 animate-pulse rounded bg-surface-800" />
                  <div className="h-8 w-16 animate-pulse rounded bg-surface-800" />
                </div>
              </div>
            ))}
          </div>
        )
      ) : view === 'card' ? (
        <div className="grid flex-1 content-start grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((t) => {
            const baseSym = lbl(t);
            const chg = Number(t.change24h);
            const up = chg >= 0;
            const chgColor = up ? 'text-win-500' : 'text-loss-500';
            const mark = livePrices[t.symbol] ?? t.mark; // live (WS) price, REST fallback
            return (
              <div key={t.symbol}
                onClick={() => onPick(t.symbol, 'BUY')}
                className="group flex cursor-pointer flex-col gap-2 rounded-xl border border-surface-800 bg-surface-850 p-3 transition-colors hover:border-surface-600">
                {/* Asset row */}
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <TokenIcon symbol={baseSym} size="lg" spot={kind === 'spot'} />
                    <div className="min-w-0 leading-tight">
                      <div className="truncate text-sm font-semibold text-surface-100">{baseSym}</div>
                      <div className="text-2xs font-medium text-surface-500">{kind === 'spot' ? 'SPOT' : 'PERP'}</div>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-surface-300">Vol {fmtVol(t.volume24h)}</span>
                </div>

                {/* Price + 24h */}
                <div className="flex items-baseline justify-between">
                  <span className="text-lg font-bold text-surface-100 tabular-nums">{fmtPrice(mark)}</span>
                  <span className={`${chgColor} text-sm font-semibold tabular-nums`}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
                </div>

                {/* Sparkline (perp only — spot has no WS series wired yet) */}
                {kind !== 'spot' && <div className="py-1"><Sparkline points={sparks[t.symbol]} height={36} /></div>}

                {/* LONG / SHORT — same look as the Pro terminal's Buy/Sell (rounded, semibold) */}
                <div className="grid grid-cols-2 gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onPick(t.symbol, 'BUY')}
                    className="rounded border border-brand/40 bg-transparent py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10">Long</button>
                  <button onClick={() => onPick(t.symbol, 'SELL')}
                    className="rounded border border-loss-500/40 bg-transparent py-1.5 text-xs font-semibold text-loss-500 transition-colors hover:bg-loss-500/10">Short</button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Row / list view */
        <div className="flex flex-1 flex-col divide-y divide-surface-800 overflow-hidden rounded-xl border border-surface-800 bg-surface-850">
          {rows.map((t) => {
            const baseSym = lbl(t);
            const chg = Number(t.change24h);
            const up = chg >= 0;
            const chgColor = up ? 'text-win-500' : 'text-loss-500';
            const mark = livePrices[t.symbol] ?? t.mark;
            return (
              <div key={t.symbol}
                onClick={() => onPick(t.symbol, 'BUY')}
                className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-surface-800/50">
                {/* Asset */}
                <div className="flex w-36 min-w-0 items-center gap-2">
                  <TokenIcon symbol={baseSym} size="md" spot={kind === 'spot'} />
                  <div className="min-w-0 leading-tight">
                    <div className="truncate text-sm font-semibold text-surface-100">{baseSym}</div>
                    <div className="text-2xs font-medium text-surface-500">{kind === 'spot' ? 'SPOT' : 'PERP'}</div>
                  </div>
                </div>
                {/* Price */}
                <span className="w-24 text-right text-sm font-bold text-surface-100 tabular-nums">{fmtPrice(mark)}</span>
                {/* 24h */}
                <span className={`${chgColor} w-20 text-right text-sm font-semibold tabular-nums`}>{up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%</span>
                {/* Volume */}
                <span className="hidden w-24 text-right text-xs font-medium text-surface-300 md:block">{fmtVol(t.volume24h)}</span>
                {/* Sparkline (perp only) */}
                {kind !== 'spot' && <div className="hidden w-28 lg:block"><Sparkline points={sparks[t.symbol]} height={28} /></div>}
                {/* Trade */}
                <div className="ml-auto flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => onPick(t.symbol, 'BUY')}
                    className="rounded border border-brand/40 bg-transparent px-4 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10">Long</button>
                  <button onClick={() => onPick(t.symbol, 'SELL')}
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
      {spotTrade && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSpotTrade(null)} />
          <div className="relative z-10 w-[440px] max-w-[94vw] animate-fade-in overflow-hidden rounded-2xl border border-surface-700 bg-surface-850 shadow-card">
            <SimpleSpotPanel walletAddress={walletAddress} evmAddress={evmAddress} symbol={spotTrade} onClose={() => setSpotTrade(null)} />
          </div>
        </div>
      )}
        </div>
      </div>

      {/* Right: what the user has open (desktop) */}
      <aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-surface-800 bg-surface-900/40 lg:block">
        <SimplePositionsSidebar kind={kind} positions={positions} orders={orders} holdings={holdings.balances} walletAddress={walletAddress} evmAddress={evmAddress} connected={!!evmAddress} />
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
              <SimplePositionsSidebar kind={kind} positions={positions} orders={orders} holdings={holdings.balances} walletAddress={walletAddress} evmAddress={evmAddress} connected={!!evmAddress} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
