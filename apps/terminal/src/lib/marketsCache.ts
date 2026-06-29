'use client';

import { useEffect, useState } from 'react';
import type { Ticker } from './types';
import { pollWhileVisible } from './poll';

/**
 * Client-side cache + in-flight de-dupe for /api/markets. The catalog, the order
 * tickets, the chart header and the selector all want the same data — without this
 * each fired its own request on its own timer. Now concurrent callers share one
 * fetch + a short cache, and both perp & spot stay cached so the Simple toggle is
 * instant (no skeleton/refetch on switch).
 */
const TTL_MS = 10_000;
type Kind = 'perp' | 'spot';
const cache = new Map<Kind, { data: Ticker[]; expires: number }>();
const inflight = new Map<Kind, Promise<Ticker[]>>();

const urlFor = (kind: Kind) => (kind === 'spot' ? '/api/markets?kind=spot' : '/api/markets');

export async function getMarketsCached(kind: Kind, force = false): Promise<Ticker[]> {
  const now = Date.now();
  const hit = cache.get(kind);
  if (!force && hit && hit.expires > now) return hit.data;
  let p = inflight.get(kind);
  if (!p) {
    p = fetch(urlFor(kind), { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => {
        const data = (j?.success ? (j.data as Ticker[]) : []) ?? [];
        cache.set(kind, { data, expires: Date.now() + TTL_MS });
        return data;
      })
      .finally(() => inflight.delete(kind));
    inflight.set(kind, p);
  }
  return p;
}

/** Last cached markets for a kind (no fetch) — for instant first paint. */
export function peekMarkets(kind: Kind): Ticker[] | null {
  return cache.get(kind)?.data ?? null;
}

/** Cached markets for a kind with a visibility-aware background refresh. Returns the
 * cached list instantly on mount (so the perp↔spot toggle never flashes a skeleton
 * once both are warm). */
export function useMarkets(kind: Kind, refreshMs = 15_000): Ticker[] {
  const [tickers, setTickers] = useState<Ticker[]>(() => peekMarkets(kind) ?? []);

  useEffect(() => {
    let alive = true;
    const load = () => getMarketsCached(kind).then((d) => { if (alive) setTickers(d); }).catch(() => {});
    const cached = peekMarkets(kind);
    setTickers(cached ?? []); // instant if warm, empty (skeleton) if cold
    load();
    const stop = pollWhileVisible(load, refreshMs);
    return () => { alive = false; stop(); };
  }, [kind, refreshMs]);

  return tickers;
}
