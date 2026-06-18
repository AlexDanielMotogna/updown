'use client';

import { Positions } from './Positions';
import { useIdentity } from '@/hooks/useIdentity';

function WithIdentity({ devEvm }: { devEvm?: string }) {
  const { evmAddress } = useIdentity();
  return <Positions address={evmAddress ?? devEvm} />;
}

/** Positions for the connected EVM account (falls back to a dev address). */
export function PositionsPanel({ devEvm }: { devEvm?: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) return <Positions address={devEvm} />;
  return <WithIdentity devEvm={devEvm} />;
}
