'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeMode, type TradeMode } from '@/hooks/useTradeMode';

/**
 * "Trade ▾" nav dropdown — picks the trading UI (Simple | Pro). Replaces the old
 * segmented SimpleProToggle: same spot in both modes, grouped under the Trade nav
 * item. Persists via useTradeMode and navigates to that mode's home so the change
 * is immediately visible (pro → /trade/BTC/USDC, simple → /).
 */
export function TradeModeMenu() {
  const [mode, setMode] = useTradeMode();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (value: TradeMode) => {
    setOpen(false);
    setMode(value);
    router.push(value === 'pro' ? '/trade/BTC/USDC' : '/');
  };

  const item = (value: TradeMode, label: string, desc: string) => {
    const active = mode === value;
    return (
      <button
        key={value}
        onClick={() => choose(value)}
        aria-pressed={active}
        className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand' : 'bg-transparent'}`} />
        <span className="min-w-0">
          <span className={`block text-[0.8rem] font-semibold ${active ? 'text-brand' : 'text-surface-100'}`}>{label}</span>
          <span className="block text-[0.7rem] leading-snug text-surface-400">{desc}</span>
        </span>
      </button>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1 rounded-md bg-white/[0.06] px-3 py-1.5 text-[0.85rem] font-semibold text-surface-100 transition-colors hover:bg-white/[0.1]"
      >
        Trade
        <svg
          width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="animate-fade-in absolute left-0 top-full z-[110] mt-1 w-56 rounded-lg border border-surface-700 bg-surface-900 p-1 shadow-xl">
          {item('simple', 'Simple', 'Beginner-friendly, one-tap trading')}
          {item('pro', 'Pro', 'Full terminal — chart, order book, TP/SL')}
        </div>
      )}
    </div>
  );
}
