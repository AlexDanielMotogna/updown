'use client';

import { useEffect, useState, useRef } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';

/**
 * Subscribe to the `pool:bet-placed` socket channel and emit a short-lived
 * "flash" object every time a bet lands on the given pool. The card / chart
 * panel renders a pill, fades it out after FLASH_LIFETIME_MS, and then
 * drops it. Multiple bets in flight stack — each gets its own entry with
 * a unique key so the framer-motion AnimatePresence can transition them
 * out independently.
 *
 * Why we hold an array and not a single value: a pool can take two deposits
 * in the same render tick (rare, but cheap to handle). Stacking is also
 * what the user picked over coalescing.
 */
export interface BetFlash {
  /** Unique key for AnimatePresence — server timestamp + side avoids
   *  clashes when the same wallet hedges. */
  key: string;
  side: 'UP' | 'DOWN' | 'DRAW';
  /** USDC raw amount (6 decimals). The component divides by USDC_DIVISOR. */
  amount: bigint;
  at: number;
}

const FLASH_LIFETIME_MS = 2000;
// Drop bets older than the lifetime if they land late (e.g. ws reconnect
// replayed an old payload). Keeps the pill from blinking on stale data.
const STALE_DROP_MS = 5000;

export function useBetFlash(poolId: string | undefined): BetFlash[] {
  const [flashes, setFlashes] = useState<BetFlash[]>([]);
  // Track timers so unmount can cancel them — otherwise React 18 strict
  // mode double-fires effects and we get phantom pills on remount.
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!poolId) return;
    const socket = getSocket();
    connectSocket();

    const onBet = (data: { poolId: string; side: 'UP' | 'DOWN' | 'DRAW'; amount: string; at: number }) => {
      if (data.poolId !== poolId) return;
      if (Date.now() - data.at > STALE_DROP_MS) return;
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
