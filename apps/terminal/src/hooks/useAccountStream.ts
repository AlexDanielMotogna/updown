'use client';

import { useEffect, useState } from 'react';
import type { Account, Order, Position, TradeHistoryItem } from 'exchange-core';
import { getStream } from '@/lib/stream';
import { dbg } from '@/lib/debug';

export interface AccountStream {
  account: Account | null;
  positions: Position[];
  orders: Order[];
  fills: TradeHistoryItem[];
  /** True once the first WS event for this account has arrived. */
  ready: boolean;
}

/**
 * Live account state over the HyperLiquid WS (clearinghouseState + openOrders +
 * userFills), normalized. Replaces REST polling for the realtime-sensitive data
 * (equity, positions, PnL). Multiple callers share one underlying subscription
 * (ref-counted in the WS connection), so it's cheap to use in several components.
 */
export function useAccountStream(evmAddress?: string): AccountStream {
  const [account, setAccount] = useState<Account | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [fills, setFills] = useState<TradeHistoryItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setAccount(null);
    setPositions([]);
    setOrders([]);
    setFills([]);
    setReady(false);
    dbg.wsReady(false);
    if (!evmAddress) return;

    const unsub = getStream().subscribeAccount(evmAddress, (e) => {
      setReady(true);
      dbg.wsReady(true);
      dbg.bumpWs(e.kind);
      switch (e.kind) {
        case 'account':
          setAccount(e.account);
          break;
        case 'positions':
          setPositions(e.positions);
          break;
        case 'orders':
          setOrders(e.orders);
          break;
        case 'fill':
          setFills((cur) =>
            cur.some((f) => f.historyId === e.fill.historyId)
              ? cur
              : [e.fill, ...cur].slice(0, 200)
          );
          break;
      }
    });
    return unsub;
  }, [evmAddress]);

  return { account, positions, orders, fills, ready };
}
