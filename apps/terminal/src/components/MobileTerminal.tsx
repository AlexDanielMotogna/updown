'use client';

import { useCallback, useEffect, useState } from 'react';
import { MarketHeader } from './MarketHeader';
import { Chart } from './Chart';
import { Orderbook } from './Orderbook';
import { OrderPanel } from './OrderPanel';
import { PositionsPanel } from './PositionsPanel';
import { ConnectGate } from './ConnectGate';
import type { Ticker } from '@/lib/types';
import type { OrderSide } from '@/lib/types';

type Section = 'chart' | 'book';

/**
 * Mobile terminal — CEX-style (Binance/MEXC/Bybit), per
 * docs/Terminal-Migration/mobile-terminal-style.md:
 *   market bar → section tabs (Chart | Order Book) → positions cards
 *   + sticky Buy/Long · Sell/Short → slide-up order-form bottom sheet.
 * The desktop resizable PanelGroup is unusable on phones.
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
  const [section, setSection] = useState<Section>('chart');
  const [showSheet, setShowSheet] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetSide, setSheetSide] = useState<OrderSide>('BUY');

  // Open: mount → next frame → visible (triggers the slide-up transition).
  useEffect(() => {
    if (showSheet) requestAnimationFrame(() => requestAnimationFrame(() => setSheetVisible(true)));
  }, [showSheet]);

  // Close: hide → wait out the transition → unmount.
  const closeSheet = useCallback(() => {
    setSheetVisible(false);
    setTimeout(() => setShowSheet(false), 400);
  }, []);

  const openSheet = (side: OrderSide) => { setSheetSide(side); setShowSheet(true); };

  const TABS: { key: Section; label: string }[] = [
    { key: 'chart', label: 'Chart' },
    { key: 'book', label: 'Order Book' },
  ];

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-[72px]" style={{ overflowAnchor: 'none' }}>
      {/* Market bar (price + live stats) */}
      <MarketHeader symbol={symbol} initial={initial} />

      {/* Section tabs — underline on active (border-b-2) */}
      <div className="flex items-center">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setSection(t.key)}
            className={`flex-1 border-b-2 py-2.5 text-center text-xs font-medium transition-colors ${
              section === t.key ? 'border-surface-300 text-surface-100' : 'border-transparent text-surface-400 hover:text-surface-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Chart stays mounted across tab switches (re-creating it is costly + loses zoom). */}
      <div className={`h-[400px] p-1 ${section === 'chart' ? '' : 'hidden'}`}>
        <Chart symbol={symbol} />
      </div>
      {section === 'book' && (
        <div className="h-[500px] p-1">
          <Orderbook symbol={symbol} />
        </div>
      )}

      {/* Positions / open orders / history */}
      <div className="p-1">
        <PositionsPanel devEvm={devEvm} devWallet={devWallet} />
      </div>

      {/* Sticky Buy/Long · Sell/Short (open the order sheet). */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 bg-surface-900 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          onClick={() => openSheet('BUY')}
          className="flex-1 rounded-lg bg-win-500 py-3 text-sm font-bold text-white transition-colors hover:bg-win-400"
        >
          Buy / Long
        </button>
        <button
          onClick={() => openSheet('SELL')}
          className="flex-1 rounded-lg bg-[#e8566d] py-3 text-sm font-bold text-white transition-colors hover:bg-[#ec6b7e]"
        >
          Sell / Short
        </button>
      </div>

      {/* Order-form bottom sheet */}
      {showSheet && (
        <div className="fixed inset-0 z-[70]">
          <div
            className="absolute inset-0 bg-black/60 transition-opacity duration-300"
            style={{ opacity: sheetVisible ? 1 : 0 }}
            onClick={closeSheet}
          />
          <div
            className="absolute inset-x-0 bottom-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
            style={{ transform: sheetVisible ? 'translateY(0)' : 'translateY(100%)' }}
          >
            <div className="max-h-[88vh] overflow-y-auto rounded-t-2xl bg-surface-900 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="sticky top-0 z-10 rounded-t-2xl bg-surface-900 pb-2 pt-3">
                <div className="mb-2 flex justify-center">
                  <div className="h-1 w-10 rounded-full bg-surface-600" />
                </div>
                <div className="flex items-center justify-between px-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-surface-100">Place Order</h3>
                  <button onClick={closeSheet} className="rounded p-1.5 text-surface-400 hover:bg-surface-800">✕</button>
                </div>
              </div>
              <div className="relative px-3 pb-2">
                <OrderPanel symbol={symbol} devWallet={devWallet} devEvm={devEvm} initialSide={sheetSide} />
                <ConnectGate devEvm={devEvm} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
