'use client';

import { useEffect, useRef } from 'react';
import { getSocket, connectSocket, subscribePool, unsubscribePool } from '@/lib/socket';

/** Payload of the `pool:updated` socket event. */
export interface LivePoolTotals {
  id: string;
  totalUp: string;
  totalDown: string;
  totalDraw?: string;
  weightedUp?: string;
  weightedDown?: string;
  weightedDraw?: string;
}

/**
 * Subscribe to live `pool:updated` events for a set of pools and call
 * `onUpdate` with the fresh totals as bets land. Handles the socket lifecycle
 * (connect + per-pool subscribe/unsubscribe); the caller decides what to do
 * with each update - patch a react-query cache, set local state, etc.
 *
 * Reusable across any surface that renders live pool numbers (profile
 * positions, market cards, match page, …). `onUpdate` is held in a ref so it
 * can close over fresh state without re-subscribing every render.
 */
export function useLivePoolTotals(
  poolIds: string[],
  onUpdate: (data: LivePoolTotals) => void,
): void {
  const cb = useRef(onUpdate);
  cb.current = onUpdate;

  // Stable dependency: only re-subscribe when the SET of pools changes.
  const key = [...poolIds].sort().join(',');

  useEffect(() => {
    if (poolIds.length === 0) return;
    const sock = getSocket();
    connectSocket();
    poolIds.forEach(subscribePool);

    const handler = (data: LivePoolTotals) => {
      if (data?.id) cb.current(data);
    };
    sock.on('pool:updated', handler);

    return () => {
      sock.off('pool:updated', handler);
      poolIds.forEach(unsubscribePool);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
