'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { Candle } from '@/hooks';
import { PADDING, type ChartType } from './chart-utils';

export function useChartLayout(candles: Candle[], chartType: ChartType) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 340 });
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [hoverY, setHoverY] = useState<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ width, height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const parsed = useMemo(
    () =>
      candles.map((c) => ({
        o: parseFloat(c.o),
        h: parseFloat(c.h),
        l: parseFloat(c.l),
        c: parseFloat(c.c),
        t: c.t,
      })),
    [candles],
  );

  const { maxPrice, priceRange } = useMemo(() => {
    if (parsed.length === 0) return { maxPrice: 0, priceRange: 1 };
    let min: number, max: number;
    if (chartType === 'candles') {
      min = Math.min(...parsed.map((p) => p.l));
      max = Math.max(...parsed.map((p) => p.h));
    } else {
      min = Math.min(...parsed.map((p) => p.c));
      max = Math.max(...parsed.map((p) => p.c));
    }
    const pad = (max - min) * 0.08 || max * 0.01;
    return { maxPrice: max + pad, priceRange: max - min + pad * 2 };
  }, [parsed, chartType]);

  const chartW = dims.width - PADDING.left - PADDING.right;
  const chartH = dims.height - PADDING.top - PADDING.bottom;

  const toX = useCallback(
    (i: number) => PADDING.left + (i / Math.max(parsed.length - 1, 1)) * chartW,
    [parsed.length, chartW],
  );
  const toY = useCallback(
    (price: number) => PADDING.top + ((maxPrice - price) / priceRange) * chartH,
    [maxPrice, priceRange, chartH],
  );

  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i < 5; i++) {
      const price = maxPrice - (i / 4) * priceRange;
      ticks.push({ price, y: toY(price) });
    }
    return ticks;
  }, [maxPrice, priceRange, toY]);

  const xTicks = useMemo(() => {
    if (parsed.length === 0) return [];
    const count = Math.min(5, parsed.length);
    const ticks = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.round((i / (count - 1)) * (parsed.length - 1));
      ticks.push({ time: parsed[idx].t, x: toX(idx) });
    }
    return ticks;
  }, [parsed, toX]);

  const hoverPrice = useMemo(() => {
    if (hoverY === null) return null;
    return maxPrice - ((hoverY - PADDING.top) / chartH) * priceRange;
  }, [hoverY, maxPrice, priceRange, chartH]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (parsed.length === 0) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left - PADDING.left;
      const y = e.clientY - rect.top;
      const idx = Math.round((x / chartW) * (parsed.length - 1));
      if (idx >= 0 && idx < parsed.length) setHoverIndex(idx);
      if (y >= PADDING.top && y <= PADDING.top + chartH) setHoverY(y);
    },
    [parsed.length, chartW, chartH],
  );

  const handleMouseLeave = useCallback(() => {
    setHoverIndex(null);
    setHoverY(null);
  }, []);

  return { containerRef, dims, parsed, chartW, chartH, toX, toY, yTicks, xTicks, hoverIndex, hoverY, hoverPrice, setHoverIndex, handleMouseMove, handleMouseLeave };
}
