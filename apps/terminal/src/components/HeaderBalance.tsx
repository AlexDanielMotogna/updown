'use client';

import { useEffect, useState } from 'react';
import { useIdentity } from '@/hooks/useIdentity';

function BalanceInner() {
  const { evmAddress } = useIdentity();
  const [equity, setEquity] = useState<number | null>(null);

  useEffect(() => {
    if (!evmAddress) {
      setEquity(null);
      return;
    }
    let alive = true;
    const tick = async () => {
      try {
        const r = await (await fetch(`/api/positions?address=${evmAddress}`, { cache: 'no-store' })).json();
        if (alive && r.success) setEquity(Number(r.data.account?.accountEquity ?? 0));
      } catch {/* keep */}
    };
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [evmAddress]);

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
