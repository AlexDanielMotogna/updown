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

/** Full TradingView Charting Library chart, wired to the HL datafeed. Shows B/S
 * trade marks on the bars for the user's own fills (via the datafeed's getMarks,
 * which needs the EVM address). Recreated on symbol change. */
export function TVChart({ symbol, evmAddress }: { symbol: string; evmAddress?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const cleanupMarks = useRef<(() => void) | null>(null);

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
          datafeed: createTvDatafeed(evmAddress),
          autosize: true,
          theme: 'dark',
          custom_css_url: 'charting-theme.css',
          timezone: 'Etc/UTC',
          locale: 'en',
          disabled_features: ['header_symbol_search', 'symbol_search_hot_key', 'header_compare'],
          loading_screen: { backgroundColor: '#0A121C', foregroundColor: '#5FD8EF' },
          toolbar_bg: '#0A121C',
          overrides: {
            'paneProperties.background': '#0A121C',
            'paneProperties.backgroundType': 'solid',
            'paneProperties.vertGridProperties.color': '#121A26',
            'paneProperties.horzGridProperties.color': '#121A26',
            'scalesProperties.backgroundColor': '#0A121C',
            'scalesProperties.textColor': '#8a94a6',
            'scalesProperties.lineColor': '#232a36',
            'mainSeriesProperties.candleStyle.upColor': '#26A69A',
            'mainSeriesProperties.candleStyle.downColor': '#EF5350',
            'mainSeriesProperties.candleStyle.borderUpColor': '#26A69A',
            'mainSeriesProperties.candleStyle.borderDownColor': '#EF5350',
            'mainSeriesProperties.candleStyle.wickUpColor': '#26A69A',
            'mainSeriesProperties.candleStyle.wickDownColor': '#EF5350',
          },
        });
        widgetRef.current = widget;
        // TradingView only requests marks on load/range change — refresh them so a
        // just-placed trade shows up: periodically + on order/spot-trade events.
        widget.onChartReady?.(() => {
          if (dead) return;
          const refresh = () => { try { widget.activeChart().refreshMarks(); } catch { /* not ready */ } };
          const id = window.setInterval(refresh, 15000);
          const onTraded = () => refresh();
          window.addEventListener('updown:spot-traded', onTraded);
          window.addEventListener('updown:order-filled', onTraded);
          cleanupMarks.current = () => {
            window.clearInterval(id);
            window.removeEventListener('updown:spot-traded', onTraded);
            window.removeEventListener('updown:order-filled', onTraded);
          };
        });
      })
      .catch(() => { /* library missing → parent fallback handles it */ });
    return () => {
      dead = true;
      cleanupMarks.current?.();
      cleanupMarks.current = null;
      try { widgetRef.current?.remove?.(); } catch { /* ignore */ }
      widgetRef.current = null;
    };
  }, [symbol, evmAddress]);

  return (
    <div className="card h-full w-full overflow-hidden">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
