'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTradeMode } from '@/hooks/useTradeMode';
import { SimpleMarketsList } from '@/components/simple/SimpleMarketsList';

// Landing is mode-aware (PLAN-SIMPLE-MODE §3): Simple → the Kalshi-style markets
// list; Pro → straight to the full terminal on BTC.
export default function Home() {
  const [mode] = useTradeMode();
  const router = useRouter();

  useEffect(() => {
    if (mode === 'pro') router.replace('/market/BTC-USD');
  }, [mode, router]);

  if (mode === 'pro') return null;
  return (
    <SimpleMarketsList
      devWallet={process.env.NEXT_PUBLIC_DEV_WALLET}
      devEvm={process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS}
    />
  );
}
