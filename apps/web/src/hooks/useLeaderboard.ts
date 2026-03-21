import { useQuery } from '@tanstack/react-query';
import { fetchLeaderboard } from '@/lib/api';

export function useLeaderboard(params?: {
  sort?: 'xp' | 'coins' | 'level';
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['leaderboard', params],
    queryFn: () => fetchLeaderboard(params),
    refetchInterval: 60_000,
  });
}
