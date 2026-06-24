'use client';

import { useRouter } from 'next/navigation';
import { useTradeMode, type TradeMode } from '@/hooks/useTradeMode';

/** Segmented Simple | Pro switch (Navbar). Persists via useTradeMode; the shells
 *  read the same hook to decide what to render (PLAN-SIMPLE-MODE §3). Switching
 *  also navigates to that mode's home so the change is immediately visible. */
export function SimpleProToggle() {
  const [mode, setMode] = useTradeMode();
  const router = useRouter();
  const choose = (value: TradeMode) => {
    setMode(value);
    router.push(value === 'pro' ? '/market/BTC-USD' : '/');
  };
  const opt = (value: TradeMode, label: string) => (
    <button
      key={value}
      onClick={() => choose(value)}
      aria-pressed={mode === value}
      className={`rounded px-2.5 py-1 text-[0.75rem] font-semibold transition-colors ${
        mode === value ? 'bg-white/[0.10] text-surface-100' : 'text-surface-400 hover:text-surface-100'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center rounded-md bg-white/[0.04] p-0.5" title="Switch trading UI">
      {opt('simple', 'Simple')}
      {opt('pro', 'Pro')}
    </div>
  );
}
