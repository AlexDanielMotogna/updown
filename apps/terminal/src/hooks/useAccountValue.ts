'use client';

import { useAccountStream } from './useAccountStream';
import { useAccountState } from '@/lib/accountStore';

/**
 * Unified account value (HL Unified Account). The single balance lives in the spot
 * clearinghouse — including the USDC backing perp margin — so account value =
 * spot account value (USDC + tokens × mark) + perps unrealized PnL. We add uPnL,
 * NOT the full perps equity, to avoid double-counting the margin (already in spot).
 *
 * Spot data comes from the shared account store (one poll for all consumers); uPnL
 * comes from the WS account stream. The "Account Info" total — navbar chip + overview.
 */
export function useAccountValue(evmAddress?: string) {
  const { account } = useAccountStream(evmAddress);
  const { spotValue, usdcAvailable } = useAccountState(evmAddress);

  const upnl = account ? Number(account.unrealizedPnl ?? 0) : 0;
  const total = (spotValue ?? 0) + upnl;
  // Ready once either source has reported, so the chip doesn't flash $0.00 forever.
  const ready = !!account || spotValue != null;
  // Loaded = both spot fields resolved (gate funding/needs-deposit so a half-loaded
  // state can't flash "Deposit to start trading" on a funded account).
  const loaded = spotValue != null && usdcAvailable != null;
  return { total, upnl, spotValue, usdcAvailable, ready, loaded };
}
