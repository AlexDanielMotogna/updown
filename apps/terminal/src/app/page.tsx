import { getTickers } from '@/lib/exchange';
import { MarketsTable } from '@/components/MarketsTable';
import { OrderEntry } from '@/components/OrderEntry';

// Server component: fetch initial markets from HyperLiquid on the server.
export const dynamic = 'force-dynamic';

export default async function Page() {
  let initial = [] as Awaited<ReturnType<typeof getTickers>>;
  let error: string | null = null;
  try {
    initial = await getTickers();
  } catch (e) {
    error = (e as Error).message;
  }

  // Until the unified Privy session lands (ADR-002), the Solana identity can be
  // injected for dev via NEXT_PUBLIC_DEV_WALLET so the trade flow is end-to-end.
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;

  return (
    <div className="mx-auto max-w-6xl space-y-3">
      <h1 className="text-lg font-semibold">Trade</h1>
      {error ? (
        <div className="rounded border border-down/40 bg-down/10 p-3 text-sm text-down">
          Failed to load markets: {error}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
          <MarketsTable initial={initial} />
          <OrderEntry symbol="BTC-USD" walletAddress={devWallet} />
        </div>
      )}
    </div>
  );
}
