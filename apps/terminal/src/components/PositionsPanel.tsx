'use client';

import { Positions } from './Positions';
import { useIdentity } from '@/hooks/useIdentity';

function WithIdentity({ devEvm, devWallet }: { devEvm?: string; devWallet?: string }) {
  const { evmAddress, walletAddress } = useIdentity();
  return <Positions address={evmAddress ?? devEvm} walletAddress={walletAddress ?? devWallet} />;
}

/** Positions/orders/trades for the connected EVM account (falls back to dev). */
export function PositionsPanel({ devEvm, devWallet }: { devEvm?: string; devWallet?: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <Positions address={devEvm} walletAddress={devWallet} />;
  return <WithIdentity devEvm={devEvm} devWallet={devWallet} />;
}
