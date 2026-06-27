'use client';

import { useState } from 'react';
import type { Order, Position } from 'exchange-core';
import { cancelOrder } from '@/lib/api';
import { useToast } from '../Toast';
import { useTrading } from '@/hooks/useTrading';
import { SimplePosition } from './SimplePosition';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/** Centered empty / connect state — UpDown-icon node in a brand-tinted box with a
 *  soft pulse, matching the ConnectGate look the user liked. */
function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10">
        <span className="absolute inset-0 rounded-2xl border border-brand/30 animate-ping" style={{ animationDuration: '2.6s' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/updown-logos/Logo_48px_Cyan_Transparent.png" alt="UpDown" className="h-9 w-9" />
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-surface-100">{connected ? 'No open positions' : 'Connect to trade'}</h3>
        <p className="text-xs leading-relaxed text-surface-300">
          {connected
            ? 'Your open positions will show up here. Pick a market and go Long or Short.'
            : 'Connect your wallet to see your positions and orders here.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Right rail for the Simple catalog (PLAN-SIMPLE-MODE): "what do I have open" —
 * live positions (with Close) + any resting orders (with Cancel). Reuses
 * SimplePosition; reads nothing itself (data passed from the catalog's stream).
 */
export function SimplePositionsSidebar({
  positions,
  orders,
  walletAddress,
  evmAddress,
  connected,
}: {
  positions: Position[];
  orders: Order[];
  walletAddress?: string;
  evmAddress?: string;
  connected: boolean;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'card' | 'row'>('card');
  // One-time, GLOBAL agent approval. Single source of truth for the whole sidebar
  // so enabling once unlocks Close on every card (a per-card useTrading meant
  // approving on one card left the others stuck on "Enable").
  const { enabled: tradingEnabled, busy: enabling, enableTrading } = useTrading(walletAddress, evmAddress);
  const needsAgent = !!walletAddress && positions.length > 0 && !tradingEnabled;

  async function cancel(o: Order) {
    if (!walletAddress) return;
    setBusyId(String(o.orderId));
    const tid = toast.loading('Cancelling order…');
    const res = await cancelOrder({ walletAddress, symbol: o.symbol, orderId: o.orderId });
    setBusyId(null);
    toast.update(tid, res.success ? 'success' : 'error', res.success ? 'Order cancelled' : res.error?.message ?? 'Cancel failed');
  }

  // Centered empty state (not connected, or connected with nothing open).
  if (!connected || (positions.length === 0 && orders.length === 0)) {
    return <EmptyState connected={connected} />;
  }

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-surface-100">Open Positions</h2>
          {/* card | row view switch (matches the catalog) */}
          <div className="flex items-center rounded-md bg-surface-800 p-0.5">
            {([
              ['card', <svg key="g" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>],
              ['row', <svg key="l" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>],
            ] as const).map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)} aria-label={`${v} view`}
                className={`rounded px-1.5 py-1 transition-colors ${view === v ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
                {icon}
              </button>
            ))}
          </div>
        </div>
        {needsAgent && (
          <div className="mb-2 rounded-lg border border-brand/30 bg-brand/10 p-2.5">
            <p className="mb-2 text-xs leading-relaxed text-surface-200">Enable trading once to close or manage your positions.</p>
            <button onClick={enableTrading} disabled={enabling}
              className="w-full rounded-lg bg-brand py-2 text-sm font-bold text-surface-950 transition-opacity hover:opacity-90 disabled:opacity-50">
              {enabling ? 'Enabling…' : 'Enable Trading'}
            </button>
          </div>
        )}
        {positions.length === 0 ? (
          <p className="text-xs text-surface-500">No open positions.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {positions.map((p) => (
              <SimplePosition key={p.symbol} pos={p} walletAddress={walletAddress} canClose={tradingEnabled} compact={view === 'row'} />
            ))}
          </div>
        )}
      </section>

      {orders.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold text-surface-100">Open Orders</h2>
          <div className="flex flex-col gap-2">
            {orders.map((o) => {
              const base = o.symbol.replace('-USD', '');
              const long = o.side === 'BUY';
              return (
                <div key={o.orderId} className="rounded-lg border border-surface-800 bg-surface-850 p-2.5 text-xs">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="font-semibold text-surface-100">{base}</span>
                    <span className={long ? 'text-win-500' : 'text-loss-500'}>{long ? 'Long' : 'Short'} · {o.type}</span>
                  </div>
                  <div className="flex items-center justify-between text-surface-400">
                    <span className="tabular-nums">{o.remaining} @ {Number(o.price) > 0 ? usd(Number(o.price)) : 'mkt'}</span>
                    <button onClick={() => cancel(o)} disabled={busyId === String(o.orderId)}
                      className="rounded border border-surface-700 px-2 py-0.5 font-medium text-surface-300 hover:bg-surface-800 disabled:opacity-50">
                      {busyId === String(o.orderId) ? '…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
