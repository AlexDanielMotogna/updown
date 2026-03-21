import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useWalletBridge } from './useWalletBridge';
import {
  fetchSquads,
  fetchSquad,
  fetchSquadPools,
  fetchSquadMessages,
  fetchSquadLeaderboard,
  createSquad as apiCreateSquad,
  joinSquad as apiJoinSquad,
  createSquadPool as apiCreateSquadPool,
  sendSquadMessage as apiSendSquadMessage,
  leaveSquad as apiLeaveSquad,
  kickSquadMember as apiKickSquadMember,
  type SquadChatMessage,
} from '@/lib/api';
import { getSocket, connectSocket, subscribeSquad, unsubscribeSquad } from '@/lib/socket';

/**
 * List of squads the current user belongs to.
 */
export function useSquads() {
  const { walletAddress } = useWalletBridge();

  return useQuery({
    queryKey: ['squads', walletAddress],
    queryFn: () => fetchSquads(walletAddress!),
    enabled: !!walletAddress,
    select: (res) => res.data,
    refetchInterval: 30_000,
  });
}

/**
 * Squad detail with real-time member events.
 */
export function useSquad(id: string | null) {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;

    const socket = getSocket();
    connectSocket();
    subscribeSquad(id);

    const onMemberJoined = () => {
      queryClient.invalidateQueries({ queryKey: ['squad', id] });
      queryClient.invalidateQueries({ queryKey: ['squadLeaderboard', id] });
    };

    socket.on('squad:member:joined', onMemberJoined);

    return () => {
      unsubscribeSquad(id);
      socket.off('squad:member:joined', onMemberJoined);
    };
  }, [id, queryClient]);

  return useQuery({
    queryKey: ['squad', id, walletAddress],
    queryFn: () => fetchSquad(id!, walletAddress!),
    enabled: !!id && !!walletAddress,
    select: (res) => res.data,
    refetchInterval: 30_000,
  });
}

/**
 * Squad pools with real-time new pool events.
 */
export function useSquadPools(squadId: string | null) {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || !squadId) return;

    const socket = getSocket();
    connectSocket();

    const onNewPool = () => {
      queryClient.invalidateQueries({ queryKey: ['squadPools', squadId] });
    };

    const onPoolStatus = () => {
      queryClient.invalidateQueries({ queryKey: ['squadPools', squadId] });
    };

    socket.on('squad:pool:new', onNewPool);
    socket.on('pool:status', onPoolStatus);

    return () => {
      socket.off('squad:pool:new', onNewPool);
      socket.off('pool:status', onPoolStatus);
    };
  }, [squadId, queryClient]);

  return useQuery({
    queryKey: ['squadPools', squadId, walletAddress],
    queryFn: () => fetchSquadPools(squadId!, walletAddress!),
    enabled: !!squadId && !!walletAddress,
    select: (res) => res.data,
    refetchInterval: 10_000,
  });
}

/**
 * Squad chat messages with real-time WebSocket updates.
 */
export function useSquadChat(squadId: string | null) {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || !squadId) return;

    const socket = getSocket();
    connectSocket();

    const onMessage = (data: { squadId: string; message: SquadChatMessage }) => {
      if (data.squadId !== squadId) return;
      queryClient.invalidateQueries({ queryKey: ['squadMessages', squadId] });
    };

    socket.on('squad:message', onMessage);

    return () => {
      socket.off('squad:message', onMessage);
    };
  }, [squadId, queryClient]);

  return useQuery({
    queryKey: ['squadMessages', squadId, walletAddress],
    queryFn: () => fetchSquadMessages(squadId!, walletAddress!, { limit: 50 }),
    enabled: !!squadId && !!walletAddress,
    select: (res) => res.data,
    refetchInterval: 30_000,
  });
}

/**
 * Squad leaderboard.
 */
export function useSquadLeaderboard(squadId: string | null) {
  const { walletAddress } = useWalletBridge();

  return useQuery({
    queryKey: ['squadLeaderboard', squadId, walletAddress],
    queryFn: () => fetchSquadLeaderboard(squadId!, walletAddress!),
    enabled: !!squadId && !!walletAddress,
    select: (res) => res.data,
    refetchInterval: 60_000,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useCreateSquad() {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => apiCreateSquad({ wallet: walletAddress!, name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
    },
  });
}

export function useJoinSquad() {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (inviteCode: string) => apiJoinSquad({ wallet: walletAddress!, inviteCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
    },
  });
}

export function useCreateSquadPool(squadId: string) {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { asset: string; durationSeconds: number; maxBettors?: number }) =>
      apiCreateSquadPool({ squadId, wallet: walletAddress!, ...params }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squadPools', squadId] });
    },
  });
}

export function useSendSquadMessage(squadId: string) {
  const { walletAddress } = useWalletBridge();

  return useMutation({
    mutationFn: (content: string) =>
      apiSendSquadMessage(squadId, { wallet: walletAddress!, content }),
  });
}

export function useLeaveSquad() {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (squadId: string) => apiLeaveSquad(squadId, walletAddress!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squads'] });
    },
  });
}

export function useKickSquadMember(squadId: string) {
  const { walletAddress } = useWalletBridge();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (targetWallet: string) =>
      apiKickSquadMember(squadId, targetWallet, walletAddress!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squad', squadId] });
      queryClient.invalidateQueries({ queryKey: ['squadLeaderboard', squadId] });
    },
  });
}
