import { useEffect, useRef } from 'react';
import { getSocket, connectSocket } from '@/lib/socket';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';
import { useBets } from './useBets';

/**
 * Subscribe to WebSocket events and push notifications to the store.
 * Should be mounted once at the provider level.
 */
export function useNotifications() {
  const { push, addUserPoolId, setUserPoolIds, userPoolIds } = useNotificationStore();
  const betsQuery = useBets({ limit: 50 });
  const initializedRef = useRef(false);

  // Seed userPoolIds from existing bets on mount / when bets data changes
  useEffect(() => {
    const bets = betsQuery.data?.data;
    if (!bets || bets.length === 0) return;

    const ids = bets.map((b) => b.pool.id);
    setUserPoolIds(ids);
    initializedRef.current = true;
  }, [betsQuery.data, setUserPoolIds]);

  // Subscribe to WS events
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    // Store ref for accessing latest userPoolIds inside listeners
    const getPoolIds = () => useNotificationStore.getState().userPoolIds;

    const onPoolStatus = (data: { id: string; status: string; winner?: 'UP' | 'DOWN' | null; asset?: string; interval?: string }) => {
      const poolIds = getPoolIds();
      if (!poolIds.has(data.id)) return;

      // Find the user's bet for this pool from the query cache
      const bets = betsQuery.data?.data;
      const userBet = bets?.find((b) => b.pool.id === data.id);
      if (!userBet) return;

      const ctx = {
        poolId: data.id,
        asset: data.asset ?? userBet.pool.asset,
        interval: data.interval ?? '',
        winner: data.winner ?? null,
      };

      if (data.status === 'RESOLVED' && data.winner) {
        if (userBet.side === data.winner) {
          push(buildNotification('POOL_WON', ctx));
        } else {
          push(buildNotification('POOL_LOST', ctx));
        }
      }

      if (data.status === 'CLAIMABLE' && data.winner && userBet.side === data.winner) {
        push(buildNotification('POOL_CLAIMABLE', ctx));
      }
    };

    const onRefund = (payload: { poolId?: string; amount?: string; message?: string }) => {
      push(
        buildNotification('REFUND_RECEIVED', {
          poolId: payload.poolId,
          message: payload.message,
        }),
      );
    };

    socket.on('pool:status', onPoolStatus);
    socket.on('wallet:refund', onRefund);

    return () => {
      socket.off('pool:status', onPoolStatus);
      socket.off('wallet:refund', onRefund);
    };
  // betsQuery.data is intentionally in deps so the listener closure
  // picks up the latest bets for win/loss determination
  }, [push, addUserPoolId, betsQuery.data]);
}
