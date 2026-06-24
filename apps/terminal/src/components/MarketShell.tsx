'use client';

import { useEffect, useState } from 'react';
import type { Ticker } from '@/lib/types';
import { TerminalLayout } from './TerminalLayout';
import { SimpleMarketView } from './simple/SimpleMarketView';
import { useTradeMode } from '@/hooks/useTradeMode';

/**
 * Picks the market shell by trade mode (PLAN-SIMPLE-MODE §3): Simple → the clean
 * SimpleMarketView, Pro → the full TerminalLayout. Renders after mount so a
 * returning Pro user never flashes the Simple shell (mode is client-only).
 */
export function MarketShell({ symbol, initial, devWallet, devEvm }: { symbol: string; initial?: Ticker | null; devWallet?: string; devEvm?: string }) {
  const [mode] = useTradeMode();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return mode === 'simple'
    ? <SimpleMarketView symbol={symbol} devWallet={devWallet} devEvm={devEvm} />
    : <TerminalLayout symbol={symbol} initial={initial} devWallet={devWallet} devEvm={devEvm} />;
}
