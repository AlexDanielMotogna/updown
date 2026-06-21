'use client';

import dynamic from 'next/dynamic';
import { OrderEntry } from './OrderEntry';
import { useIdentity } from '@/hooks/useIdentity';
import { useTradeRewardCredit } from '@/hooks/useTradeRewardCredit';

// Lazy: AgentSetup pulls the HL SDK (approveAgent signing). Keep it out of the
// market route's initial bundle — load it as an async chunk on demand.
const AgentSetup = dynamic(() => import('./AgentSetup').then((m) => m.AgentSetup), {
  ssr: false,
  loading: () => (
    <div className="card p-3 text-sm text-surface-400">…</div>
  ),
});

function WithIdentity({ symbol, devWallet, devEvm }: { symbol: string; devWallet?: string; devEvm?: string }) {
  const { walletAddress, evmAddress } = useIdentity();
  // Near-instant trading rewards: credit XP + UP coins when a fill lands.
  useTradeRewardCredit(walletAddress ?? devWallet, evmAddress ?? devEvm);
  return (
    <div className="space-y-1">
      <OrderEntry symbol={symbol} walletAddress={walletAddress ?? devWallet} evmAddress={evmAddress ?? devEvm} />
      <AgentSetup />
    </div>
  );
}

/** Order entry + agent setup, identity from Privy (falls back to dev wallets). */
export function OrderPanel({ symbol, devWallet, devEvm }: { symbol: string; devWallet?: string; devEvm?: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <div className="space-y-1">
        <OrderEntry symbol={symbol} walletAddress={devWallet} evmAddress={devEvm} />
        <AgentSetup />
      </div>
    );
  }
  return <WithIdentity symbol={symbol} devWallet={devWallet} devEvm={devEvm} />;
}
