'use client';

import { useMemo } from 'react';
import { usePacificaCandles } from './usePacificaCandles';
import {
  analyzeMarket,
  parseCandlesToTA,
  derivePoolTimeframe,
  getIntervalForTimeframe,
  getHistoryDuration,
  type AnalysisResult,
  type Timeframe,
} from '@/lib/technical-analysis';

interface UseMarketAnalysisOptions {
  asset: string;
  startTime: string;
  endTime: string;
  enabled?: boolean;
}

export function useMarketAnalysis({ asset, startTime, endTime, enabled = true }: UseMarketAnalysisOptions) {
  const timeframe = useMemo(() => derivePoolTimeframe(startTime, endTime), [startTime, endTime]);
  const interval = getIntervalForTimeframe(timeframe);
  const durationMs = getHistoryDuration(timeframe);

  const { candles, loading, error } = usePacificaCandles({
    symbol: asset,
    interval,
    durationMs,
    enabled,
  });

  const analysis: AnalysisResult | null = useMemo(() => {
    if (!candles.length) return null;
    const taCandles = parseCandlesToTA(candles);
    return analyzeMarket(taCandles, timeframe);
  }, [candles, timeframe]);

  return { analysis, timeframe, loading, error };
}
