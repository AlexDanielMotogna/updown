'use client';

import { useEffect, useMemo, useState } from 'react';
import { MarketSelector } from './MarketSelector';
import { getStream } from '@/lib/stream';
import { isSpotSymbol } from '@/lib/api';
import { useMarkets } from '@/lib/marketsCache';
import type { Ticker } from '@/lib/types';

function fmtPrice(s?: string) {
  if (s == null) return '—';
  const v = Number(s);
  const a = Math.abs(v);
  const md = a >= 1000 ? 2 : a >= 1 ? 3 : a >= 0.01 ? 5 : 8;
  return v.toLocaleString(undefined, { maximumFractionDigits: md });
}
/** $ value with K/M/B suffixes. */
function fmtUsd(v: number) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
/** Full number with thousands separators + " USDC" (spot volume / market cap). */
function fmtUsdc(s?: string) {
  const v = Number(s);
  if (!Number.isFinite(v)) return '—';
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC`;
}
/** Shorten a contract/tokenId to 0x1234…abcde. */
function shortContract(c?: string) {
  if (!c) return '—';
  return c.length > 13 ? `${c.slice(0, 6)}…${c.slice(-5)}` : c;
}

/** Countdown (HH:mm:ss) to the next top-of-hour funding settlement. */
function useFundingCountdown() {
  const [left, setLeft] = useState('--:--:--');
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(now.getHours() + 1, 0, 0, 0);
      let ms = next.getTime() - now.getTime();
      const h = Math.floor(ms / 3.6e6); ms -= h * 3.6e6;
      const m = Math.floor(ms / 6e4); ms -= m * 6e4;
      const s = Math.floor(ms / 1000);
      const p = (x: number) => String(x).padStart(2, '0');
      setLeft(`${p(h)}:${p(m)}:${p(s)}`);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);
  return left;
}

/** Compact label/value cell for the mobile collapsible stats grid. */
function MiniStat({ label, v, cls }: { label: string; v: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs text-surface-500">{label}</span>
      <span className={cls ?? 'text-surface-100'}>{v}</span>
    </div>
  );
}

function Stat({ label, value, sub, cls }: { label: string; value: string; sub?: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-surface-300">{label}</span>
      <span className={`tabular text-sm ${cls ?? 'text-surface-100'}`}>
        {value}
        {sub ? <span className="ml-1 text-xs">{sub}</span> : null}
      </span>
    </div>
  );
}

export function MarketHeader({ symbol, initial, mobile }: { symbol: string; initial?: Ticker | null; mobile?: boolean }) {
  const [liveMark, setLiveMark] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const countdown = useFundingCountdown();

  // Full ticker (funding/volume/OI/oracle/24h) from the shared markets cache (deduped
  // with the order panel + selector); the live mid comes from the WS below. Fall back
  // to the SSR `initial` until the cache warms.
  const markets = useMarkets(isSpotSymbol(symbol) ? 'spot' : 'perp');
  const t = useMemo(() => markets.find((m) => m.symbol === symbol) ?? initial ?? null, [markets, symbol, initial]);

  // Live mark price over the WS allMids feed (mid only — the rest stays polled).
  useEffect(() => {
    setLiveMark(null);
    const unsub = getStream().subscribePrices((prices) => {
      const p = prices.find((x) => x.symbol === symbol);
      if (p) setLiveMark(Number(p.mark));
    });
    return unsub;
  }, [symbol]);

  const mark = liveMark ?? (t ? Number(t.mark) : 0);
  const chgPct = t ? Number(t.change24h) : 0;
  const prevDay = mark / (1 + chgPct / 100);
  const chgAbs = mark - prevDay;
  const chgUp = chgPct >= 0;
  const fundingPct = t ? Number(t.funding) * 100 : 0;
  const oiUsd = t ? Number(t.openInterest) * mark : 0;
  const spot = isSpotSymbol(symbol);

  // Spot mobile: same compact bar, but the expanded grid shows token stats
  // (price/24h/volume/market cap/contract) instead of perp funding/OI.
  if (mobile && spot) {
    return (
      <div className="card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MarketSelector symbol={symbol} />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="tabular text-sm font-semibold text-surface-100">{mark ? fmtPrice(String(mark)) : '—'}</div>
              <div className={`tabular text-xs font-medium ${chgUp ? 'text-win-500' : 'text-loss-500'}`}>{t ? `${chgUp ? '+' : ''}${chgPct.toFixed(2)}%` : '—'}</div>
            </div>
            <button onClick={() => setExpanded((e) => !e)} className="rounded p-1.5 text-surface-400 hover:bg-surface-800">
              <svg className={`transition-transform ${expanded ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        </div>
        {expanded && (
          <div className="mt-2 grid grid-cols-3 gap-y-2.5 border-t border-surface-800/50 pt-2 text-[11px] tabular">
            <MiniStat label="Price" v={mark ? fmtPrice(String(mark)) : '—'} />
            <MiniStat label="24h Change" v={t ? `${chgUp ? '+' : ''}${fmtPrice(String(chgAbs))}` : '—'} cls={chgUp ? 'text-win-500' : 'text-loss-500'} />
            <MiniStat label="24h Volume" v={fmtUsdc(t?.volume24h)} />
            <MiniStat label="Market Cap" v={fmtUsdc(t?.marketCap)} />
            <MiniStat label="Contract" v={shortContract(t?.contract)} />
          </div>
        )}
      </div>
    );
  }

  // Mobile: compact bar (selector + price + 24h%) with a chevron that expands a
  // stats grid — per docs/Terminal-Migration/mobile-terminal-style.md §5.1.
  if (mobile) {
    return (
      <div className="card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MarketSelector symbol={symbol} />
            <span className="rounded bg-surface-800 px-1.5 py-0.5 text-2xs text-surface-300" title="Max leverage">{t?.maxLeverage ? `${t.maxLeverage}x` : '—'}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="tabular text-sm font-semibold text-surface-100">{mark ? fmtPrice(String(mark)) : '—'}</div>
              <div className={`tabular text-xs font-medium ${chgUp ? 'text-win-500' : 'text-loss-500'}`}>{t ? `${chgUp ? '+' : ''}${chgPct.toFixed(2)}%` : '—'}</div>
            </div>
            <button onClick={() => setExpanded((e) => !e)} className="rounded p-1.5 text-surface-400 hover:bg-surface-800">
              <svg className={`transition-transform ${expanded ? 'rotate-180' : ''}`} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </button>
          </div>
        </div>
        {expanded && (
          <div className="mt-2 grid grid-cols-3 gap-y-2.5 border-t border-surface-800/50 pt-2 text-[11px] tabular">
            <MiniStat label="Oracle" v={fmtPrice(t?.index)} />
            <MiniStat label="24h Change" v={t ? `${chgUp ? '+' : ''}${fmtPrice(String(chgAbs))}` : '—'} cls={chgUp ? 'text-win-500' : 'text-loss-500'} />
            <MiniStat label="24h Volume" v={t ? fmtUsd(Number(t.volume24h)) : '—'} />
            <MiniStat label="Open Interest" v={t ? fmtUsd(oiUsd) : '—'} />
            <MiniStat label="Funding" v={t ? `${fundingPct.toFixed(4)}%` : '—'} cls={fundingPct >= 0 ? 'text-win-500' : 'text-loss-500'} />
            <MiniStat label="Countdown" v={countdown} />
          </div>
        )}
      </div>
    );
  }

  // Spot desktop: token-centric stats (price / 24h / volume / market cap /
  // contract) — no leverage, funding, OI or oracle (those are perp-only).
  if (spot) {
    return (
      <div className="card flex flex-wrap items-center gap-x-10 gap-y-2 px-3 py-2">
        <div className="flex items-center gap-2">
          <MarketSelector symbol={symbol} />
        </div>
        <Stat label="Price" value={mark ? fmtPrice(String(mark)) : '—'} />
        <Stat
          label="24h Change"
          value={t ? `${chgUp ? '+' : ''}${fmtPrice(String(chgAbs))} / ${chgUp ? '+' : ''}${chgPct.toFixed(2)}%` : '—'}
          cls={chgUp ? 'text-win-500' : 'text-loss-500'}
        />
        <Stat label="24h Volume" value={fmtUsdc(t?.volume24h)} />
        <Stat label="Market Cap" value={fmtUsdc(t?.marketCap)} />
        <Stat label="Contract" value={shortContract(t?.contract)} />
      </div>
    );
  }

  return (
    <div className="card flex flex-wrap items-center gap-x-10 gap-y-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <MarketSelector symbol={symbol} />
        <span className="rounded bg-surface-800 px-1.5 py-0.5 text-xs text-surface-300" title="Max leverage">
          {t?.maxLeverage ? `${t.maxLeverage}x` : '—'}
        </span>
      </div>
      <Stat label="Mark" value={mark ? fmtPrice(String(mark)) : '—'} />
      <Stat label="Oracle" value={fmtPrice(t?.index)} />
      <Stat
        label="24h Change"
        value={t ? `${chgUp ? '+' : ''}${fmtPrice(String(chgAbs))} / ${chgUp ? '+' : ''}${chgPct.toFixed(2)}%` : '—'}
        cls={chgUp ? 'text-win-500' : 'text-loss-500'}
      />
      <Stat label="24h Volume" value={t ? fmtUsd(Number(t.volume24h)) : '—'} />
      <Stat label="Open Interest" value={t ? fmtUsd(oiUsd) : '—'} />
      <Stat
        label="Funding / Countdown"
        value={t ? `${fundingPct.toFixed(4)}%` : '—'}
        sub={countdown}
        cls={fundingPct >= 0 ? 'text-win-500' : 'text-loss-500'}
      />
    </div>
  );
}
