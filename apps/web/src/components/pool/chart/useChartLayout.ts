'use client';

/**
 * Shared layout primitives for the chart subviews:
 *   - Resize-observed (width, height) of the chart's container.
 *   - Parsed numeric form of the candle list.
 *   - Derived chartW / chartH (container minus padding).
 *
 * Each subview (SnakeLineChart, CandlesChart) wires its own price-range,
 * X/Y mappings and hover logic - those are intentionally NOT centralized
 * here because the two views need different shapes (snake = time-anchored,
 * candles = index-based) and bundling them produces tangled state.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Candle } from '@/hooks';
import { CHART_PADDING } from './constants';

export interface ParsedCandle {
  o: number;
  h: number;
  l: number;
  c: number;
  t: number;
}

export interface ChartLayout {
  containerRef: React.RefObject<HTMLDivElement | null>;
  dims: { width: number; height: number };
  parsed: ParsedCandle[];
  chartW: number;
  chartH: number;
}

export function useChartLayout(candles: Candle[]): ChartLayout {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 340 });

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo<ParsedCandle[]>(
    () => candles.map((c) => ({
      o: parseFloat(c.o),
      h: parseFloat(c.h),
      l: parseFloat(c.l),
      c: parseFloat(c.c),
      t: c.t,
    })),
    [candles],
  );

  const chartW = dims.width - CHART_PADDING.left - CHART_PADDING.right;
  const chartH = dims.height - CHART_PADDING.top - CHART_PADDING.bottom;

  return { containerRef, dims, parsed, chartW, chartH };
}
