/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useRef } from 'react';
import { createTvDatafeed } from '@/lib/tvDatafeed';

declare global {
  interface Window { TradingView?: { widget: new (cfg: any) => any } }
}

// Load /charting_library/charting_library.js once (the licensed bundle served from
// public/). Shared promise so multiple charts don't inject the script twice.
let scriptPromise: Promise<void> | null = null;
function loadLibrary(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.TradingView?.widget) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = '/charting_library/charting_library.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('charting_library failed to load')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Full TradingView Charting Library chart, wired to the HL datafeed (tvDatafeed).
 * Recreates the widget on symbol change. Falls back to nothing if the library
 * isn't installed (the parent gates on NEXT_PUBLIC_TV_ENABLED). */
export function TVChart({ symbol }: { symbol: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    let dead = false;
    loadLibrary()
      .then(() => {
        if (dead || !ref.current || !window.TradingView) return;
        const widget = new window.TradingView.widget({
          container: ref.current,
          library_path: '/charting_library/',
          symbol,
          interval: '60',
          datafeed: createTvDatafeed(),
          autosize: true,
          theme: 'dark',
          timezone: 'Etc/UTC',
          locale: 'en',
          disabled_features: ['header_symbol_search', 'symbol_search_hot_key', 'header_compare'],
          loading_screen: { backgroundColor: '#0A121C' },
          overrides: {
            'paneProperties.background': '#0A121C',
            'paneProperties.backgroundType': 'solid',
            'scalesProperties.textColor': '#8a94a6',
          },
        });
        widgetRef.current = widget;
      })
      .catch(() => { /* library missing → parent fallback handles it */ });
    return () => {
      dead = true;
      try { widgetRef.current?.remove?.(); } catch { /* ignore */ }
      widgetRef.current = null;
    };
  }, [symbol]);

  return (
    <div className="card h-full w-full overflow-hidden">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
