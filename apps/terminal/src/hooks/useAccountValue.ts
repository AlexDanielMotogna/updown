'use client';

import { useAccountStream } from './useAccountStream';
import { useAccountState } from '@/lib/accountStore';
import { sharesOneBalance } from '@/lib/hlBalances';

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
  const { spotValue, usdcAvailable, abstraction } = useAccountState(evmAddress);

  const upnl = account ? Number(account.unrealizedPnl ?? 0) : 0;
  const perpsEquity = account ? Number(account.accountEquity ?? 0) : 0;
  const perpsAvailable = account ? Number(account.availableToSpend ?? 0) : 0;

  // The formula depends on how the account holds its money, which is why this
  // used to be wrong. Under a UNIFIED account there is one balance, kept in the
  // spot clearinghouse and already covering perp margin, so account value is
  // spot + uPnL and adding perps equity would double-count. Under the LEGACY
  // split (default / dexAbstraction / disabled) spot and perps are separate
  // wallets, so perps equity has to be added or funds sitting in perps are
  // invisible: that is what showed $0.00 in the navbar for an account holding
  // $6 in perps. Unknown mode falls back to the unified formula, since
  // under-reporting beats showing a total the user cannot spend.
  const total = sharesOneBalance(abstraction)
    ? (spotValue ?? 0) + upnl
    : (spotValue ?? 0) + perpsEquity;
  /**
   * Buying power for a PERPS order, which side holds it depends on the mode.
   * Under a unified account the free USDC sits in the (spot) unified balance and
   * the perps clearinghouse reads ~0, so spot is the right source. Under the
   * legacy split it is exactly inverted: spot is 0 and the money is the perps
   * availableToSpend. Reading only spot is what left "Available to Trade $0" and
   * "Max $0" on an account holding $6 in perps, so it could not trade at all.
   */
  const availableToTrade = sharesOneBalance(abstraction) ? (usdcAvailable ?? 0) : perpsAvailable;

  // Ready once either source has reported, so the chip doesn't flash $0.00 forever.
  const ready = !!account || spotValue != null;
  // Loaded = both spot fields resolved (gate funding/needs-deposit so a half-loaded
  // state can't flash "Deposit to start trading" on a funded account).
  const loaded = spotValue != null && usdcAvailable != null;
  return { total, upnl, spotValue, usdcAvailable, availableToTrade, ready, loaded };
}
