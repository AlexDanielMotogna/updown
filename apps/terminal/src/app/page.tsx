'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeMode } from '@/hooks/useTradeMode';
import { SimpleMarketsList } from '@/components/simple/SimpleMarketsList';

// Landing is mode-aware (PLAN-SIMPLE-MODE §3): Simple → the Kalshi-style markets
// list; Pro → straight to the full terminal on BTC.
//
// Mode is client-only (localStorage), so we render the shell ONLY after mount —
// otherwise SSR renders the Simple landing for everyone and a Pro (or stale)
// session flashes that old shell on load before correcting. Mirrors MarketShell.
export default function Home() {
  const [mode] = useTradeMode();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && mode === 'pro') router.replace('/market/BTC-USD');
  }, [mounted, mode, router]);

  if (!mounted || mode === 'pro') return null;
  return (
    <SimpleMarketsList
      devWallet={process.env.NEXT_PUBLIC_DEV_WALLET}
      devEvm={process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS}
    />
  );
}
