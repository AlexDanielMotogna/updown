import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useWalletBridge } from './useWalletBridge';
import { registerUser, fetchUserProfile } from '@/lib/api';

/**
 * Fetches user profile with auto-registration on first load.
 * Registers first, then fetches profile — ensures new users see data immediately.
 * Refetches every 30s.
 */
export function useUserProfile() {
  const { walletAddress } = useWalletBridge();
  const registeredRef = useRef<string | null>(null);
  const queryClient = useQueryClient();

  // Auto-register on first connection or wallet change, then invalidate profile
  useEffect(() => {
    if (!walletAddress) return;
    if (registeredRef.current === walletAddress) return;
    registeredRef.current = walletAddress;

    registerUser(walletAddress)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
      })
      .catch(() => {});
  }, [walletAddress, queryClient]);

  return useQuery({
    queryKey: ['userProfile', walletAddress],
    queryFn: () => fetchUserProfile(walletAddress!),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });
}
