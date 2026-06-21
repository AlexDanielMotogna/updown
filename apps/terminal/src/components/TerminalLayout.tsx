'use client';

import { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { MarketHeader } from './MarketHeader';
import { Chart } from './Chart';
import { Orderbook } from './Orderbook';
import { OrderPanel } from './OrderPanel';
import { PositionsPanel } from './PositionsPanel';
import { ConnectGate } from './ConnectGate';
import type { Ticker } from '@/lib/types';

/** Vertical (column-splitting) drag handle. */
function VHandle() {
  return (
    <PanelResizeHandle className="relative w-1 bg-surface-900 transition-colors data-[resize-handle-state=hover]:bg-primary-600 data-[resize-handle-state=drag]:bg-primary-500">
      <span className="absolute inset-y-0 -left-1 -right-1" />
    </PanelResizeHandle>
  );
}
/** Horizontal (row-splitting) drag handle. */
function HHandle() {
  return (
    <PanelResizeHandle className="relative h-1 bg-surface-900 transition-colors data-[resize-handle-state=hover]:bg-primary-600 data-[resize-handle-state=drag]:bg-primary-500">
      <span className="absolute inset-x-0 -top-1 -bottom-1" />
    </PanelResizeHandle>
  );
}

/**
 * Dockable/resizable trade workspace (TradingView/Bloomberg style). Outer split
 * is horizontal: [ left work area | place-order ]. The place-order panel spans
 * the FULL height; the left area is split vertically into [chart | order book]
 * on top and the positions table below (so positions is only as wide as
 * chart+orderbook, not under the order panel). Drag any divider — neighbors
 * adapt, the chart re-fits (autoSize). Sizes persist via autoSaveId.
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
  // Render the workspace CLIENT-ONLY. The resizable panels read their sizes from
  // localStorage and the cells render live, locale-formatted numbers — neither can
  // be server-rendered without a hydration mismatch (#418/#425). On prod those
  // mismatches make React throw away + re-render the tree, which leaves effects
  // (notably the live WebSocket that pushes position/order updates) unsettled, so
  // the UI stops reflecting actions. Mounting after the first client render makes
  // SSR and the first client paint identical (empty), eliminating the mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="h-full bg-surface-900" />;

  return (
    <div className="relative h-full">
      {/* Blocking connect gate — overlays the workspace until an EVM wallet is
          connected (HyperLiquid needs an EVM chain). Navbar stays visible. */}
      <ConnectGate devEvm={devEvm} />
      <PanelGroup direction="horizontal" autoSaveId="updown-terminal-main">
        {/* Left work area: (chart | orderbook) over positions */}
        <Panel defaultSize={82} minSize={50}>
          <PanelGroup direction="vertical" autoSaveId="updown-terminal-left-rows">
            <Panel defaultSize={70} minSize={30}>
              <PanelGroup direction="horizontal" autoSaveId="updown-terminal-top-cols">
                <Panel defaultSize={74} minSize={35}>
                  {/* The market header sits above the chart only — so it's only
                      as wide as the chart, and the order book / place-order
                      panels rise to the top. */}
                  <div className="flex h-full flex-col gap-1 overflow-hidden">
                    <MarketHeader symbol={symbol} initial={initial} />
                    <div className="min-h-0 flex-1 overflow-hidden">
                      <Chart symbol={symbol} />
                    </div>
                  </div>
                </Panel>
                <VHandle />
                <Panel defaultSize={26} minSize={16}>
                  <div className="h-full overflow-hidden">
                    <Orderbook symbol={symbol} />
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>
            <HHandle />
            <Panel defaultSize={30} minSize={10}>
              <div className="h-full overflow-auto">
                <PositionsPanel devEvm={devEvm} devWallet={devWallet} />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>

        <VHandle />

        {/* Right: place order — full height */}
        <Panel defaultSize={18} minSize={13}>
          <div className="h-full overflow-y-auto">
            <OrderPanel symbol={symbol} devWallet={devWallet} devEvm={devEvm} />
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
