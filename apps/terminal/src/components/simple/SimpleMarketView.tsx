'use client';

import { useMemo } from 'react';
import { Chart } from '../Chart';
import { SimpleTradePanel } from './SimpleTradePanel';
import { SimplePosition } from './SimplePosition';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useIdentity } from '@/hooks/useIdentity';
import { useTradeRewardCredit } from '@/hooks/useTradeRewardCredit';

/**
 * Simple Mode market page (PLAN-SIMPLE-MODE §4.3): a clean chart + the same Simple
 * trade panel as the modal, plus this market's position card. No order book /
 * trades / funding — those stay in Pro.
 */
export function SimpleMarketView({ symbol, devWallet, devEvm }: { symbol: string; devWallet?: string; devEvm?: string }) {
  const id = useIdentity();
  const walletAddress = id.walletAddress ?? devWallet;
  const evmAddress = id.evmAddress ?? devEvm;
  // Instant trading rewards on fill, same as Pro.
  useTradeRewardCredit(walletAddress, evmAddress);

  const { positions } = useAccountStream(evmAddress);
  const pos = useMemo(() => positions.find((p) => p.symbol === symbol), [positions, symbol]);

  return (
    <div className="h-full overflow-y-auto">
    <div className="mx-auto flex max-w-6xl flex-col gap-3 p-2 lg:flex-row">
      {/* Chart + position */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="h-[340px] lg:h-[460px]">
          <Chart symbol={symbol} minimal />
        </div>
        {pos && <SimplePosition pos={pos} walletAddress={walletAddress} />}
      </div>

      {/* Trade panel */}
      <div className="lg:w-[360px] lg:shrink-0">
        <div className="overflow-hidden rounded-xl border border-surface-800 bg-surface-850">
          <SimpleTradePanel symbol={symbol} walletAddress={walletAddress} evmAddress={evmAddress} />
        </div>
      </div>
    </div>
    </div>
  );
}
