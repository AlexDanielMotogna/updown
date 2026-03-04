import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useWalletBridge } from './useWalletBridge';
import { registerUser, fetchUserProfile } from '@/lib/api';

/**
 * Fetches user profile with auto-registration on first load.
 * Refetches every 30s.
 */
export function useUserProfile() {
  const { walletAddress } = useWalletBridge();
  const registeredRef = useRef(false);

  // Auto-register (upsert) on first connection
  useEffect(() => {
    if (!walletAddress || registeredRef.current) return;
    registeredRef.current = true;
    registerUser(walletAddress).catch(() => {});
  }, [walletAddress]);

  return useQuery({
    queryKey: ['userProfile', walletAddress],
    queryFn: () => fetchUserProfile(walletAddress!),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });
}
