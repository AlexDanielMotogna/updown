'use client';

import dynamic from 'next/dynamic';
import { Chart } from './Chart';
import { useIdentity } from '@/hooks/useIdentity';

// TVChart pulls the licensed library at runtime — load it client-only and only when
// enabled. Falls back to the lightweight Chart otherwise (and always for Simple's
// minimal chart, which doesn't need the full widget).
const TVChart = dynamic(() => import('./TVChart').then((m) => m.TVChart), { ssr: false });
const TV_ENABLED = process.env.NEXT_PUBLIC_TV_ENABLED === 'true';
const HAS_PRIVY = !!process.env.NEXT_PUBLIC_PRIVY_APP_ID;

// Resolve the live identity (only under Privy) so the chart can draw the entry line
// for the user's position/holding. useIdentity needs the Privy provider.
function TVWithIdentity({ symbol, devWallet, devEvm }: { symbol: string; devWallet?: string; devEvm?: string }) {
  const { walletAddress, evmAddress } = useIdentity();
  return <TVChart symbol={symbol} walletAddress={walletAddress ?? devWallet} evmAddress={evmAddress ?? devEvm} />;
}

export function ChartView({ symbol, minimal = false, devWallet, devEvm }: { symbol: string; minimal?: boolean; devWallet?: string; devEvm?: string }) {
  if (!TV_ENABLED || minimal) return <Chart symbol={symbol} minimal={minimal} />;
  if (!HAS_PRIVY) return <TVChart symbol={symbol} walletAddress={devWallet} evmAddress={devEvm} />;
  return <TVWithIdentity symbol={symbol} devWallet={devWallet} devEvm={devEvm} />;
}
