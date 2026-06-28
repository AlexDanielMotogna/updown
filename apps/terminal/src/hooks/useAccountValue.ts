'use client';

import { useEffect, useState } from 'react';
import { useAccountStream } from './useAccountStream';
import { fetchSpotAccountValue, fetchSpotUsdcAvailable } from '@/lib/hlBalances';

/**
 * Unified account value (HL Unified Account). The single balance lives in the spot
 * clearinghouse — including the USDC backing perp margin — so account value =
 * spot account value (USDC + tokens × mark) + perps unrealized PnL. We add uPnL,
 * NOT the full perps equity, to avoid double-counting the margin (already in spot).
 * This is the "Account Info" total — used by the navbar chip and the account
 * overview so they always agree.
 */
export function useAccountValue(evmAddress?: string) {
  const { account } = useAccountStream(evmAddress);
  const [spotValue, setSpotValue] = useState<number | null>(null);
  const [usdcAvailable, setUsdcAvailable] = useState<number | null>(null);

  useEffect(() => {
    if (!evmAddress) { setSpotValue(null); setUsdcAvailable(null); return; }
    let alive = true;
    const load = () => {
      fetchSpotAccountValue(evmAddress).then((v) => alive && setSpotValue(v));
      fetchSpotUsdcAvailable(evmAddress).then((v) => alive && setUsdcAvailable(v));
    };
    load();
    const id = window.setInterval(load, 10000);
    return () => { alive = false; window.clearInterval(id); };
  }, [evmAddress]);

  const upnl = account ? Number(account.unrealizedPnl ?? 0) : 0;
  const total = (spotValue ?? 0) + upnl;
  // Ready once either source has reported, so the chip doesn't flash $0.00 forever.
  const ready = !!account || spotValue != null;
  return { total, upnl, spotValue, usdcAvailable, ready };
}
