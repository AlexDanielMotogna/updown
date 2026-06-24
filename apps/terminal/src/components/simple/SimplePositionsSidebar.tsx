'use client';

import { useState } from 'react';
import type { Order, Position } from 'exchange-core';
import { cancelOrder } from '@/lib/api';
import { useToast } from '../Toast';
import { SimplePosition } from './SimplePosition';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/**
 * Right rail for the Simple catalog (PLAN-SIMPLE-MODE): "what do I have open" —
 * live positions (with Close) + any resting orders (with Cancel). Reuses
 * SimplePosition; reads nothing itself (data passed from the catalog's stream).
 */
export function SimplePositionsSidebar({
  positions,
  orders,
  walletAddress,
  connected,
}: {
  positions: Position[];
  orders: Order[];
  walletAddress?: string;
  connected: boolean;
}) {
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function cancel(o: Order) {
    if (!walletAddress) return;
    setBusyId(String(o.orderId));
    const tid = toast.loading('Cancelling order…');
    const res = await cancelOrder({ walletAddress, symbol: o.symbol, orderId: o.orderId });
    setBusyId(null);
    toast.update(tid, res.success ? 'success' : 'error', res.success ? 'Order cancelled' : res.error?.message ?? 'Cancel failed');
  }

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <section>
        <h2 className="mb-2 text-sm font-bold text-surface-100">Open Positions</h2>
        {!connected ? (
          <p className="text-xs text-surface-500">Connect your wallet to see your positions.</p>
        ) : positions.length === 0 ? (
          <p className="text-xs text-surface-500">No open positions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {positions.map((p) => (
              <SimplePosition key={p.symbol} pos={p} walletAddress={walletAddress} />
            ))}
          </div>
        )}
      </section>

      {connected && orders.length > 0 && (
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
