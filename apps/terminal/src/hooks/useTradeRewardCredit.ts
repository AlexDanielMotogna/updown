'use client';

import { useEffect, useRef } from 'react';
import { creditFills, IS_TESTNET } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { useAccountStream } from './useAccountStream';

/**
 * Near-instant trading rewards: when the WS account stream reports a new fill,
 * ping the API (debounced) to credit XP + UP coins. The server re-verifies via
 * userFills, so the client only triggers — it never reports reward amounts.
 * Mainnet only; the 120s API poller is the safety net.
 */
export function useTradeRewardCredit(walletAddress?: string, evmAddress?: string) {
  const { fills } = useAccountStream(evmAddress);
  const toast = useToast();
  const lastSeen = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const newestId = fills[0]?.historyId ?? null;

  useEffect(() => {
    if (IS_TESTNET || !walletAddress || !newestId) return;
    // First snapshot just establishes the baseline (don't credit history on mount).
    if (lastSeen.current === null) { lastSeen.current = newestId; return; }
    if (newestId === lastSeen.current) return;
    lastSeen.current = newestId;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const res = await creditFills(walletAddress);
      if (res.success && res.data && res.data.newFills > 0) {
        const { xpAwarded, coinsAwarded } = res.data;
        const parts = [xpAwarded > 0 ? `+${xpAwarded} XP` : '', coinsAwarded > 0 ? `+${(coinsAwarded / 100).toFixed(2)} UP` : ''].filter(Boolean);
        if (parts.length) toast.show('success', `Trade reward: ${parts.join(' · ')}`);
      }
    }, 3000);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [newestId, walletAddress, toast]);
}
