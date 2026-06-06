'use client';

import { useEffect, useState, useRef } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';

/**
 * Subscribe to the `pool:bet-placed` socket channel and emit a short-lived
 * "flash" object every time a bet lands on the given pool. The card / chart
 * panel renders a pill, fades it out after FLASH_LIFETIME_MS, and then
 * drops it. Multiple bets in flight stack - each gets its own entry with
 * a unique key so the framer-motion AnimatePresence can transition them
 * out independently.
 *
 * Why we hold an array and not a single value: a pool can take two deposits
 * in the same render tick (rare, but cheap to handle). Stacking is also
 * what the user picked over coalescing.
 */
export interface BetFlash {
  /** Unique key for AnimatePresence - server timestamp + side avoids
   *  clashes when the same wallet hedges. */
  key: string;
  side: 'UP' | 'DOWN' | 'DRAW';
  /** USDC raw amount (6 decimals). The component divides by USDC_DIVISOR. */
  amount: bigint;
  at: number;
}

const FLASH_LIFETIME_MS = 2000;
// Drop bets older than the lifetime if they land late (e.g. ws reconnect
// replayed an old payload). Bumped from 5s to 30s because the prod
// debug session on 2026-06-04 revealed every live event was being
// silently rejected - the client's clock was running ~7-12s behind
// Railway's NTP-synced clock, so Date.now() - data.at consistently
// exceeded the old 5s window. 30s is generous enough to absorb any
// reasonable clock skew without showing genuinely-replayed events on
// a 30s+ socket reconnect.
const STALE_DROP_MS = 30_000;
// Console-side breadcrumb so the operator can see in DevTools whether
// the socket is delivering events at all and (if so) why a given event
// gets dropped. Cheap, off in production builds when NEXT_PUBLIC_
// DEBUG_BET_FLASH isn't set.
const DEBUG = typeof window !== 'undefined' && process.env.NEXT_PUBLIC_DEBUG_BET_FLASH === '1';

export function useBetFlash(poolId: string | undefined): BetFlash[] {
  const [flashes, setFlashes] = useState<BetFlash[]>([]);
  // Track timers so unmount can cancel them - otherwise React 18 strict
  // mode double-fires effects and we get phantom pills on remount.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!poolId) return;
    const socket = getSocket();
    connectSocket();

    const onBet = (data: { poolId: string; side: 'UP' | 'DOWN' | 'DRAW'; amount: string; at: number }) => {
      const ageMs = Date.now() - data.at;
      if (DEBUG) {
        // eslint-disable-next-line no-console
        console.log('[BetFlash] event', { incoming: data.poolId, watching: poolId, side: data.side, amount: data.amount, ageMs });
      }
      if (data.poolId !== poolId) return;
      if (ageMs > STALE_DROP_MS) {
        if (DEBUG) {
          // eslint-disable-next-line no-console
          console.warn('[BetFlash] dropped stale event', { ageMs, limit: STALE_DROP_MS });
        }
        return;
      }
      const key = `${data.at}-${data.side}-${Math.random().toString(36).slice(2, 6)}`;
      const flash: BetFlash = {
        key,
        side: data.side,
        amount: BigInt(data.amount),
        at: data.at,
      };
      setFlashes(prev => [...prev, flash]);
      const tid = setTimeout(() => {
        setFlashes(prev => prev.filter(f => f.key !== key));
        timersRef.current.delete(key);
      }, FLASH_LIFETIME_MS);
      timersRef.current.set(key, tid);
    };

    socket.on('pool:bet-placed', onBet);
    return () => {
      socket.off('pool:bet-placed', onBet);
      // Cancel any in-flight timers so they don't fire setState after unmount
      const timers = timersRef.current;
      timers.forEach(tid => clearTimeout(tid));
      timers.clear();
    };
  }, [poolId]);

  return flashes;
}
