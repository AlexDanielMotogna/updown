import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { useSolanaConnection } from '@/app/providers';
import { useWalletBridge } from './useWalletBridge';
import { getSocket, connectSocket } from '@/lib/socket';

const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || 'By87mHK9Meinfv4AEqTx9qyYmGDLUcwiywpkkCWwGUVz'
);

interface UsdcBalance {
  raw: string;
  uiAmount: number;
  decimals: number;
}

export function useUsdcBalance() {
  const connection = useSolanaConnection();
  const { publicKey, connected } = useWalletBridge();
  const queryClient = useQueryClient();

  // Listen for server-side refunds to refresh balance immediately
  useEffect(() => {
    if (typeof window === 'undefined' || !publicKey) return;

    const socket = getSocket();
    connectSocket();

    const onRefund = (data: { walletAddress: string }) => {
      if (data.walletAddress === publicKey.toBase58()) {
        console.log('[useUsdcBalance] Refund received, refreshing balance');
        queryClient.invalidateQueries({ queryKey: ['usdc-balance'] });
        queryClient.invalidateQueries({ queryKey: ['bets'] });
        queryClient.invalidateQueries({ queryKey: ['claimableBets'] });
      }
    };

    socket.on('wallet:refund', onRefund);
    return () => { socket.off('wallet:refund', onRefund); };
  }, [publicKey, queryClient]);

  return useQuery<UsdcBalance>({
    queryKey: ['usdc-balance', publicKey?.toBase58()],
    queryFn: async () => {
      if (!publicKey) throw new Error('No wallet connected');

      const ata = await getAssociatedTokenAddress(USDC_MINT, publicKey);

      try {
        const balance = await connection.getTokenAccountBalance(ata);
        return {
          raw: balance.value.amount,
          uiAmount: balance.value.uiAmount ?? 0,
          decimals: balance.value.decimals,
        };
      } catch {
        // ATA doesn't exist yet — balance is 0
        return { raw: '0', uiAmount: 0, decimals: 6 };
      }
    },
    enabled: connected && !!publicKey,
    refetchInterval: 15_000,
    staleTime: 10_000,
  });
}
