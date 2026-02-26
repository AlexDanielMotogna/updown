import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchPools, fetchPool } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

export interface PoolFilters {
  asset?: string;
  status?: string;
  page?: number;
  limit?: number;
}

export function usePools(filters?: PoolFilters) {
  const queryClient = useQueryClient();

  // Subscribe to WebSocket events for pool updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    // When a new pool is created, refetch the pools list
    const onNewPool = () => {
      console.log('[usePools] New pool created, invalidating cache');
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    };

    // When any pool status changes, refetch the pools list
    const onPoolStatus = (data: { id: string; status: string }) => {
      console.log('[usePools] Pool status changed:', data.id, '→', data.status);
      queryClient.invalidateQueries({ queryKey: ['pools'] });
      queryClient.invalidateQueries({ queryKey: ['pool', data.id] });
    };

    socket.on('pools:new', onNewPool);
    socket.on('pool:status', onPoolStatus);

    return () => {
      socket.off('pools:new', onNewPool);
      socket.off('pool:status', onPoolStatus);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['pools', filters],
    queryFn: () => fetchPools(filters),
    refetchInterval: 10000, // Fallback refetch every 10 seconds
  });
}

const POOLS_PAGE_SIZE = 12;

export function useInfinitePools(filters?: Omit<PoolFilters, 'page' | 'limit'>) {
  const queryClient = useQueryClient();

  // Subscribe to WebSocket events for pool updates
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    const onNewPool = () => {
      queryClient.invalidateQueries({ queryKey: ['infinitePools'] });
    };

    const onPoolStatus = () => {
      queryClient.invalidateQueries({ queryKey: ['infinitePools'] });
    };

    socket.on('pools:new', onNewPool);
    socket.on('pool:status', onPoolStatus);

    return () => {
      socket.off('pools:new', onNewPool);
      socket.off('pool:status', onPoolStatus);
    };
  }, [queryClient]);

  return useInfiniteQuery({
    queryKey: ['infinitePools', filters],
    queryFn: ({ pageParam = 1 }) =>
      fetchPools({ ...filters, page: pageParam, limit: POOLS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.meta) return undefined;
      return lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 10000,
  });
}

export function usePool(id: string | null) {
  const queryClient = useQueryClient();

  // Subscribe to WebSocket events for this specific pool
  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;

    const socket = getSocket();
    connectSocket();

    // Subscribe to this pool's room
    socket.emit('subscribe:pool', { poolId: id });

    // When pool is updated (totals change)
    const onPoolUpdated = (data: { id: string }) => {
      if (data.id === id) {
        console.log('[usePool] Pool updated:', id);
        queryClient.invalidateQueries({ queryKey: ['pool', id] });
      }
    };

    // When pool status changes
    const onPoolStatus = (data: { id: string; status: string }) => {
      if (data.id === id) {
        console.log('[usePool] Pool status changed:', id, '→', data.status);
        queryClient.invalidateQueries({ queryKey: ['pool', id] });
      }
    };

    socket.on('pool:updated', onPoolUpdated);
    socket.on('pool:status', onPoolStatus);

    return () => {
      socket.emit('unsubscribe:pool', { poolId: id });
      socket.off('pool:updated', onPoolUpdated);
      socket.off('pool:status', onPoolStatus);
    };
  }, [id, queryClient]);

  return useQuery({
    queryKey: ['pool', id],
    queryFn: () => fetchPool(id!),
    enabled: !!id,
    refetchInterval: 5000, // Fallback refetch every 5 seconds
  });
}
