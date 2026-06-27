'use client';

import dynamic from 'next/dynamic';
import { useState } from 'react';
import { OrderEntry } from './OrderEntry';
import { SpotOrderTicket } from './SpotOrderTicket';
import { useIdentity } from '@/hooks/useIdentity';
import { useTradeRewardCredit } from '@/hooks/useTradeRewardCredit';
import type { OrderSide } from '@/lib/types';

// Lazy: AgentSetup pulls the HL SDK (approveAgent signing). Keep it out of the
// market route's initial bundle — load it as an async chunk on demand.
const AgentSetup = dynamic(() => import('./AgentSetup').then((m) => m.AgentSetup), {
  ssr: false,
  loading: () => (
    <div className="card p-3 text-sm text-surface-400">…</div>
  ),
});

const SPOT_ENABLED = process.env.NEXT_PUBLIC_SPOT_ENABLED === 'true';

/** Perps order entry + agent setup, or the self-contained spot ticket. A small
 * Perps|Spot toggle (only when NEXT_PUBLIC_SPOT_ENABLED) switches between them. */
function OrderPanelInner({ symbol, walletAddress, evmAddress, initialSide }: { symbol: string; walletAddress?: string; evmAddress?: string; initialSide?: OrderSide }) {
  const [kind, setKind] = useState<'perp' | 'spot'>(() => {
    if (typeof window === 'undefined') return 'perp';
    return (window.localStorage.getItem('updown-trade-kind') as 'perp' | 'spot') || 'perp';
  });
  const setKindPersist = (k: 'perp' | 'spot') => {
    setKind(k);
    try { window.localStorage.setItem('updown-trade-kind', k); } catch { /* ignore */ }
  };

  return (
    <div className="space-y-1">
      {SPOT_ENABLED && (
        <div className="flex rounded-lg bg-surface-800 p-0.5 text-xs font-semibold">
          {(['perp', 'spot'] as const).map((k) => (
            <button key={k} onClick={() => setKindPersist(k)}
              className={`flex-1 rounded-md py-1.5 transition-colors ${kind === k ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-200'}`}>
              {k === 'perp' ? 'Perps' : 'Spot'}
            </button>
          ))}
        </div>
      )}
      {SPOT_ENABLED && kind === 'spot' ? (
        <SpotOrderTicket walletAddress={walletAddress} evmAddress={evmAddress} />
      ) : (
        <>
          <OrderEntry symbol={symbol} walletAddress={walletAddress} evmAddress={evmAddress} initialSide={initialSide} />
          <AgentSetup />
        </>
      )}
    </div>
  );
}

function WithIdentity({ symbol, devWallet, devEvm, initialSide }: { symbol: string; devWallet?: string; devEvm?: string; initialSide?: OrderSide }) {
  const { walletAddress, evmAddress } = useIdentity();
  // Near-instant trading rewards: credit XP + UP coins when a fill lands.
  useTradeRewardCredit(walletAddress ?? devWallet, evmAddress ?? devEvm);
  return <OrderPanelInner symbol={symbol} walletAddress={walletAddress ?? devWallet} evmAddress={evmAddress ?? devEvm} initialSide={initialSide} />;
}

/** Order entry + agent setup, identity from Privy (falls back to dev wallets). */
export function OrderPanel({ symbol, devWallet, devEvm, initialSide }: { symbol: string; devWallet?: string; devEvm?: string; initialSide?: OrderSide }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return <OrderPanelInner symbol={symbol} walletAddress={devWallet} evmAddress={devEvm} initialSide={initialSide} />;
  }
  return <WithIdentity symbol={symbol} devWallet={devWallet} devEvm={devEvm} initialSide={initialSide} />;
}
