'use client';

import dynamic from 'next/dynamic';
import { OrderEntry } from './OrderEntry';
import { SpotOrderTicket } from './SpotOrderTicket';
import { useIdentity } from '@/hooks/useIdentity';
import { useTradeRewardCredit } from '@/hooks/useTradeRewardCredit';
import { isSpotSymbol } from '@/lib/api';
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

/** The symbol drives the form: a spot symbol ("@N" / "X/USDC", via the market
 * selector's Spot tab) shows the spot ticket locked to that pair; otherwise the
 * perps order entry + agent setup. */
function OrderPanelInner({ symbol, walletAddress, evmAddress, initialSide }: { symbol: string; walletAddress?: string; evmAddress?: string; initialSide?: OrderSide }) {
  if (SPOT_ENABLED && isSpotSymbol(symbol)) {
    return (
      <div className="space-y-1">
        <SpotOrderTicket walletAddress={walletAddress} evmAddress={evmAddress} symbol={symbol} />
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <OrderEntry symbol={symbol} walletAddress={walletAddress} evmAddress={evmAddress} initialSide={initialSide} />
      <AgentSetup />
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
