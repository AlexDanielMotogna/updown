import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { fetchPools, fetchPool, type Pool, type ApiResponse } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

export interface PoolFilters {
  asset?: string;
  interval?: string;
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export function usePools(filters?: PoolFilters) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    const onNewPool = () => {
      queryClient.invalidateQueries({ queryKey: ['pools'] });
    };

    const onPoolStatus = (data: { id: string; status: string }) => {
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
    refetchInterval: 10_000,
  });
}

const POOLS_PAGE_SIZE = 12;

type InfinitePoolsData = InfiniteData<ApiResponse<Pool[]>, number>;

export function useInfinitePools(filters?: Omit<PoolFilters, 'page' | 'limit'>, opts?: { refetchInterval?: number | false }) {
  const queryClient = useQueryClient();
  const queryKey = ['infinitePools', filters];

  // Store latest values in a ref so the WebSocket effect doesn't need
  // to re-subscribe every time filters/queryKey change.
  const stableRef = useRef({ filters, queryKey });
  stableRef.current = { filters, queryKey };

  // WebSocket: attach listeners ONCE (stable effect)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const socket = getSocket();
    connectSocket();

    const onNewPool = (_payload: { pool: Pool }) => {
      const { queryKey: qk } = stableRef.current;
      queryClient.invalidateQueries({ queryKey: qk, refetchType: 'none' });
    };

    const onPoolStatus = (data: { id: string; status: string }) => {
      if (!data?.id) return;

      const { filters: f, queryKey: qk } = stableRef.current;

      const removedStatuses = ['RESOLVED', 'CLAIMABLE'];
      const shouldRemove =
        (f?.status && !f.status.split(',').includes(data.status)) ||
        (!f?.status && removedStatuses.includes(data.status));

      if (!shouldRemove) return;
      queryClient.setQueryData<InfinitePoolsData>(qk, (old) => {
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
  }, [queryClient]); // Only depend on queryClient (stable singleton)

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
    staleTime: 5_000,
    refetchInterval: opts?.refetchInterval ?? 10_000,
  });
}

export function usePool(id: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === 'undefined' || !id) return;

    const socket = getSocket();
    connectSocket();

    socket.emit('subscribe:pool', { poolId: id });

    const onPoolUpdated = (data: { id: string }) => {
      if (data.id === id) {
        queryClient.invalidateQueries({ queryKey: ['pool', id] });
      }
    };

    const onPoolStatus = (data: { id: string; status: string }) => {
      if (data.id === id) {
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
    refetchInterval: 5_000,
  });
}
