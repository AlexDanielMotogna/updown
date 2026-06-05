import { useQuery } from '@tanstack/react-query';
import { fetchLeaderboard, type LeaderboardSort } from '@/lib/api';

export function useLeaderboard(params?: {
  sort?: LeaderboardSort;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['leaderboard', params],
    queryFn: () => fetchLeaderboard(params),
    refetchInterval: 60_000,
  });
}
