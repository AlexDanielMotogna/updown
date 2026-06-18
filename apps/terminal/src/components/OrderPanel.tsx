'use client';

import dynamic from 'next/dynamic';
import { OrderEntry } from './OrderEntry';
import { useIdentity } from '@/hooks/useIdentity';

// Lazy: AgentSetup pulls the HL SDK (approveAgent signing). Keep it out of the
// market route's initial bundle — load it as an async chunk on demand.
const AgentSetup = dynamic(() => import('./AgentSetup').then((m) => m.AgentSetup), {
  ssr: false,
  loading: () => (
    <div className="rounded border border-border bg-bg-surface p-3 text-sm text-muted">…</div>
  ),
});

function WithIdentity({ symbol, devWallet }: { symbol: string; devWallet?: string }) {
  const { walletAddress } = useIdentity();
  return (
    <div className="space-y-3">
      <OrderEntry symbol={symbol} walletAddress={walletAddress ?? devWallet} />
      <AgentSetup />
    </div>
  );
}

/** Order entry + agent setup, identity from Privy (falls back to dev wallet). */
export function OrderPanel({ symbol, devWallet }: { symbol: string; devWallet?: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <div className="space-y-3">
        <OrderEntry symbol={symbol} walletAddress={devWallet} />
        <AgentSetup />
      </div>
    );
  }
  return <WithIdentity symbol={symbol} devWallet={devWallet} />;
}
