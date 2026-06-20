'use client';

import { useIdentity } from '@/hooks/useIdentity';
import { useAccountStream } from '@/hooks/useAccountStream';

function BalanceInner() {
  const { evmAddress } = useIdentity();
  const { account } = useAccountStream(evmAddress);
  const equity = account ? Number(account.accountEquity) : null;

  return (
    <span className="flex items-center gap-1.5 rounded border border-surface-700 bg-surface-850 px-2.5 py-1 text-sm tabular text-surface-100">
      <span className="text-surface-400">◈</span>
      {equity != null ? `$${equity.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00'}
    </span>
  );
}

/** Live account-equity chip for the header (top-right). */
export function HeaderBalance() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return null;
  return <BalanceInner />;
}
