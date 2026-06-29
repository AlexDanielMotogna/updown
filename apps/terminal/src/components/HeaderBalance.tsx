'use client';

import { useIdentity } from '@/hooks/useIdentity';
import { useAccountValue } from '@/hooks/useAccountValue';

function BalanceInner() {
  const { evmAddress } = useIdentity();
  // Unified account value (spot + perps), the same "Account Info" total — not the
  // spot-only or perps-only balance.
  const { total, ready } = useAccountValue(evmAddress);

  return (
    <span className="flex h-[38px] min-w-[4.25rem] items-center justify-end gap-1 rounded-md bg-white/[0.06] px-3 text-[0.7rem] font-semibold tabular text-surface-100 sm:text-[0.8rem]" title="HyperLiquid account value (spot + perps)">
      <span className="text-win-500">$</span>
      {ready ? total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
    </span>
  );
}

/** Live account-equity chip for the header (top-right). */
export function HeaderBalance() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <BalanceInner />;
}
