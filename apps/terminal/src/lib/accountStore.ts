'use client';

import { useSyncExternalStore } from 'react';
import { fetchSpotSummary, fetchUserFees } from './hlBalances';

/**
 * Shared HyperLiquid account-state store. The navbar chip, the account overview and
 * the order panel all need the same spot value / available USDC / fee rates. Instead
 * of each polling spotClearinghouseState + spotMetaAndAssetCtxs + userFees on its own
 * (4-5 overlapping loops every 10-15s), they subscribe here: ONE poll per account,
 * ref-counted (starts on first subscriber, stops on last). Fees poll slowly (they
 * barely change); the summary refreshes on `updown:spot-traded` too.
 */
export interface AccountSnapshot {
  loaded: boolean;
  spotValue: number | null;
  usdcTotal: number | null;
  usdcAvailable: number | null;
  fees: { maker: number; taker: number; spotMaker: number; spotTaker: number } | null;
}

const EMPTY: AccountSnapshot = { loaded: false, spotValue: null, usdcTotal: null, usdcAvailable: null, fees: null };

const SUMMARY_MS = 10_000;
const FEES_MS = 60_000;

class Store {
  snap: AccountSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private refs = 0;
  private summaryTimer: ReturnType<typeof setInterval> | null = null;
  private feesTimer: ReturnType<typeof setInterval> | null = null;
  private readonly onTraded = () => { void this.loadSummary(); };

  constructor(private readonly user: string) {}

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    if (this.refs++ === 0) this.start();
    return () => {
      this.listeners.delete(cb);
      if (--this.refs === 0) this.stop();
    };
  }

  private emit() { for (const l of this.listeners) l(); }
  private set(patch: Partial<AccountSnapshot>) { this.snap = { ...this.snap, ...patch }; this.emit(); }

  private async loadSummary() {
    const s = await fetchSpotSummary(this.user);
    if (s) this.set({ spotValue: s.value, usdcTotal: s.usdcTotal, usdcAvailable: s.usdcAvailable, loaded: true });
    else this.set({ loaded: true });
  }
  private async loadFees() {
    const f = await fetchUserFees(this.user);
    if (f) this.set({ fees: f });
  }

  private start() {
    void this.loadSummary();
    void this.loadFees();
    this.summaryTimer = setInterval(() => { void this.loadSummary(); }, SUMMARY_MS);
    this.feesTimer = setInterval(() => { void this.loadFees(); }, FEES_MS);
    if (typeof window !== 'undefined') window.addEventListener('updown:spot-traded', this.onTraded);
  }
  private stop() {
    if (this.summaryTimer) clearInterval(this.summaryTimer);
    if (this.feesTimer) clearInterval(this.feesTimer);
    this.summaryTimer = this.feesTimer = null;
    if (typeof window !== 'undefined') window.removeEventListener('updown:spot-traded', this.onTraded);
    this.snap = EMPTY; // reset so a later remount refetches fresh
  }
}

const stores = new Map<string, Store>();
function store(user: string): Store {
  let s = stores.get(user);
  if (!s) { s = new Store(user); stores.set(user, s); }
  return s;
}

/** Live shared account snapshot for an EVM address (null/undefined → empty). */
export function useAccountState(user?: string): AccountSnapshot {
  return useSyncExternalStore(
    (cb) => (user ? store(user).subscribe(cb) : () => {}),
    () => (user ? store(user).snap : EMPTY),
    () => EMPTY,
  );
}
