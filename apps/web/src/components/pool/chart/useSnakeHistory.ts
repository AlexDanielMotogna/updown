'use client';

/**
 * Rolling per-tick history for the snake line chart.
 *
 * Responsibilities, in one place:
 *   1. Hydrate from sessionStorage on mount (asset-scoped key) so a refresh
 *      doesn't blank the chart. Backfills missing left-side history from
 *      candle interpolation when the stored buffer is shorter than the
 *      current window (e.g. the user came back after a few minutes away).
 *   2. Push the latest livePrice into the buffer every SNAKE_TICK_MS, prune
 *      anything older than SNAKE_WINDOW_MS. The interval is mounted once
 *      and reads livePrice through a ref, so it can't get torn down on
 *      every WS tick (that bug used to leave the buffer mostly empty).
 *   3. Persist back to sessionStorage at ≤1 Hz to keep the refresh path
 *      warm without serializing 1200 entries 10 times per second.
 *
 * Returns the current history array and a render-clock state that ticks at
 * the same cadence so the chart can re-render between pushes.
 */

import { useEffect, useRef, useState } from 'react';
import type { Candle } from '@/hooks';
import { SNAKE_TICK_MS, SNAKE_WINDOW_MS } from './constants';

export interface SnakeTick {
  /** ms since epoch */
  t: number;
  /** price at this tick */
  p: number;
}

/** Pull the asset's last snake buffer from sessionStorage and filter to the
 *  current visible window. Returns null when the slot is empty or stale, so
 *  the caller can fall through to candle seeding. */
export function loadSnakeFromStorage(key: string | null): SnakeTick[] | null {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const stored = JSON.parse(raw) as SnakeTick[];
    const cutoff = Date.now() - SNAKE_WINDOW_MS;
    const fresh = stored.filter((e) => e.t >= cutoff);
    return fresh.length > 0 ? fresh : null;
  } catch {
    return null;
  }
}

/** Synthesize a full-window history from 1-minute candle closes:
 *  linearly interpolate adjacent pairs at 1s resolution, then hold the
 *  last close as a flat tail up to "now". Lets the chart paint fully
 *  populated on the very first render. */
export function seedSnakeFromCandles(candles: Candle[]): SnakeTick[] {
  if (candles.length === 0) return [];
  const parsed = candles.map((c) => ({ t: c.t, c: parseFloat(c.c) }));
  const STEP = 1000;
  const ts = Date.now();
  const cutoff = ts - SNAKE_WINDOW_MS;
  const synthetic: SnakeTick[] = [];
  for (let i = 1; i < parsed.length; i++) {
    const a = parsed[i - 1];
    const b = parsed[i];
    if (b.t < cutoff) continue;
    const start = Math.max(a.t, cutoff);
    for (let t = start; t < b.t; t += STEP) {
      const ratio = (t - a.t) / (b.t - a.t);
      synthetic.push({ t, p: a.c + (b.c - a.c) * ratio });
    }
  }
  const last = parsed[parsed.length - 1];
  if (last.t >= cutoff) synthetic.push({ t: last.t, p: last.c });
  for (let t = last.t + STEP; t <= ts; t += STEP) {
    synthetic.push({ t, p: last.c });
  }
  return synthetic;
}

interface UseSnakeHistoryArgs {
  asset: string | undefined;
  candles: Candle[];
  livePrice: number | null | undefined;
}

interface UseSnakeHistoryResult {
  history: SnakeTick[];
  /** Wall-clock state that re-ticks at SNAKE_TICK_MS so the chart can
   *  recompute its X-axis between pushes. */
  now: number;
}

export function useSnakeHistory({ asset, candles, livePrice }: UseSnakeHistoryArgs): UseSnakeHistoryResult {
  const storageKey = asset ? `snake-history:${asset}` : null;

  // Buffer is seeded SYNCHRONOUSLY in useState's lazy initializer so the
  // very first paint already has the full window. Priority:
  //   1) sessionStorage (refresh path)
  //   2) interpolated candle history (first-visit path)
  // Plus a left-edge backfill from candles when stored history is short.
  const [history, setHistory] = useState<SnakeTick[]>(() => {
    const stored = loadSnakeFromStorage(storageKey);
    if (stored && stored.length > 0) {
      const windowStart = Date.now() - SNAKE_WINDOW_MS;
      const gap = stored[0].t - windowStart;
      if (gap > 20_000) {
        const leftTail = seedSnakeFromCandles(candles).filter((e) => e.t < stored[0].t);
        return [...leftTail, ...stored];
      }
      return stored;
    }
    return seedSnakeFromCandles(candles);
  });

  // Safety net for the (rare) case where candles arrive after mount - the
  // wrapper only renders the snake when candles.length > 0, so usually a no-op.
  useEffect(() => {
    if (candles.length === 0) return;
    setHistory((prev) => (prev.length > 0 ? prev : seedSnakeFromCandles(candles)));
  }, [candles]);

  // Push livePrice into the buffer every SNAKE_TICK_MS. The interval is
  // mounted ONCE and reads livePrice through a ref. Putting livePrice in
  // the effect deps tore the timer down and rebuilt it on every WS tick,
  // so 100ms timers almost never completed and the buffer grew far too
  // slowly to reach the left edge.
  const livePriceRef = useRef(livePrice);
  useEffect(() => { livePriceRef.current = livePrice; }, [livePrice]);
  useEffect(() => {
    const iv = setInterval(() => {
      const lp = livePriceRef.current;
      if (lp == null) return;
      const ts = Date.now();
      setHistory((h) => {
        const cutoff = ts - SNAKE_WINDOW_MS;
        const next = [...h.filter((e) => e.t >= cutoff), { t: ts, p: lp }];
        return next;
      });
    }, SNAKE_TICK_MS);
    return () => clearInterval(iv);
  }, []);

  // Throttled persistence: writes are sync and a 1200-entry JSON shouldn't
  // be serialized 10× a second. Once per second survives a refresh; the
  // worst case is losing ≤1s of ticks.
  const lastWriteRef = useRef(0);
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;
    const ts = Date.now();
    if (ts - lastWriteRef.current < 1000) return;
    lastWriteRef.current = ts;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(history));
    } catch {
      // Quota exceeded - silently drop; the in-memory buffer is unaffected.
    }
  }, [history, storageKey]);

  // Render clock: drives the group's translateX so the chart slides between
  // pushes. Updated at the same cadence as the buffer push.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), SNAKE_TICK_MS);
    return () => clearInterval(iv);
  }, []);

  return { history, now };
}
