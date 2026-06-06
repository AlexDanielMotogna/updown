'use client';

/**
 * TradingView Lightweight Charts replacement for the hand-rolled SVG
 * SnakeLineChart + CandlesChart pair.
 *
 * The old implementation paid every price tick in React re-renders over
 * hundreds of `<path>` nodes - that's where the "jitter" the user
 * reported was coming from. LWC paints on canvas, animates the y-scale
 * transitions on its own, and exposes `series.update()` so a single
 * incoming tick costs one frame instead of a full reconcile.
 *
 * We render one chart instance and swap the active series when the user
 * toggles between line (Robinhood-style area) and candles (Binance-style
 * OHLC). Strike price is a horizontal price line on the active series.
 *
 * Notes for future tweaks:
 *  - `addCandlestickSeries` / `addAreaSeries` are LWC v4+; v5 changed
 *    casing (`addAreaSeries({...})` → `series.AreaSeries`). We're on v5;
 *    the imports below come from the v5 API.
 *  - LWC keeps its own time axis, scale, crosshair, tooltip. Don't try
 *    to overlay our own - they will fight for paints.
 */

import { useEffect, useMemo, useRef } from 'react';
import { Box } from '@mui/material';
import {
  createChart,
  CandlestickSeries,
  AreaSeries,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type AreaData,
  type UTCTimestamp,
  type IPriceLine,
  CrosshairMode,
  LineStyle,
} from 'lightweight-charts';
import type { Candle } from '@/hooks';
import { useThemeTokens } from '@/app/providers';

export type PriceChartMode = 'line' | 'candles';

interface PriceChartProps {
  candles: Candle[];
  mode: PriceChartMode;
  /** Optional live mark price; appended as the last point of the series
   *  on every render so the chart visibly tracks the websocket feed. */
  livePrice: number | null;
  /** Strike line for resolution-style pools (USDC scale already applied
   *  by the caller - InlineChart divides by USDC_DIVISOR before passing). */
  strikePrice: number | null;
}

// LWC takes second-based UTC timestamps for the time axis.
const toUtc = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

