'use client';

import dynamic from 'next/dynamic';
import { Chart } from './Chart';

// TVChart pulls the licensed library at runtime — load it client-only and only when
// enabled. Falls back to the lightweight Chart otherwise (and always for Simple's
// minimal chart, which doesn't need the full widget).
const TVChart = dynamic(() => import('./TVChart').then((m) => m.TVChart), { ssr: false });
const TV_ENABLED = process.env.NEXT_PUBLIC_TV_ENABLED === 'true';

export function ChartView({ symbol, minimal = false }: { symbol: string; minimal?: boolean }) {
  if (TV_ENABLED && !minimal) return <TVChart symbol={symbol} />;
  return <Chart symbol={symbol} minimal={minimal} />;
}
