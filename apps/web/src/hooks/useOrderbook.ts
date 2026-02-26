'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribe, addListener } from '@/lib/pacifica-ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrderbookLevel {
  price: number;
  amount: number;
  orderCount: number;
}

export interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spread: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useOrderbook(symbol: string, enabled = true) {
  const [data, setData] = useState<OrderbookData | null>(null);
  const [loading, setLoading] = useState(true);
  const symbolRef = useRef(symbol);
  symbolRef.current = symbol;

  const handleMessage = useCallback((channel: string, raw: unknown) => {
    if (channel !== 'book') return;

    const d = raw as Record<string, unknown>;
    if (d.symbol !== symbolRef.current) return;

    const parseLevels = (arr: unknown): OrderbookLevel[] => {
      if (!Array.isArray(arr)) return [];
      return arr.slice(0, 10).map((level: unknown) => {
        const l = level as [string | number, string | number, string | number];
        return {
          price: Number(l[0]),
          amount: Number(l[1]),
          orderCount: Number(l[2] ?? 0),
        };
      });
    };

    const bids = parseLevels(d.bids);
    const asks = parseLevels(d.asks);

    const bestBid = bids[0]?.price ?? 0;
    const bestAsk = asks[0]?.price ?? 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;

    setData({ bids, asks, spread });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!enabled || !symbol) return;

    const unsub = subscribe({ source: 'book', symbol, agg_level: '100' });
    const removeListener = addListener(handleMessage);

    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(timeout);
      removeListener();
      unsub();
    };
  }, [symbol, enabled, handleMessage]);

  return { data, loading };
}
