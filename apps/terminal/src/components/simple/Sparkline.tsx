'use client';

import { useEffect, useState } from 'react';

/** Tiny inline price sparkline from /api/klines (no TradingView). Fetches once on
 *  mount — the klines route is cached + in-flight-deduped server-side, so many rows
 *  are cheap. Green/red by net direction over the window. */
export function Sparkline({ symbol, width = 96, height = 28 }: { symbol: string; width?: number; height?: number }) {
  const [pts, setPts] = useState<number[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=1h`, { cache: 'no-store' });
        const j = await r.json();
        if (!alive || !j.success) return;
        const closes = (j.data as Array<{ close: string }>).slice(-24).map((c) => Number(c.close)).filter(Number.isFinite);
        setPts(closes);
      } catch {/* leave empty */}
    })();
    return () => { alive = false; };
  }, [symbol]);

  if (pts.length < 2) return <div style={{ width, height }} className="opacity-40" />;

  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const dx = width / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * dx).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  const color = up ? '#26A69A' : '#EF5350'; // win-500 / loss-500

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block">
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
