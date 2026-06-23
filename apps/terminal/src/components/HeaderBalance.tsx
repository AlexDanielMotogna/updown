'use client';

import { useIdentity } from '@/hooks/useIdentity';
import { useAccountStream } from '@/hooks/useAccountStream';

function BalanceInner() {
  const { evmAddress } = useIdentity();
  const { account } = useAccountStream(evmAddress);
  const equity = account ? Number(account.accountEquity) : null;

  return (
    <span className="flex h-[38px] items-center gap-1 rounded-md bg-white/[0.06] px-3 text-[0.7rem] font-semibold tabular text-surface-100 sm:text-[0.8rem]" title="HyperLiquid account equity">
      <span className="text-win-500">$</span>
      {equity != null ? equity.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0.00'}
    </span>
  );
}

/** Live account-equity chip for the header (top-right). */
export function HeaderBalance() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <BalanceInner />;
}
