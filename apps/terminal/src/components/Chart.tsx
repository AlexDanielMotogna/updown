'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createChart,
  ColorType,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type LineData,
  type Time,
} from 'lightweight-charts';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h', '1d'] as const;
type Interval = (typeof INTERVALS)[number];

const INDICATORS = [
  { id: 'ma7', period: 7, color: '#f0b90b', label: 'MA 7' },
  { id: 'ma25', period: 25, color: '#5196c9', label: 'MA 25' },
  { id: 'ma99', period: 99, color: '#e070c0', label: 'MA 99' },
] as const;

interface RawCandle { timestamp: number; open: string; high: string; low: string; close: string }

/** Simple moving average of closes → line series points. */
function sma(candles: CandlestickData[], period: number): LineData[] {
  const out: LineData[] = [];
  for (let i = period - 1; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
    out.push({ time: candles[i].time, value: sum / period });
  }
  return out;
}

export function Chart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const indicatorRefs = useRef<Map<string, ISeriesApi<'Line'>>>(new Map());
  const candlesRef = useRef<CandlestickData[]>([]);
  const [interval, setInterval] = useState<Interval>('1h');
  const [enabled, setEnabled] = useState<Set<string>>(new Set());
  const [showInd, setShowInd] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      // Match the panels' background (.card → bg-surface-850 = #0A121C).
      layout: { background: { type: ColorType.Solid, color: '#0A121C' }, textColor: '#8a94a6' },
      grid: { vertLines: { color: '#121A26' }, horzLines: { color: '#121A26' } },
      timeScale: { borderColor: '#232a36', timeVisible: true },
      rightPriceScale: { borderColor: '#232a36' },
      autoSize: true,
    });
    seriesRef.current = chart.addCandlestickSeries({
      upColor: '#26A69A', downColor: '#EF5350', borderVisible: false,
      wickUpColor: '#26A69A', wickDownColor: '#EF5350',
    });
    chartRef.current = chart;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      indicatorRefs.current.clear();
    };
  }, []);

  // Sync indicator line series with the enabled set + current candles.
  function applyIndicators() {
    const chart = chartRef.current;
    if (!chart) return;
    for (const ind of INDICATORS) {
      const existing = indicatorRefs.current.get(ind.id);
      if (enabled.has(ind.id)) {
        const series = existing ?? chart.addLineSeries({ color: ind.color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        if (!existing) indicatorRefs.current.set(ind.id, series);
        series.setData(sma(candlesRef.current, ind.period));
      } else if (existing) {
        chart.removeSeries(existing);
        indicatorRefs.current.delete(ind.id);
      }
    }
  }

  // Load candles on symbol/interval change.
  useEffect(() => {
    let alive = true;
    setStatus('loading');
    (async () => {
      try {
        const res = await fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}`, { cache: 'no-store' });
        const json = await res.json();
        if (!alive) return;
        if (!json.success) throw new Error(json.error?.message ?? 'failed');
        const data: CandlestickData[] = (json.data as RawCandle[]).map((c) => ({
          time: (c.timestamp / 1000) as Time,
          open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close),
        }));
        candlesRef.current = data;
        seriesRef.current?.setData(data);
        applyIndicators();
        chartRef.current?.timeScale().fitContent();
        setStatus('ready');
      } catch {
        if (alive) setStatus('error');
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]);

  // Re-apply when toggling indicators.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { applyIndicators(); }, [enabled]);

  function toggle(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="card flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-3 py-1.5 text-xs">
        <div className="flex items-center gap-0.5">
          {INTERVALS.map((i) => (
            <button
              key={i}
              onClick={() => setInterval(i)}
              className={`rounded px-1.5 py-1 ${interval === i ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}
            >
              {i}
            </button>
          ))}
        </div>
        <span className="text-surface-700">|</span>
        <div className="relative">
          <button
            onClick={() => setShowInd((v) => !v)}
            className={`flex items-center gap-1 rounded px-1.5 py-1 ${showInd || enabled.size ? 'text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}
          >
            <span className="italic">fx</span> Indicators {enabled.size > 0 && <span className="text-surface-500">({enabled.size})</span>}
          </button>
          {showInd && (
            <div className="absolute left-0 top-full z-20 mt-1 w-32 card-elevated">
              {INDICATORS.map((ind) => (
                <button
                  key={ind.id}
                  onClick={() => toggle(ind.id)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-surface-800"
                >
                  <span className={`h-3 w-3 rounded-sm border ${enabled.has(ind.id) ? 'border-transparent' : 'border-surface-600'}`} style={{ background: enabled.has(ind.id) ? ind.color : 'transparent' }} />
                  <span style={{ color: ind.color }}>{ind.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* TradingView attribution — REQUIRED by the lightweight-charts license
            (text-based link back to tradingview.com). Do not remove. */}
        <a
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto text-2xs text-surface-500 hover:text-surface-300"
        >
          Charts by TradingView
        </a>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="h-full w-full" />
        {status !== 'ready' && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-surface-400">
            {status === 'loading' ? 'loading chart…' : 'failed to load chart'}
          </div>
        )}
      </div>
    </div>
  );
}
