import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSocket, connectSocket } from '@/lib/socket';
import { useNotificationStore, type NotificationType, type NotificationSeverity } from '@/stores/notificationStore';
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
          type: dbNotif.type as NotificationType,
          title: dbNotif.title,
          message: dbNotif.message,
          severity: dbNotif.severity as NotificationSeverity,
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

      // A wallet may hold positions on multiple sides of the same pool (hedge),
      // so evaluate ALL its bets for this pool, not just the first.
      const bets = betsQuery.data?.data;
      const userBets = bets?.filter((b) => b.pool.id === data.id) ?? [];
      if (userBets.length === 0) return;

      const userBet = userBets[0]; // pool-level fields are identical across rows
      const won = !!data.winner && userBets.some((b) => b.side === data.winner);

      // Since a wallet can hold both sides, "won/lost" isn't meaningful per
      // pool - report the NET result. Net = time-weighted payout of the bets on
      // the winning side (mirrors the on-chain claim) minus total stake.
      const p = userBet.pool;
      const totalStake = userBets.reduce((a, b) => a + Number(b.amount), 0);
      const totalUp = Number(p.totalUp ?? 0), totalDown = Number(p.totalDown ?? 0), totalDraw = Number(p.totalDraw ?? 0);
      const totalPool = totalUp + totalDown + totalDraw;
      const sideStake = (s: string) => (s === 'UP' ? totalUp : s === 'DOWN' ? totalDown : totalDraw);
      const sideWeight = (s: string) => (s === 'UP' ? Number(p.weightedUp ?? 0) : s === 'DOWN' ? Number(p.weightedDown ?? 0) : Number(p.weightedDraw ?? 0));
      let payout = 0;
      for (const b of userBets) {
        if (b.side !== data.winner) continue;
        const stake = Number(b.amount);
        const st = sideStake(b.side);
        if (st <= 0) { payout += stake; continue; }
        const sw = sideWeight(b.side);
        const myW = b.weight != null ? Number(b.weight) : null;
        const gross = myW != null && sw > 0 ? stake + (myW / sw) * (totalPool - st) : (stake / st) * totalPool;
        payout += gross * 0.95;
      }
      const net = payout - totalStake;
      const netStr = `${net >= 0 ? '+' : '-'}$${(Math.abs(net) / 1_000_000).toFixed(2)}`;

      const ctx = {
        poolId: data.id,
        poolType: userBet.pool.poolType,
        asset: data.asset ?? userBet.pool.asset,
        interval: data.interval ?? '',
        winner: data.winner ?? null,
        net: netStr,
      };

      // One net notification per pool - no contradictory won+lost pair for hedgers.
      if (data.status === 'RESOLVED' && data.winner) {
        push(buildNotification(net > 0 ? 'POOL_WON' : 'POOL_LOST', ctx));
      }

      if (data.status === 'CLAIMABLE' && won) {
        push(buildNotification('POOL_CLAIMABLE', ctx));
      }

      // Refresh the bets cache so /profile flips the position from Active to
      // Closed without a page reload. Without this, bet.pool.status stays
      // JOINING/ACTIVE in cache forever and the row never moves tabs.
      if (data.status === 'RESOLVED' || data.status === 'CLAIMABLE') {
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['claimableBets'] });
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

    // Auto-payout settled - fires when the scheduler's autoClaim has confirmed
    // the on-chain transfer to the user's wallet. Replaces the POOL_CLAIMABLE
    // toast for users on auto-payout-enabled pools.
    const onBetPaid = (payload: { walletAddress?: string; poolId?: string; betId?: string; amount?: string; payoutAmount?: string; txSignature?: string }) => {
      if (!walletAddress || payload.walletAddress !== walletAddress) return;

      push(
        buildNotification('BET_PAID', {
          poolId: payload.poolId,
          // Report the actual payout (time-weighted winnings), falling back to
          // the stake field only for older events that didn't send it.
          amount: payload.payoutAmount ?? payload.amount,
        }),
      );
      // Refresh bets so the row flips from "Paying soon" to "Paid" without a
      // page reload.
      queryClient.invalidateQueries({ queryKey: ['bets'] });
      queryClient.invalidateQueries({ queryKey: ['claimableBets'] });
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

      // Floating "+XP / +Coins" popup - the non-invasive channel for routine gains.
      showRewardPopup({ xp: data.xp, coins: data.coins, levelUp: data.levelUp, level: data.level });

      // Coins are only awarded on wins / referrals (never per-bet), so a bell + toast
      // entry here is meaningful, not spammy. Fold the XP into the same entry so the
      // user sees both gains at once.
      if (data.coins > 0) {
        push(buildNotification('COINS_EARNED', { coins: data.coins, xp: data.xp, reason: data.reason }));
      } else if (data.xp > 0 && data.reason === 'referral') {
        // Referral XP that arrives without coins still warrants its own notification.
        push(buildNotification('XP_EARNED', { xp: data.xp, totalXp: data.totalXp, reason: data.reason }));
      }
      // Routine per-bet XP (coins === 0, no reason) is surfaced only via the floating
      // popup above - toasting on every bet placed would be invasive.

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
    socket.on('wallet:bet-paid', onBetPaid);
    socket.on('user:reward', onUserReward);
    socket.on('tournament:match:result', onTournamentMatchResult);

    return () => {
      socket.off('pool:status', onPoolStatus);
      socket.off('wallet:refund', onRefund);
      socket.off('wallet:bet-paid', onBetPaid);
      socket.off('user:reward', onUserReward);
      socket.off('tournament:match:result', onTournamentMatchResult);
    };
  // betsQuery.data is intentionally in deps so the listener closure
  // picks up the latest bets for win/loss determination
  }, [push, addUserPoolId, betsQuery.data, walletAddress, queryClient]);
}
