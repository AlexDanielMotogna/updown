import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, connectSocket } from '@/lib/socket';
import type { ApiResponse, Pool } from '@/lib/api';

// The list query caches the Markets home / right rail read from.
const LIST_KEYS: ReadonlyArray<readonly string[]> = [['markets-home'], ['trending-pools'], ['rail-active']];

/**
 * Keeps the Markets home / trending / rail query caches live via WebSocket:
 * removes pools the moment they end (pool:status → RESOLVED/CLAIMABLE) and pulls
 * in freshly-created pools (pools:new). Per-card total/odds updates are handled
 * inside MarketCard itself. Frontend-only — consumes existing server events.
 */
export function useMarketsLiveSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sock = getSocket();
    connectSocket();

    const onStatus = (d: { id: string; status: string }) => {
      if (!d?.id) return;
      const ended = d.status === 'RESOLVED' || d.status === 'CLAIMABLE';
      for (const key of LIST_KEYS) {
        queryClient.setQueryData<ApiResponse<Pool[]>>(key as string[], (old) => {
          if (!old?.data) return old;
          const data = ended
            ? old.data.filter(p => p.id !== d.id)
            : old.data.map(p => (p.id === d.id ? { ...p, status: d.status as Pool['status'] } : p));
          return { ...old, data };
        });
      }
    };

    const onNew = () => {
      for (const key of LIST_KEYS) queryClient.invalidateQueries({ queryKey: key as string[] });
    };

    sock.on('pool:status', onStatus);
    sock.on('pools:new', onNew);
    return () => {
      sock.off('pool:status', onStatus);
      sock.off('pools:new', onNew);
    };
  }, [queryClient]);
}
