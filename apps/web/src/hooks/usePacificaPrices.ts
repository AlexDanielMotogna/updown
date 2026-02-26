'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { subscribe, addListener } from '@/lib/pacifica-ws';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PacificaPriceData {
  symbol: string;
  funding: number;
  nextFunding: number;
  openInterest: number;
  volume24h: number;
  mark: number;
  oracle: number;
  yesterdayPrice: number;
  spreadPct: number;       // (mark - oracle) / oracle * 100
  priceChange24hPct: number; // (mark - yesterdayPrice) / yesterdayPrice * 100
  timestamp: number;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePacificaPrices(symbols: string[], enabled = true) {
  const [priceMap, setPriceMap] = useState<Record<string, PacificaPriceData>>({});
  const [loading, setLoading] = useState(true);
  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const handleMessage = useCallback((channel: string, data: unknown) => {
    if (channel !== 'prices') return;

    // Pacifica prices channel sends an array of all symbols
    const items = data as Record<string, unknown>[];
    if (!Array.isArray(items)) return;

    const updates: Record<string, PacificaPriceData> = {};

    for (const d of items) {
      const symbol = d.symbol as string;
      if (!symbolsRef.current.includes(symbol)) continue;

      const mark = Number(d.mark ?? 0);
      const oracle = Number(d.oracle ?? 0);
      const yesterdayPrice = Number(d.yesterday_price ?? 0);

      updates[symbol] = {
        symbol,
        funding: Number(d.funding ?? 0),
        nextFunding: Number(d.next_funding ?? 0),
        openInterest: Number(d.open_interest ?? 0),
        volume24h: Number(d.volume_24h ?? 0),
        mark,
        oracle,
        yesterdayPrice,
        spreadPct: oracle !== 0 ? ((mark - oracle) / oracle) * 100 : 0,
        priceChange24hPct: yesterdayPrice !== 0 ? ((mark - yesterdayPrice) / yesterdayPrice) * 100 : 0,
        timestamp: Number(d.timestamp ?? Date.now()),
      };
    }

    if (Object.keys(updates).length > 0) {
      setPriceMap((prev) => ({ ...prev, ...updates }));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled || symbols.length === 0) return;

    // prices channel is a global broadcast — single subscription, no symbol param
    const unsub = subscribe({ source: 'prices' });
    const removeListener = addListener(handleMessage);

    // Stop showing loading after 5s even if no data arrives
    const timeout = setTimeout(() => setLoading(false), 5000);

    return () => {
      clearTimeout(timeout);
      removeListener();
      unsub();
    };
  }, [symbols.join(','), enabled, handleMessage]);

  const getPriceData = useCallback(
    (symbol: string): PacificaPriceData | null => priceMap[symbol] ?? null,
    [priceMap],
  );

  return { getPriceData, loading };
}
