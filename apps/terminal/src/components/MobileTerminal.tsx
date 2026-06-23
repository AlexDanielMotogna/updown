'use client';

import { MarketHeader } from './MarketHeader';
import { Chart } from './Chart';
import { Orderbook } from './Orderbook';
import { OrderPanel } from './OrderPanel';
import { PositionsPanel } from './PositionsPanel';
import { ConnectGate } from './ConnectGate';
import type { Ticker } from '@/lib/types';

/**
 * Mobile terminal — MEXC-style vertical scroll. Top to bottom: market header,
 * chart, then order book + buy/sell form SIDE BY SIDE, then positions/orders.
 * The whole page scrolls; the resizable desktop PanelGroup is unusable on phones.
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
  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
      <MarketHeader symbol={symbol} initial={initial} />

      {/* Chart */}
      <div className="h-[280px] p-1">
        <Chart symbol={symbol} />
      </div>

      {/* Order book (left) + Buy/Sell form (right) — side by side, MEXC-style. */}
      <div className="flex items-start gap-1 px-1">
        <div className="h-[460px] w-[43%] min-w-0">
          <Orderbook symbol={symbol} />
        </div>
        <div className="relative min-w-0 flex-1">
          <OrderPanel symbol={symbol} devWallet={devWallet} devEvm={devEvm} />
          {/* Gate overlays ONLY the order form (chart/book stay open to all). */}
          <ConnectGate devEvm={devEvm} />
        </div>
      </div>

      {/* Positions / open orders / history */}
      <div className="p-1">
        <PositionsPanel devEvm={devEvm} devWallet={devWallet} />
      </div>
    </div>
  );
}
