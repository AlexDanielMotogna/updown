import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { fetchPools, fetchPool, type Pool, type ApiResponse } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

export interface PoolFilters {
  asset?: string;
  interval?: string;
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

type InfinitePoolsData = InfiniteData<ApiResponse<Pool[]>, number>;

export function useInfinitePools(filters?: Omit<PoolFilters, 'page' | 'limit'>) {
  const queryClient = useQueryClient();
  const queryKey = ['infinitePools', filters];

  // Check if a pool matches the current filters
  const matchesFilters = useCallback(
    (pool: Pool) => {
      if (filters?.asset && pool.asset !== filters.asset) return false;
      if (filters?.interval && pool.interval !== filters.interval) return false;
      if (filters?.status && pool.status !== filters.status) return false;
      return true;
    },
    [filters],
  );

  // WebSocket: direct cache insertion/removal (no invalidateQueries)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    // New pool created → prepend to first page if it matches filters
    const onNewPool = (payload: { pool: Pool }) => {
      const pool = payload.pool;
      if (!pool?.id) return;

      // Fill fields the WS payload may omit
      const normalized: Pool = {
        ...pool,
        betCount: pool.betCount ?? 0,
        upCount: pool.upCount ?? 0,
        downCount: pool.downCount ?? 0,
        totalUp: pool.totalUp ?? '0',
        totalDown: pool.totalDown ?? '0',
        totalPool: pool.totalPool ?? '0',
        strikePrice: pool.strikePrice ?? null,
        finalPrice: pool.finalPrice ?? null,
        winner: pool.winner ?? null,
      };

      if (!matchesFilters(normalized)) return;

      console.log('[useInfinitePools] Inserting new pool via WS:', normalized.id);
      queryClient.setQueryData<InfinitePoolsData>(queryKey, (old) => {
        if (!old) return old;
        const firstPage = old.pages[0];
        if (!firstPage?.data) return old;

        // Avoid duplicates
        if (firstPage.data.some((p) => p.id === normalized.id)) return old;

        return {
          ...old,
          pages: [
            { ...firstPage, data: [normalized, ...firstPage.data] },
            ...old.pages.slice(1),
          ],
        };
      });
    };

    // Pool status changed → remove from cache if no longer belongs
    const onPoolStatus = (data: { id: string; status: string }) => {
      if (!data?.id) return;

      const removedStatuses = ['RESOLVED', 'CLAIMABLE'];
      // If the markets page filters by a specific status and the pool no longer matches, remove it
      const shouldRemove =
        (filters?.status && data.status !== filters.status) ||
        (!filters?.status && removedStatuses.includes(data.status));

      if (!shouldRemove) return;

      console.log('[useInfinitePools] Removing pool via WS:', data.id, '→', data.status);
      queryClient.setQueryData<InfinitePoolsData>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            data: page.data?.filter((p) => p.id !== data.id),
          })),
        };
      });
    };

    socket.on('pools:new', onNewPool);
    socket.on('pool:status', onPoolStatus);

    return () => {
      socket.off('pools:new', onNewPool);
      socket.off('pool:status', onPoolStatus);
    };
  }, [queryClient, queryKey, matchesFilters, filters]);

  return useInfiniteQuery({
    queryKey,
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
    staleTime: 15_000,
    refetchInterval: 30_000,
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
