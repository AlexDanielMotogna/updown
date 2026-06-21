'use client';

import { useEffect } from 'react';
import { connectSocket, getSocket } from '@/lib/socket';
import { emitProfileRefresh } from '@/lib/profileEvents';

interface UserRewardEvent {
  walletAddress: string;
  xp: number;
  coins: number;
  level: number;
}

/**
 * Live reward updates: listen to the UpDown API socket's `user:reward` broadcast
 * and refresh the profile (level/XP/UP chip) for THIS wallet — no page refresh,
 * from any source (trade credit, the server poller, betting, etc.).
 */
export function useRewardSocket(walletAddress?: string): void {
  useEffect(() => {
    if (!walletAddress) return;
    const socket = getSocket();
    connectSocket();
    const onReward = (data: UserRewardEvent) => {
      if (data?.walletAddress === walletAddress) emitProfileRefresh();
    };
    socket.on('user:reward', onReward);
    return () => { socket.off('user:reward', onReward); };
  }, [walletAddress]);
}
