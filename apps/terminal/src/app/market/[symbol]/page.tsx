import { getTickers } from '@/lib/exchange';
import { MarketHeader } from '@/components/MarketHeader';
import { Chart } from '@/components/Chart';
import { Orderbook } from '@/components/Orderbook';
import { OrderPanel } from '@/components/OrderPanel';
import { PositionsPanel } from '@/components/PositionsPanel';

export const dynamic = 'force-dynamic';

export default async function MarketPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const tickers = await getTickers().catch(() => []);
  const initial = tickers.find((t) => t.symbol === symbol) ?? null;

  // Dev fallbacks (used only when not connected via Privy / not yet linked).
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  const devEvm = process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS;

  return (
    <div className="space-y-1">
      <MarketHeader symbol={symbol} initial={initial} />

      <div className="grid gap-1 xl:grid-cols-5">
        {/* Left: order book + chart, then positions below */}
        <div className="flex flex-col gap-1 xl:col-span-4">
          <div className="grid grid-cols-1 gap-1 lg:grid-cols-12">
            <div className="h-[300px] lg:col-span-3 lg:h-[520px]">
              <Orderbook symbol={symbol} />
            </div>
            <div className="h-[420px] lg:col-span-9 lg:h-[520px]">
              <Chart symbol={symbol} />
            </div>
          </div>
          <PositionsPanel devEvm={devEvm} />
        </div>

        {/* Right: order entry + agent setup */}
        <div className="xl:col-span-1">
          <OrderPanel symbol={symbol} devWallet={devWallet} />
        </div>
      </div>
    </div>
  );
}
