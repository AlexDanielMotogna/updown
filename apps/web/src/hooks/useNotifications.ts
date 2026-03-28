import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, connectSocket } from '@/lib/socket';
import { useNotificationStore } from '@/stores/notificationStore';
import { buildNotification } from '@/lib/notifications';
import { showRewardPopup } from '@/components/RewardPopup';
import { fireWinConfetti } from '@/lib/confetti';
import { fetchNotifications } from '@/lib/api';
import { useBets } from './useBets';
import { useWalletBridge } from './useWalletBridge';

/**
 * Subscribe to WebSocket events and push notifications to the store.
 * Should be mounted once at the provider level.
 */
export function useNotifications() {
  const { push, addUserPoolId, setUserPoolIds, userPoolIds } = useNotificationStore();
  const { walletAddress } = useWalletBridge();
  const betsQuery = useBets({ limit: 50 });
  const queryClient = useQueryClient();
  const initializedRef = useRef(false);
  const prevWalletRef = useRef<string | null | undefined>(undefined);

  // When wallet changes: clear old state, then load from DB
  useEffect(() => {
    const prev = prevWalletRef.current;
    prevWalletRef.current = walletAddress;

    // Clear when switching wallets (not on first mount)
    if (prev && prev !== walletAddress) {
      useNotificationStore.getState().clear();
      initializedRef.current = false;
    }

    // Load from DB when wallet is available
    if (!walletAddress) return;

    fetchNotifications(walletAddress).then(res => {
      if (!res.success || !res.data) return;
      const store = useNotificationStore.getState();
      const existingIds = new Set(store.notifications.map(n => n.id));

      for (const dbNotif of res.data) {
        if (existingIds.has(dbNotif.id)) continue;
        store.push({
          type: dbNotif.type as any,
          title: dbNotif.title,
          message: dbNotif.message,
          severity: dbNotif.severity as any,
          poolId: dbNotif.poolId ?? undefined,
          poolType: dbNotif.poolType ?? undefined,
          autoHideDuration: 0,
        }, dbNotif.id, dbNotif.read);
      }
    }).catch(() => {});
  }, [walletAddress]);

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
        poolType: userBet.pool.poolType,
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

    const onRefund = (payload: { walletAddress?: string; poolId?: string; amount?: string; message?: string }) => {
      // BUG-04: Only show refund if it's for the connected wallet
      if (!walletAddress || payload.walletAddress !== walletAddress) return;

      push(
        buildNotification('REFUND_RECEIVED', {
          poolId: payload.poolId,
          message: payload.message,
        }),
      );
    };

    const onUserReward = (data: {
      walletAddress: string;
      xp: number;
      coins: number;
      level: number;
      levelUp: boolean;
      totalXp: number;
      reason?: string;
    }) => {
      // Only handle events for the connected wallet
      if (!walletAddress || data.walletAddress !== walletAddress) return;

      // Show floating popup
      showRewardPopup({ xp: data.xp, coins: data.coins, levelUp: data.levelUp, level: data.level });

      // Push UP Coins notification
      if (data.coins > 0) {
        push(buildNotification('COINS_EARNED', { coins: data.coins, reason: data.reason }));
      }

      // Push XP notification for referral
      if (data.xp > 0 && data.reason === 'referral') {
        push(buildNotification('XP_EARNED', { xp: data.xp, totalXp: data.totalXp, reason: data.reason }));
      }

      // Push level-up notification (fires confetti via NotificationToasts)
      if (data.levelUp) {
        push(buildNotification('LEVEL_UP', { level: data.level }));
      }

      // Invalidate profile query so Header/BetForm update
      queryClient.invalidateQueries({ queryKey: ['userProfile'] });
    };

    const onTournamentMatchResult = (data: {
      tournamentId: string;
      tournamentName: string;
      matchId: string;
      round: number;
      winnerWallet: string;
      loserWallet: string | null;
      asset: string;
      completed?: boolean;
      prizePool?: string;
    }) => {
      if (!walletAddress) return;
      const isWinner = data.winnerWallet === walletAddress;
      const isLoser = data.loserWallet === walletAddress;
      if (!isWinner && !isLoser) return;

      if (data.completed && isWinner) {
        // Tournament champion!
        push(buildNotification('TOURNAMENT_WON', {
          tournamentName: data.tournamentName,
          prizePool: (Number(data.prizePool || 0) * 0.95 / 1_000_000).toFixed(2),
        }));
        fireWinConfetti();
        setTimeout(() => fireWinConfetti(), 500);
      } else if (isWinner) {
        push(buildNotification('TOURNAMENT_MATCH_WON', {
          tournamentName: data.tournamentName,
          round: data.round,
        }));
        fireWinConfetti();
      } else if (isLoser) {
        push(buildNotification('TOURNAMENT_MATCH_LOST', {
          tournamentName: data.tournamentName,
          round: data.round,
        }));
      }
    };

    socket.on('pool:status', onPoolStatus);
    socket.on('wallet:refund', onRefund);
    socket.on('user:reward', onUserReward);
    socket.on('tournament:match:result', onTournamentMatchResult);

    return () => {
      socket.off('pool:status', onPoolStatus);
      socket.off('wallet:refund', onRefund);
      socket.off('user:reward', onUserReward);
      socket.off('tournament:match:result', onTournamentMatchResult);
    };
  // betsQuery.data is intentionally in deps so the listener closure
  // picks up the latest bets for win/loss determination
  }, [push, addUserPoolId, betsQuery.data, walletAddress, queryClient]);
}
