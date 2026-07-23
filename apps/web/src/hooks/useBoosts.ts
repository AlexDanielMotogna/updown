import { useQuery } from '@tanstack/react-query';
import { useWalletBridge } from './useWalletBridge';
import { fetchBoosts } from '@/lib/api';

/**
 * Boost store state (catalog + active boosts) for the connected wallet. Shared by
 * the profile BoostStore and the header badges via the ['boosts', wallet] cache key.
 */
export function useBoosts() {
  const { walletAddress } = useWalletBridge();
  const query = useQuery({
    queryKey: ['boosts', walletAddress],
    queryFn: () => fetchBoosts(walletAddress!),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });
  return { walletAddress, ...query };
}
