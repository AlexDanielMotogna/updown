'use client';

import { useSyncExternalStore } from 'react';

/** Simple = Kalshi-style beginner UI (default); Pro = the full HL terminal. */
export type TradeMode = 'simple' | 'pro';

const KEY = 'updown-trade-mode';
const listeners = new Set<() => void>();

function read(): TradeMode {
  if (typeof window === 'undefined') return 'simple';
  return window.localStorage.getItem(KEY) === 'pro' ? 'pro' : 'simple';
}

/** Set the mode and notify every `useTradeMode` consumer (and other tabs via the
 *  native storage event). */
export function setTradeMode(mode: TradeMode): void {
  if (typeof window !== 'undefined') window.localStorage.setItem(KEY, mode);
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  // Cross-tab sync.
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) cb(); };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

/**
 * Read the persisted trade mode reactively. Default 'simple' (PLAN-SIMPLE-MODE §3,
 * §8.2). The server snapshot is always 'simple' to match the default; components
 * that switch shells on mode should render after mount to avoid a hydration flash
 * when a returning user has 'pro' stored.
 */
export function useTradeMode(): [TradeMode, (m: TradeMode) => void] {
  const mode = useSyncExternalStore<TradeMode>(subscribe, read, () => 'simple');
  return [mode, setTradeMode];
}
