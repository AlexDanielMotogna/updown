import Link from 'next/link';
import { Chart } from '@/components/Chart';
import { Orderbook } from '@/components/Orderbook';
import { OrderEntry } from '@/components/OrderEntry';
import { Positions } from '@/components/Positions';

export const dynamic = 'force-dynamic';

export default function MarketPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  // Dev identity injection until Privy SSO (ADR-002): Solana wallet for writes,
  // EVM account for position reads.
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  const devEvmAddress = process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS;

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
        <OrderEntry symbol={symbol} walletAddress={devWallet} />
      </div>

      <Positions address={devEvmAddress} />
    </div>
  );
}
