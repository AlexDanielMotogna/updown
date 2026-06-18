'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type Time,
} from 'lightweight-charts';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Interval = (typeof INTERVALS)[number];

interface RawCandle {
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
}

export function Chart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ReturnType<IChartApi['addCandlestickSeries']> | null>(null);
  const [interval, setInterval] = useState<Interval>('1h');
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      layout: { background: { type: ColorType.Solid, color: '#141821' }, textColor: '#8a94a6' },
      grid: { vertLines: { color: '#1b212c' }, horzLines: { color: '#1b212c' } },
      timeScale: { borderColor: '#232a36', timeVisible: true },
      rightPriceScale: { borderColor: '#232a36' },
      height: 360,
      autoSize: true,
    });
    const series = chart.addCandlestickSeries({
      upColor: '#16c784',
      downColor: '#ea3943',
      borderVisible: false,
      wickUpColor: '#16c784',
      wickDownColor: '#ea3943',
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candles on symbol/interval change.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!alive) return;
        if (!json.success) throw new Error(json.error?.message ?? 'failed');
        const data: CandlestickData[] = (json.data as RawCandle[]).map((c) => ({
          time: (c.timestamp / 1000) as Time,
          open: Number(c.open),
          high: Number(c.high),
          low: Number(c.low),
          close: Number(c.close),
        }));
        seriesRef.current?.setData(data);
        chartRef.current?.timeScale().fitContent();
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, [symbol, interval]);

  return (
    <div className="rounded border border-border bg-bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2 text-sm">
        <span className="font-semibold">{symbol}</span>
        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={`rounded px-1.5 py-0.5 text-xs ${
                interval === i ? 'bg-bg-elevated text-white' : 'text-muted hover:text-white'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[360px] w-full" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted">
            {status === 'loading' ? 'loading chart…' : 'failed to load chart'}
          </div>
        )}
      </div>
    </div>
  );
}
