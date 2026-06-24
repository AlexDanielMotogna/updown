import { getTickers } from '@/lib/exchange';
import { MarketShell } from '@/components/MarketShell';

export const dynamic = 'force-dynamic';

export default async function MarketPage({ params }: { params: { symbol: string } }) {
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  const tickers = await getTickers().catch(() => []);
  const initial = tickers.find((t) => t.symbol === symbol) ?? null;

  // Dev fallbacks (used only when not connected via Privy / not yet linked).
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  const devEvm = process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS;

  return <MarketShell symbol={symbol} initial={initial} devWallet={devWallet} devEvm={devEvm} />;
}
