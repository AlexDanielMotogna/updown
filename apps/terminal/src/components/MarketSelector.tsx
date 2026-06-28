'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TokenIcon } from './TokenIcon';
import { isSpotSymbol } from '@/lib/api';
import type { Ticker } from '@/lib/types';

const SPOT_ENABLED = process.env.NEXT_PUBLIC_SPOT_ENABLED === 'true';

function fmtPrice(s: string) {
  const v = Number(s);
  const a = Math.abs(v);
  const md = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
  return v.toLocaleString(undefined, { maximumFractionDigits: md });
}
function fmtUsd(v: number) {
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
}
const FAV_KEY = 'updown-favorites';

/** Perp-focused market selector: Favorites/All tabs, search, rich columns,
 * keyboard nav (↑/↓/Enter/Esc, Cmd/Ctrl+K to open). */
export function MarketSelector({ symbol }: { symbol: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'favorites' | 'all'>('all');
  const [markets, setMarkets] = useState<Ticker[]>([]);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [hi, setHi] = useState(0);
  const [mode, setMode] = useState<'perp' | 'spot'>(isSpotSymbol(symbol) ? 'spot' : 'perp');
  const [volDir, setVolDir] = useState<'desc' | 'asc'>('desc');
  const ref = useRef<HTMLDivElement>(null);

  // Load favorites + fetch markets on open.
  useEffect(() => {
    try {
      const s = localStorage.getItem(FAV_KEY);
      if (s) setFavs(new Set(JSON.parse(s) as string[]));
    } catch {/* ignore */}
  }, []);
  useEffect(() => {
    const url = mode === 'spot' ? '/api/markets?kind=spot' : '/api/markets';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => j.success && setMarkets(j.data))
      .catch(() => {/* keep last */});
  }, [open, mode]);

  // Outside-click + global Cmd/Ctrl+K to open.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  function toggleFav(sym: string) {
    setFavs((prev) => {
      const n = new Set(prev);
      if (n.has(sym)) n.delete(sym);
      else n.add(sym);
      localStorage.setItem(FAV_KEY, JSON.stringify([...n]));
      return n;
    });
  }

  const label = (m: Ticker) => m.displayName ?? m.symbol;
  const currentLabel = markets.find((m) => m.symbol === symbol)?.displayName ?? symbol;
  const isSpotMode = mode === 'spot';
  const cols = isSpotMode ? 'grid-cols-[1.6fr_1fr_1.2fr_1.1fr_1.1fr]' : 'grid-cols-[1.4fr_1fr_1.2fr_1fr_1fr_1fr]';

  const filtered = useMemo(() => {
    const matched = markets.filter(
      (m) => (tab === 'all' || favs.has(m.symbol)) && label(m).toLowerCase().includes(q.toLowerCase())
    );
    matched.sort((a, b) => (Number(a.volume24h) - Number(b.volume24h)) * (volDir === 'asc' ? 1 : -1));
    return matched.slice(0, 100);
  }, [markets, tab, favs, q, volDir]);

  useEffect(() => setHi(0), [q, tab, mode]);

  function select(sym: string) {
    setOpen(false);
    setQ('');
    router.push(`/market/${encodeURIComponent(sym)}`);
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) select(filtered[hi].symbol); }
    else if (e.key === 'Escape') setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 rounded px-2 py-1 hover:bg-surface-800">
        <TokenIcon symbol={isSpotMode ? currentLabel.split('/')[0] ?? symbol : symbol} size="md" spot={isSpotMode} />
        <span className="text-base font-semibold">{currentLabel}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" className="text-surface-400">
          <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-[820px] max-w-[94vw] card-elevated animate-fade-in">
          <div className="flex items-center gap-2 p-2">
            {SPOT_ENABLED && (
              <div className="flex rounded bg-surface-900 p-0.5 text-xs">
                {(['perp', 'spot'] as const).map((mk) => (
                  <button
                    key={mk}
                    onClick={() => setMode(mk)}
                    className={`rounded px-2 py-1 ${mode === mk ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}
                  >
                    {mk === 'perp' ? 'Perps' : 'Spot'}
                  </button>
                ))}
              </div>
            )}
            <div className="flex rounded bg-surface-900 p-0.5 text-xs">
              {(['favorites', 'all'] as const).map((tk) => (
                <button
                  key={tk}
                  onClick={() => setTab(tk)}
                  className={`rounded px-2 py-1 capitalize ${tab === tk ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}
                >
                  {tk === 'favorites' ? '★ Favorites' : 'All'}
                </button>
              ))}
            </div>
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onListKey}
              placeholder="Search symbol…  (⌘K)"
              className="input flex-1 py-1.5 text-sm"
            />
          </div>

          {/* Column headers */}
          <div className={`grid ${cols} gap-2 px-3 py-1 text-2xs text-surface-400`}>
            <span>Symbol</span>
            <span className="text-right">Last Price</span>
            <span className="text-right">24h Change</span>
            {isSpotMode ? (
              <>
                <button onClick={() => setVolDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="text-right hover:text-surface-200">
                  Volume {volDir === 'desc' ? '↓' : '↑'}
                </button>
                <span className="text-right">Market Cap</span>
              </>
            ) : (
              <>
                <span className="text-right">Funding</span>
                <span className="text-right">Volume</span>
                <span className="text-right">OI</span>
              </>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {filtered.length === 0 && <div className="p-3 text-sm text-surface-400">No markets</div>}
            {filtered.map((m, i) => {
              const chg = Number(m.change24h);
              const mark = Number(m.mark);
              const abs = mark - mark / (1 + chg / 100);
              const fundPct = Number(m.funding) * 100;
              const isSpot = mode === 'spot';
              const disp = label(m);
              const iconSym = isSpot ? disp.split('/')[0] : m.symbol;
              return (
                <button
                  key={m.symbol}
                  onClick={() => select(m.symbol)}
                  onMouseEnter={() => setHi(i)}
                  className={`grid w-full ${cols} items-center gap-2 px-3 py-1.5 text-left text-xs tabular ${
                    i === hi ? 'bg-surface-800' : ''
                  } ${m.symbol === symbol ? 'border-l-2 border-info' : 'border-l-2 border-transparent'}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      role="button"
                      onClick={(e) => { e.stopPropagation(); toggleFav(m.symbol); }}
                      className={favs.has(m.symbol) ? 'text-warning' : 'text-surface-600 hover:text-surface-300'}
                    >
                      ★
                    </span>
                    <TokenIcon symbol={iconSym} size="sm" spot={isSpot} />
                    <span className="font-medium text-surface-100">{disp}</span>
                    {m.maxLeverage ? <span className="rounded bg-surface-800 px-1 text-2xs text-surface-400">{m.maxLeverage}x</span> : null}
                  </span>
                  <span className="text-right text-surface-100">{fmtPrice(m.mark)}</span>
                  <span className={`text-right ${chg >= 0 ? 'text-win-500' : 'text-loss-500'}`}>
                    {chg >= 0 ? '+' : ''}{fmtPrice(String(abs))} / {chg >= 0 ? '+' : ''}{chg.toFixed(2)}%
                  </span>
                  {isSpot ? (
                    <>
                      <span className="text-right text-surface-300">{fmtUsd(Number(m.volume24h))}</span>
                      <span className="text-right text-surface-300">{m.marketCap ? fmtUsd(Number(m.marketCap)) : '--'}</span>
                    </>
                  ) : (
                    <>
                      <span className={`text-right ${fundPct >= 0 ? 'text-win-500' : 'text-loss-500'}`}>{fundPct.toFixed(4)}%</span>
                      <span className="text-right text-surface-300">{fmtUsd(Number(m.volume24h))}</span>
                      <span className="text-right text-surface-300">{fmtUsd(Number(m.openInterest) * mark)}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
