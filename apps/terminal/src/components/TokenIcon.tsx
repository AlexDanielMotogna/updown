'use client';

import { useEffect, useMemo, useState } from 'react';
import { IS_TESTNET } from '@/lib/api';

// A few HIP-3 equity perps resolve to company logos rather than coin icons.
const STOCK_LOGOS: Record<string, string> = {
  TSLA: 'https://companiesmarketcap.com/img/company-logos/64/TSLA.webp',
  NVDA: 'https://companiesmarketcap.com/img/company-logos/64/NVDA.webp',
  AAPL: 'https://companiesmarketcap.com/img/company-logos/64/AAPL.webp',
  GOOGL: 'https://companiesmarketcap.com/img/company-logos/64/GOOG.webp',
  AMZN: 'https://companiesmarketcap.com/img/company-logos/64/AMZN.webp',
  META: 'https://companiesmarketcap.com/img/company-logos/64/META.webp',
  MSFT: 'https://companiesmarketcap.com/img/company-logos/64/MSFT.webp',
};

export const baseSymbol = (s: string): string => (s.includes('-') ? s.split('-')[0] ?? s : s).toUpperCase();

function iconUrls(symbol: string): string[] {
  const b = baseSymbol(symbol);
  // HL hosts coin SVGs per network; try the active one first, then the other.
  const hosts = IS_TESTNET
    ? ['app.hyperliquid-testnet.xyz', 'app.hyperliquid.xyz']
    : ['app.hyperliquid.xyz', 'app.hyperliquid-testnet.xyz'];
  const urls = hosts.map((h) => `https://${h}/coins/${b}.svg`);
  if (STOCK_LOGOS[b]) urls.push(STOCK_LOGOS[b]);
  urls.push(`https://coinicons-api.vercel.app/api/icon/${b.toLowerCase()}`);
  return urls;
}

const SIZE: Record<string, string> = { xs: 'w-4 h-4', sm: 'w-5 h-5', md: 'w-6 h-6', lg: 'w-7 h-7' };
const FALLBACK_COLORS = [
  'bg-blue-500/30 text-blue-300',
  'bg-green-500/30 text-green-300',
  'bg-purple-500/30 text-purple-300',
  'bg-orange-500/30 text-orange-300',
  'bg-pink-500/30 text-pink-300',
  'bg-cyan-500/30 text-cyan-300',
  'bg-yellow-500/30 text-yellow-300',
  'bg-red-500/30 text-red-300',
];

/** Asset icon: HyperLiquid coin SVG → coinicons → colored letter fallback. */
export function TokenIcon({ symbol, size = 'sm', className = '' }: { symbol: string; size?: keyof typeof SIZE; className?: string }) {
  const urls = useMemo(() => iconUrls(symbol), [symbol]);
  const [i, setI] = useState(0);
  const [failed, setFailed] = useState(false);
  const b = baseSymbol(symbol);

  useEffect(() => {
    setI(0);
    setFailed(false);
  }, [symbol]);

  if (failed) {
    const cls = FALLBACK_COLORS[b.charCodeAt(0) % FALLBACK_COLORS.length];
    return (
      <div className={`${SIZE[size]} ${cls} flex shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${className}`} title={b}>
        {b.slice(0, 2)}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urls[i]}
      alt={b}
      // White backdrop + faint ring so black/transparent logos stay visible on the
      // dark UI (colored circular logos cover it, so they're unaffected).
      className={`${SIZE[size]} shrink-0 rounded-full bg-white object-cover ring-1 ring-black/10 ${className}`}
      onError={() => (i < urls.length - 1 ? setI(i + 1) : setFailed(true))}
      loading="lazy"
    />
  );
}
