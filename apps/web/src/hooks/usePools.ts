import { useQuery, useInfiniteQuery, useQueryClient, keepPreviousData, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { fetchPools, fetchPool, type Pool, type ApiResponse } from '@/lib/api';
import { getSocket, connectSocket } from '@/lib/socket';

export interface PoolFilters {
  asset?: string;
  interval?: string;
  status?: string;
  type?: string;
  league?: string;
  tag?: string;
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
    // No polling — WebSocket listeners above invalidate on pools:new / pool:status.
    refetchInterval: false,
    staleTime: 30_000,
  });
}

const POOLS_PAGE_SIZE = 12;

type InfinitePoolsData = InfiniteData<ApiResponse<Pool[]>, number>;

export function useInfinitePools(filters?: Omit<PoolFilters, 'page'>, opts?: { refetchInterval?: number | false }) {
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

    const onNewPool = (payload: { pool: Pool }) => {
      const { queryKey: qk } = stableRef.current;
      // Insert new pool into page 1 directly — avoids full refetch flicker
      queryClient.setQueryData<InfinitePoolsData>(qk, (old) => {
        if (!old || !old.pages[0]) return old;
        const pool = payload.pool;
        if (!pool?.id) return old; // invalid payload
        // Check if already exists
        const exists = old.pages.some(p => p.data?.some(pp => pp.id === pool.id));
        if (exists) return old;
        return {
          ...old,
          pages: old.pages.map((page, i) =>
            i === 0 ? { ...page, data: [pool, ...(page.data || [])] } : page
          ),
        };
      });
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

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam = 1 }) =>
      fetchPools({ ...filters, page: pageParam, limit: filters?.limit || POOLS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.meta) return undefined;
      return lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
    // Don't use refetchInterval on infinite queries — it refetches ALL loaded
    // pages at once, causing visual flicker. Instead, we refresh page 1 only.
    refetchInterval: false,
  });

  // Periodically refetch only page 1 to pick up new/changed pools
  // without re-fetching all loaded pages (which causes flicker).
  useEffect(() => {
    const interval = opts?.refetchInterval ?? 15_000;
    if (interval === false) return;
    const iv = setInterval(async () => {
      try {
        const fresh = await fetchPools({ ...stableRef.current.filters, page: 1, limit: stableRef.current.filters?.limit || POOLS_PAGE_SIZE });
        queryClient.setQueryData<InfinitePoolsData>(stableRef.current.queryKey, (old) => {
          if (!old) return old;
          return { ...old, pages: [fresh, ...old.pages.slice(1)] };
        });
      } catch { /* silent */ }
    }, interval);
    return () => clearInterval(iv);
  }, [queryClient, opts?.refetchInterval]);

  return query;
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
    // WebSocket invalidates on pool:updated / pool:status above; poll is just a fallback.
    refetchInterval: 30_000,
  });
}
