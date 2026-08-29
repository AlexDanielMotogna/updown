'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { fetchSpotSummary, fetchUserFees, fetchAbstraction, sharesOneBalance, type AbstractionMode } from './hlBalances';
import { unifyAccount } from './api';
import { pollWhileVisible } from './poll';

/** Accounts we already asked the server to migrate, so a failure is not retried
 *  on every slow poll. Module-level: survives store teardown on remount. */
const unifyAttempted = new Set<string>();

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
  /** Whether spot and perps share one balance. Decides how account value totals. */
  abstraction: AbstractionMode | null;
}

const EMPTY: AccountSnapshot = { loaded: false, spotValue: null, usdcTotal: null, usdcAvailable: null, fees: null, abstraction: null };

const SUMMARY_MS = 10_000;
const FEES_MS = 60_000;

class Store {
  snap: AccountSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private refs = 0;
  private stopSummary: (() => void) | null = null;
  private stopFees: (() => void) | null = null;
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
  /** Rides the slow loop: the mode only changes when the account is migrated. */
  private async loadAbstraction() {
    const m = await fetchAbstraction(this.user);
    if (!m) return;
    this.set({ abstraction: m });
    if (!sharesOneBalance(m)) void this.migrateToUnified();
  }

  /**
   * HL creates accounts with spot and perps SPLIT, and this UI deliberately has
   * no Spot->Perps transfer. An account funded on the perps side is therefore
   * stuck: the balance is not available to trade, so the user cannot act, so the
   * server never builds a signer, so the existing ensureUnified backfill (which
   * only runs on an order/cancel/leverage) never fires. Detecting the split here
   * and asking the server to migrate is what breaks that loop.
   *
   * Agent-signed server-side, so no wallet popup. Once per account per page
   * load: a failure (no active connection yet, HL hiccup) must not turn the slow
   * poll into a retry storm.
   */
  private async migrateToUnified() {
    if (unifyAttempted.has(this.user)) return;
    unifyAttempted.add(this.user);
    try {
      const r = await unifyAccount();
      if (r.success && r.data?.changed) {
        // Balances move clearinghouse, so re-read rather than wait for the poll.
        await Promise.all([this.loadSummary(), (async () => {
          const m = await fetchAbstraction(this.user);
          if (m) this.set({ abstraction: m });
        })()]);
      }
    } catch { /* stays split; the value shown just falls back to the split total */ }
  }

  private start() {
    void this.loadSummary();
    void this.loadFees();
    void this.loadAbstraction();
    // Visibility-aware: stop polling HL while the tab is hidden, refresh on return.
    this.stopSummary = pollWhileVisible(() => { void this.loadSummary(); }, SUMMARY_MS);
    this.stopFees = pollWhileVisible(() => { void this.loadFees(); void this.loadAbstraction(); }, FEES_MS);
    if (typeof window !== 'undefined') window.addEventListener('updown:spot-traded', this.onTraded);
  }
  private stop() {
    this.stopSummary?.(); this.stopFees?.();
    this.stopSummary = this.stopFees = null;
    if (typeof window !== 'undefined') window.removeEventListener('updown:spot-traded', this.onTraded);
    // Keep the last snapshot cached — a remount gets the value instantly and a fresh
    // poll restarts. (Don't reset to EMPTY: with React's brief unsub/resub that would
    // flash + refetch needlessly.)
  }
}

const stores = new Map<string, Store>();
function store(user: string): Store {
  let s = stores.get(user);
  if (!s) { s = new Store(user); stores.set(user, s); }
  return s;
}

/** Live shared account snapshot for an EVM address (null/undefined → empty).
 * subscribe/getSnapshot are memoized per `user` — a fresh inline subscribe would make
 * useSyncExternalStore re-subscribe every render, thrashing the store's ref count
 * (start→fetch on each render) and hammering HL with 429s. */
export function useAccountState(user?: string): AccountSnapshot {
  const subscribe = useCallback(
    (cb: () => void) => (user ? store(user).subscribe(cb) : () => {}),
    [user],
  );
  const getSnapshot = useCallback(() => (user ? store(user).snap : EMPTY), [user]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
