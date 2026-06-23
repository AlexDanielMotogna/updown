'use client';

import { useState, type ReactNode } from 'react';
import { MarketHeader } from './MarketHeader';
import { Chart } from './Chart';
import { Orderbook } from './Orderbook';
import { OrderPanel } from './OrderPanel';
import { PositionsPanel } from './PositionsPanel';
import { ConnectGate } from './ConnectGate';
import type { Ticker } from '@/lib/types';

type Tab = 'chart' | 'book' | 'trade' | 'positions';

const ICONS: Record<Tab, ReactNode> = {
  chart: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-4 3 3 4-6" /></svg>
  ),
  book: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="14" y2="12" /><line x1="4" y1="17" x2="18" y2="17" /></svg>
  ),
  trade: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17V7m0 0l-3 3m3-3l3 3" /><path d="M17 7v10m0 0l3-3m-3 3l-3-3" /></svg>
  ),
  positions: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="6" rx="1" /><rect x="3" y="14" width="18" height="6" rx="1" /></svg>
  ),
};
const TABS: { key: Tab; label: string }[] = [
  { key: 'chart', label: 'Chart' },
  { key: 'book', label: 'Book' },
  { key: 'trade', label: 'Trade' },
  { key: 'positions', label: 'Positions' },
];

/**
 * Mobile terminal layout — header + a full-screen active view + a bottom tab bar
 * (Chart / Book / Trade / Positions). Replaces the desktop resizable PanelGroup
 * on small screens (it's unusable there). Same components, just one at a time.
 */
export function MobileTerminal({
  symbol,
  initial,
  devWallet,
  devEvm,
}: {
  symbol: string;
  initial?: Ticker | null;
  devWallet?: string;
  devEvm?: string;
}) {
  const [tab, setTab] = useState<Tab>('chart');

  return (
    <div className="flex h-full flex-col">
      <MarketHeader symbol={symbol} initial={initial} />

      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Keep the chart mounted across tab switches (re-creating it is costly +
            loses zoom); just hide it. The others are cheap, render on demand. */}
        <div className={`h-full p-1 ${tab === 'chart' ? '' : 'hidden'}`}>
          <Chart symbol={symbol} />
        </div>
        {tab === 'book' && <div className="h-full p-1"><Orderbook symbol={symbol} /></div>}
        {tab === 'trade' && (
          <div className="relative h-full">
            <div className="h-full overflow-y-auto p-1">
              <OrderPanel symbol={symbol} devWallet={devWallet} devEvm={devEvm} />
            </div>
            <ConnectGate devEvm={devEvm} />
          </div>
        )}
        {tab === 'positions' && <div className="h-full overflow-auto p-1"><PositionsPanel devEvm={devEvm} devWallet={devWallet} /></div>}
      </div>

      <nav className="flex shrink-0 border-t border-surface-800 bg-surface-900 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-2xs font-semibold transition-colors ${active ? 'text-brand' : 'text-surface-400 hover:text-surface-200'}`}
            >
              {ICONS[t.key]}
              {t.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
