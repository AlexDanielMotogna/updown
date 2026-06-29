/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useEffect, useMemo, useRef } from 'react';
import { createTvDatafeed } from '@/lib/tvDatafeed';
import { useAccountStream } from '@/hooks/useAccountStream';
import { useSpotHoldings } from './Holdings';
import { useMarkets } from '@/lib/marketsCache';
import { isSpotSymbol } from '@/lib/api';

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

interface Entry { price: number; side: 'LONG' | 'SHORT' }

const fmtPx = (n: number) => (n >= 1000 ? n.toFixed(2) : n >= 1 ? n.toFixed(3) : n >= 0.01 ? n.toFixed(5) : n.toPrecision(4));

/** Full TradingView Charting Library chart, wired to the HL datafeed. Draws a
 * horizontal "Entry" line at the open position's / spot holding's average price for
 * the current symbol. Recreates the widget on symbol change. */
export function TVChart({ symbol, walletAddress, evmAddress }: { symbol: string; walletAddress?: string; evmAddress?: string }) {
  const { positions } = useAccountStream(evmAddress);
  const spot = isSpotSymbol(symbol);
  const spotMarkets = useMarkets('spot');
  const holdings = useSpotHoldings(walletAddress);

  // Entry for the current symbol: perps → position entryPrice + side; spot → avg
  // cost (entryNotional / total) of the held token, always a "long".
  const entry: Entry | null = useMemo(() => {
    if (spot) {
      const base = (spotMarkets.find((m) => m.symbol === symbol)?.displayName ?? '').split('/')[0];
      if (!base) return null;
      const h = holdings.balances.find((b) => b.asset === base);
      const total = Number(h?.total ?? 0);
      const notional = Number(h?.entryNotional ?? 0);
      if (!(total > 0) || !(notional > 0)) return null;
      return { price: notional / total, side: 'LONG' };
    }
    const p = positions.find((pp) => pp.symbol === symbol);
    if (!p || !(Number(p.entryPrice) > 0)) return null;
    return { price: Number(p.entryPrice), side: p.side as 'LONG' | 'SHORT' };
  }, [spot, symbol, spotMarkets, holdings.balances, positions]);

  const ref = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);
  const readyRef = useRef(false);
  const shapeRef = useRef<any>(null);
  const entryRef = useRef<Entry | null>(null);
  entryRef.current = entry;

  const drawEntry = () => {
    const w = widgetRef.current;
    if (!w || !readyRef.current) return;
    let chart: any;
    try { chart = w.activeChart(); } catch { return; }
    if (shapeRef.current != null) { try { chart.removeEntity(shapeRef.current); } catch { /* gone */ } shapeRef.current = null; }
    const e = entryRef.current;
    if (!e) return;
    const color = e.side === 'SHORT' ? '#EF5350' : '#26A69A';
    try {
      shapeRef.current = chart.createShape(
        { time: Math.floor(Date.now() / 1000), price: e.price },
        {
          shape: 'horizontal_line',
          lock: true,
          disableSelection: true,
          disableSave: true,
          disableUndo: true,
          overrides: {
            linecolor: color,
            linewidth: 1,
            linestyle: 2, // dashed
            showLabel: true,
            text: `Entry ${fmtPx(e.price)}`,
            textcolor: color,
            horzLabelsAlign: 'right',
            vertLabelsAlign: 'bottom',
          },
        },
      );
    } catch { /* createShape unsupported / chart not ready */ }
  };

  // Create the widget on symbol change.
  useEffect(() => {
    let dead = false;
    readyRef.current = false;
    shapeRef.current = null;
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
        widget.onChartReady?.(() => {
          if (dead) return;
          readyRef.current = true;
          drawEntry();
        });
      })
      .catch(() => { /* library missing → parent fallback handles it */ });
    return () => {
      dead = true;
      readyRef.current = false;
      try { widgetRef.current?.remove?.(); } catch { /* ignore */ }
      widgetRef.current = null;
      shapeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol]);

  // Redraw the entry line when the position/holding changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { drawEntry(); }, [entry]);

  return (
    <div className="card h-full w-full overflow-hidden">
      <div ref={ref} className="h-full w-full" />
    </div>
  );
}
