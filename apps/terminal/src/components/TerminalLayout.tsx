'use client';

import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MarketHeader } from './MarketHeader';
import { Chart } from './Chart';
import { Orderbook } from './Orderbook';
import { OrderPanel } from './OrderPanel';
import { PositionsPanel } from './PositionsPanel';
import type { Ticker } from '@/lib/types';

/** Vertical (column-splitting) drag handle. */
function VHandle() {
  return (
    <PanelResizeHandle className="group relative w-1 bg-surface-900 transition-colors data-[resize-handle-state=hover]:bg-primary-600 data-[resize-handle-state=drag]:bg-primary-500">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}
/** Horizontal (row-splitting) drag handle. */
function HHandle() {
  return (
    <PanelResizeHandle className="group relative h-1 bg-surface-900 transition-colors data-[resize-handle-state=hover]:bg-primary-600 data-[resize-handle-state=drag]:bg-primary-500">
      <span className="absolute inset-x-0 -top-1 -bottom-1" />
    </PanelResizeHandle>
  );
}

/**
 * Dockable/resizable trade workspace (TradingView/Bloomberg style). Dragging any
 * divider resizes neighbors and every widget adapts to its new size (the chart
 * re-fits via lightweight-charts autoSize). Panel sizes persist per user via
 * react-resizable-panels' autoSaveId (localStorage).
 */
export function TerminalLayout({
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
    <div className="flex h-full flex-col gap-1">
      <MarketHeader symbol={symbol} initial={initial} />

      <div className="min-h-0 flex-1">
        <PanelGroup direction="vertical" autoSaveId="updown-terminal-rows">
          {/* Top row: chart | order book | place order */}
          <Panel defaultSize={72} minSize={35}>
            <PanelGroup direction="horizontal" autoSaveId="updown-terminal-cols">
              <Panel defaultSize={60} minSize={28}>
                <div className="h-full overflow-hidden">
                  <Chart symbol={symbol} />
                </div>
              </Panel>
              <VHandle />
              <Panel defaultSize={22} minSize={14}>
                <div className="h-full overflow-hidden">
                  <Orderbook symbol={symbol} />
                </div>
              </Panel>
              <VHandle />
              <Panel defaultSize={18} minSize={13}>
                <div className="h-full overflow-y-auto">
                  <OrderPanel symbol={symbol} devWallet={devWallet} />
                </div>
              </Panel>
            </PanelGroup>
          </Panel>

          <HHandle />

          {/* Bottom row: positions / orders / trades / history */}
          <Panel defaultSize={28} minSize={10}>
            <div className="h-full overflow-auto">
              <PositionsPanel devEvm={devEvm} />
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  );
}
