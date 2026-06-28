'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Ticker } from '@/lib/types';
import { TerminalLayout } from './TerminalLayout';
import { useTradeMode } from '@/hooks/useTradeMode';

/**
 * Market shell. Pro → the full TerminalLayout. Simple mode has NO market detail
 * page (the markets list + trade modal cover it), so a Simple session that lands
 * on /trade/X is sent back to the markets list. Renders after mount so a
 * returning Pro user never flashes the wrong shell (mode is client-only).
 */
export function MarketShell({ symbol, initial, devWallet, devEvm }: { symbol: string; initial?: Ticker | null; devWallet?: string; devEvm?: string }) {
  const [mode] = useTradeMode();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (mounted && mode === 'simple') router.replace('/');
  }, [mounted, mode, router]);

  if (!mounted || mode === 'simple') return null;
  return <TerminalLayout symbol={symbol} initial={initial} devWallet={devWallet} devEvm={devEvm} />;
}
