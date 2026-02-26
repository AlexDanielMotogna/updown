import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useWalletBridge } from './useWalletBridge';
import { fetchBets, fetchClaimableBets } from '@/lib/api';

export function useBets(params?: { page?: number; limit?: number }) {
  const { walletAddress: wallet } = useWalletBridge();

  return useQuery({
    queryKey: ['bets', wallet, params],
    queryFn: () => fetchBets(wallet!, params),
    enabled: !!wallet,
    refetchInterval: 10000,
  });
}

const BETS_PAGE_SIZE = 10;

export function useInfiniteBets() {
  const { walletAddress: wallet } = useWalletBridge();

  return useInfiniteQuery({
    queryKey: ['infiniteBets', wallet],
    queryFn: ({ pageParam = 1 }) =>
      fetchBets(wallet!, { page: pageParam, limit: BETS_PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (!lastPage.meta) return undefined;
      return lastPage.meta.page < lastPage.meta.totalPages
        ? lastPage.meta.page + 1
        : undefined;
    },
    enabled: !!wallet,
    refetchInterval: 10000,
  });
}

export function useClaimableBets() {
  const { walletAddress: wallet } = useWalletBridge();

  return useQuery({
    queryKey: ['claimableBets', wallet],
    queryFn: () => fetchClaimableBets(wallet!),
    enabled: !!wallet,
    refetchInterval: 10000,
  });
}
