import { getTickers, getSpotTickers } from '@/lib/exchange';
import { MarketShell } from '@/components/MarketShell';

export const dynamic = 'force-dynamic';

/**
 * Trade route. Human-readable URLs:
 *   /trade/PUMP/USDC       → perp PUMP-USD
 *   /trade/spot/PUMP/USDC  → spot PUMP/USDC (resolved to the HL coin "@N")
 *
 * Renamed from /market so it doesn't collide with the app's "Markets" nav
 * (predictions). The quote segment is cosmetic for perps (always USD-margined);
 * for spot it's matched against the pair's displayName to find the coin.
 */
export default async function TradePage({ params }: { params: { slug?: string[] } }) {
  const slug = (params.slug ?? []).map((s) => decodeURIComponent(s));
  const isSpot = slug[0]?.toLowerCase() === 'spot';
  const parts = isSpot ? slug.slice(1) : slug;
  const base = (parts[0] ?? 'BTC').toUpperCase();
  const quote = (parts[1] ?? 'USDC').toUpperCase();

  let symbol: string;
  let initial = null;
  if (isSpot) {
    const disp = `${base}/${quote}`;
    const spot = await getSpotTickers().catch(() => []);
    const match = spot.find((t) => (t.displayName ?? '').toUpperCase() === disp);
    symbol = match?.symbol ?? disp; // fallback keeps the page renderable
    initial = match ?? null;
  } else {
    symbol = `${base}-USD`;
    const tickers = await getTickers().catch(() => []);
    initial = tickers.find((t) => t.symbol === symbol) ?? null;
  }

  // Dev fallbacks (used only when not connected via Privy / not yet linked).
  const devWallet = process.env.NEXT_PUBLIC_DEV_WALLET;
  const devEvm = process.env.NEXT_PUBLIC_DEV_EVM_ADDRESS;

  return <MarketShell symbol={symbol} initial={initial} devWallet={devWallet} devEvm={devEvm} />;
}