export function PriceChart({ candles, mode, livePrice, strikePrice }: PriceChartProps) {
  const t = useThemeTokens();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const areaSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const strikeLineRef = useRef<IPriceLine | null>(null);

  // Memoised data - derived once per candles array, reused across mode
  // switches so we don't refetch or recompute on every toggle.
  const candleData = useMemo<CandlestickData[]>(
    () =>
      candles.map((c) => ({
        time: toUtc(c.t),
        open: Number(c.o),
        high: Number(c.h),
        low: Number(c.l),
        close: Number(c.c),
      })),
    [candles],
  );
  const areaData = useMemo<AreaData[]>(
    () => candles.map((c) => ({ time: toUtc(c.t), value: Number(c.c) })),
    [candles],
  );

  // Chart instance lifecycle. We create the chart once and reuse it; only
  // the series + theme tokens change on subsequent renders.
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: 'transparent' },
        textColor: t.text.tertiary,
        fontFamily: 'var(--font-satoshi), "Satoshi", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 11,
        // Drop the TradingView attribution badge - already off on
        // OddsChart, parity for the crypto candle/area view.
        attributionLogo: false,
      },
      // Crosshair label (the time pill that follows the cursor) renders
      // in the user's locale; tickMarkFormatter below mirrors that on the
      // bottom axis so both surfaces agree.
      localization: {
        timeFormatter: (time: number) => {
          const d = new Date(time * 1000);
          return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
        },
      },
      // Grid off - same minimalist look as OddsChart. The axis tick
      // labels are enough of a visual anchor on a clean canvas.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: t.border.medium, width: 1, style: LineStyle.Dashed, labelBackgroundColor: t.bg.surfaceAlt },
        horzLine: { color: t.border.medium, width: 1, style: LineStyle.Dashed, labelBackgroundColor: t.bg.surfaceAlt },
      },
      rightPriceScale: {
        // No border line down the right edge - the tick labels alone do
        // the work, no rule needed (same as OddsChart).
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        // Likewise no rule under the bottom axis.
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        // X-axis tick labels in the user's timezone. LWC defaults to UTC
        // for tick ticks even when localization.timeFormatter is set -
        // that one only covers the crosshair label. Branching on
        // tickMarkType keeps "HH:mm" for intra-day zoom and falls back to
        // "MMM d" / "MMM" / "YYYY" at coarser scales.
        tickMarkFormatter: (time: number, tickMarkType: number) => {
          const d = new Date(time * 1000);
          if (tickMarkType >= 3) {
            return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
          }
          if (tickMarkType === 2) {
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
          }
          if (tickMarkType === 1) {
            return d.toLocaleDateString(undefined, { month: 'short' });
          }
          return d.getFullYear().toString();
        },
      },
      autoSize: true,
    });
    chartRef.current = chart;

    return () => {
      strikeLineRef.current = null;
      candleSeriesRef.current = null;
      areaSeriesRef.current = null;
      chart.remove();
      chartRef.current = null;
    };
    // The chart instance survives theme tweaks (we apply them via
    // applyOptions below). Re-creating it on every theme change would
    // strobe the canvas, so we intentionally exclude `t` from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme propagation - runs on every theme change without dropping the
  // chart instance.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.applyOptions({
      layout: { textColor: t.text.tertiary },
      // Grid stays off across theme swaps too.
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      // Keep the axis borders hidden across theme swaps - otherwise a
      // dark↔light flip would silently turn the rule back on with the
      // new colour.
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false },
    });
  }, [t.text.tertiary, t.border.subtle]);

  // Mode swap - remove the inactive series, attach the active one, push
  // the current dataset, and fit the visible range.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Drop whichever series isn't active anymore.
    if (mode === 'candles' && areaSeriesRef.current) {
      chart.removeSeries(areaSeriesRef.current);
      areaSeriesRef.current = null;
    }
    if (mode === 'line' && candleSeriesRef.current) {
      chart.removeSeries(candleSeriesRef.current);
      candleSeriesRef.current = null;
    }

    if (mode === 'candles' && !candleSeriesRef.current) {
      candleSeriesRef.current = chart.addSeries(CandlestickSeries, {
        upColor: t.up,
        downColor: t.down,
        borderUpColor: t.up,
        borderDownColor: t.down,
        wickUpColor: t.up,
        wickDownColor: t.down,
      });
    }
    if (mode === 'line' && !areaSeriesRef.current) {
      areaSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: t.up,
        topColor: `${t.up}55`,
        bottomColor: `${t.up}00`,
        lineWidth: 2,
      });
    }

    if (mode === 'candles' && candleSeriesRef.current) {
      candleSeriesRef.current.setData(candleData);
    }
    if (mode === 'line' && areaSeriesRef.current) {
      areaSeriesRef.current.setData(areaData);
    }
    chart.timeScale().fitContent();
  }, [mode, candleData, areaData, t.up, t.down]);

  // Live price extension. Pacifica's websocket emits the *currently open*
  // candle's close every tick; we mirror that on the chart with
  // series.update which is the canonical LWC live-feed path. Without
  // this, the chart would only refresh on the next candle close.
  useEffect(() => {
    if (livePrice == null || candles.length === 0) return;
    const last = candles[candles.length - 1];
    const t0 = toUtc(last.t);
    if (mode === 'candles' && candleSeriesRef.current) {
      candleSeriesRef.current.update({
        time: t0,
        open: Number(last.o),
        high: Math.max(Number(last.h), livePrice),
        low: Math.min(Number(last.l), livePrice),
        close: livePrice,
      });
    }
    if (mode === 'line' && areaSeriesRef.current) {
      areaSeriesRef.current.update({ time: t0, value: livePrice });
    }
  }, [livePrice, mode, candles]);

  // Strike price horizontal line. We re-attach it to whatever series is
  // active so a mode swap doesn't leave the old line orphaned.
  useEffect(() => {
    const series = mode === 'candles' ? candleSeriesRef.current : areaSeriesRef.current;
    if (!series) return;

    if (strikeLineRef.current) {
      series.removePriceLine(strikeLineRef.current);
      strikeLineRef.current = null;
    }
    if (strikePrice != null && Number.isFinite(strikePrice)) {
      strikeLineRef.current = series.createPriceLine({
        price: strikePrice,
        color: t.accent,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'Strike',
      });
    }
  }, [strikePrice, mode, t.accent]);

  return <Box ref={containerRef} sx={{ width: '100%', height: '100%' }} />;
}
