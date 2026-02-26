'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribe, addListener } from '@/lib/pacifica-ws';

const PACIFICA_API = 'https://api.pacifica.fi';

export interface Candle {
  t: number;  // start time ms
  T: number;  // end time ms
  s: string;  // symbol
  i: string;  // interval
  o: string;  // open
  h: string;  // high
  l: string;  // low
  c: string;  // close
  v: string;  // volume
  n: number;  // trades
}

interface UsePacificaCandlesOptions {
  symbol: string;
  interval: string;
  durationMs: number;
  enabled?: boolean;
}

async function fetchHistoricalCandles(
  symbol: string,
  interval: string,
  durationMs: number,
): Promise<Candle[]> {
  const endTime = Date.now();
  const startTime = endTime - durationMs;
  const url = `${PACIFICA_API}/api/v1/kline/mark?symbol=${symbol}&interval=${interval}&start_time=${startTime}&end_time=${endTime}`;
  const res = await fetch(url);
  const json = await res.json();
  if (!json.success || !json.data) return [];
  return json.data;
}

/**
 * Hook that fetches historical mark-price candles via REST,
 * then subscribes to real-time candle updates via Pacifica WebSocket.
 *
 * When a new candle arrives:
 *  - If its start time matches the last candle → update in place (live tick)
 *  - Otherwise → append as a new candle
 */
export function usePacificaCandles({
  symbol,
  interval,
  durationMs,
  enabled = true,
}: UsePacificaCandlesOptions) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep latest params in refs for the WS handler
  const symbolRef = useRef(symbol);
  const intervalRef = useRef(interval);
  symbolRef.current = symbol;
  intervalRef.current = interval;

  // Fetch historical data when params change
  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchHistoricalCandles(symbol, interval, durationMs)
      .then((data) => {
        if (!cancelled) setCandles(data);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load chart data');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval, durationMs, enabled]);

  // Handle incoming WS candle
  const handleWsCandle = useCallback((incoming: Candle) => {
    // Only process if it matches our current subscription
    if (incoming.s !== symbolRef.current || incoming.i !== intervalRef.current) return;

    setCandles((prev) => {
      if (prev.length === 0) return [incoming];

      const last = prev[prev.length - 1];

      // Same candle window → update last candle in place
      if (incoming.t === last.t) {
        const updated = [...prev];
        updated[updated.length - 1] = incoming;
        return updated;
      }

      // New candle window → append (and trim oldest to keep array bounded)
      if (incoming.t > last.t) {
        const updated = [...prev, incoming];
        // Keep max ~500 candles to prevent unbounded growth
        if (updated.length > 500) updated.shift();
        return updated;
      }

      return prev;
    });
  }, []);

  // Subscribe to Pacifica WS for live candle updates
  useEffect(() => {
    if (!enabled) return;

    const unsubscribe = subscribe({
      source: 'mark_price_candle',
      symbol,
      interval,
    });

    const removeListener = addListener((channel: string, data: unknown) => {
      if (channel === 'mark_price_candle') {
        handleWsCandle(data as Candle);
      }
    });

    return () => {
      removeListener();
      unsubscribe();
    };
  }, [symbol, interval, enabled, handleWsCandle]);

  return { candles, loading, error };
}
