import Link from 'next/link';
import { Chart } from '@/components/Chart';
import { Orderbook } from '@/components/Orderbook';
import { OrderPanel } from '@/components/OrderPanel';
import { PositionsPanel } from '@/components/PositionsPanel';

export const dynamic = 'force-dynamic';

export default function MarketPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  // Dev fallbacks (used only when not connected via Privy / not yet linked).
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  const devEvm = process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted text-sm hover:text-white">
          ← Markets
        </Link>
        <h1 className="text-lg font-semibold">{symbol}</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_300px_280px]">
        <Chart symbol={symbol} />
        <Orderbook symbol={symbol} />
        <OrderPanel symbol={symbol} devWallet={devWallet} />
      </div>

      <PositionsPanel devEvm={devEvm} />
    </div>
  );
}
