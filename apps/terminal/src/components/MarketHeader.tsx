'use client';

import { useEffect, useState } from 'react';
import { MarketSelector } from './MarketSelector';
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

export function MarketHeader({ symbol, initial }: { symbol: string; initial?: Ticker | null }) {
  const [t, setT] = useState<Ticker | null>(initial ?? null);
  const countdown = useFundingCountdown();

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch('/api/markets', { cache: 'no-store' });
        const json = await res.json();
        if (alive && json.success) setT((json.data as Ticker[]).find((m) => m.symbol === symbol) ?? null);
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => { alive = false; window.clearInterval(id); };
  }, [symbol]);

  const mark = t ? Number(t.mark) : 0;
  const chgPct = t ? Number(t.change24h) : 0;
  const prevDay = mark / (1 + chgPct / 100);
  const chgAbs = mark - prevDay;
  const chgUp = chgPct >= 0;
  const fundingPct = t ? Number(t.funding) * 100 : 0;
  const oiUsd = t ? Number(t.openInterest) * mark : 0;

  return (
    <div className="card flex flex-wrap items-center gap-x-10 gap-y-2 px-3 py-2">
      <div className="flex items-center gap-2">
        <MarketSelector symbol={symbol} />
        <span className="rounded bg-surface-800 px-1.5 py-0.5 text-xs text-surface-300" title="Max leverage">
          {t?.maxLeverage ? `${t.maxLeverage}x` : '—'}
        </span>
      </div>
      <Stat label="Mark" value={fmtPrice(t?.mark)} />
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
