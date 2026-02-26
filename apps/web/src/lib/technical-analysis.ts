// ---------------------------------------------------------------------------
// Technical Analysis Engine — Pure functions, zero dependencies
// ---------------------------------------------------------------------------

export interface TACandle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

export type Signal = 'UP' | 'DOWN';

export interface IndicatorResult {
  name: string;
  signal: Signal;
  strength: number; // 0-1
  value: string;    // human-readable value
}

export interface AnalysisResult {
  signal: Signal;
  confidence: number;  // 30-95
  indicators: IndicatorResult[];
  explanation: string;
  timestamp: number;
}

export type Timeframe = '1m' | '3m' | '5m' | '15m' | '30m' | '1h';

// ---------------------------------------------------------------------------
// Timeframe-adaptive parameters
// ---------------------------------------------------------------------------

interface TAParams {
  rsiPeriod: number;
  emaFast: number;
  emaSlow: number;
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
  bbPeriod: number;
  momentumPeriod: number;
}

const TIMEFRAME_PARAMS: Record<Timeframe, TAParams> = {
  '1m':  { rsiPeriod: 7,  emaFast: 5,  emaSlow: 13, macdFast: 6,  macdSlow: 13, macdSignal: 5, bbPeriod: 10, momentumPeriod: 5 },
  '3m':  { rsiPeriod: 9,  emaFast: 7,  emaSlow: 16, macdFast: 8,  macdSlow: 17, macdSignal: 6, bbPeriod: 14, momentumPeriod: 7 },
  '5m':  { rsiPeriod: 10, emaFast: 8,  emaSlow: 21, macdFast: 10, macdSlow: 21, macdSignal: 7, bbPeriod: 16, momentumPeriod: 8 },
  '15m': { rsiPeriod: 14, emaFast: 9,  emaSlow: 26, macdFast: 12, macdSlow: 26, macdSignal: 9, bbPeriod: 20, momentumPeriod: 10 },
  '30m': { rsiPeriod: 14, emaFast: 12, emaSlow: 26, macdFast: 12, macdSlow: 26, macdSignal: 9, bbPeriod: 20, momentumPeriod: 12 },
  '1h':  { rsiPeriod: 14, emaFast: 12, emaSlow: 26, macdFast: 12, macdSlow: 26, macdSignal: 9, bbPeriod: 20, momentumPeriod: 14 },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sma(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  const slice = data.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / period;
}

function ema(data: number[], period: number): number[] {
  if (data.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [data[0]];
  for (let i = 1; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

function stdDev(data: number[], period: number): number {
  if (data.length < period) return 0;
  const slice = data.slice(-period);
  const mean = slice.reduce((s, v) => s + v, 0) / period;
  const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Indicators
// ---------------------------------------------------------------------------

export function computeRSI(closes: number[], period: number): { rsi: number; signal: Signal; strength: number } {
  if (closes.length < period + 1) {
    return { rsi: 50, signal: closes[closes.length - 1] >= closes[0] ? 'UP' : 'DOWN', strength: 0.1 };
  }

  let avgGain = 0;
  let avgLoss = 0;

  // Initial averages (Wilder's method)
  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  // Smoothed averages
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }

  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - 100 / (1 + rs);

  // Signal: RSI < 50 = DOWN, >= 50 = UP
  const signal: Signal = rsi >= 50 ? 'UP' : 'DOWN';

  // Strength: distance from 50, scaled. Extreme values (>70, <30) = high strength
  const distFrom50 = Math.abs(rsi - 50);
  const strength = clamp(distFrom50 / 50, 0.05, 1);

  return { rsi, signal, strength };
}

export function computeEMACrossover(
  closes: number[],
  fast: number,
  slow: number,
): { fastEma: number; slowEma: number; signal: Signal; strength: number } {
  const fastLine = ema(closes, fast);
  const slowLine = ema(closes, slow);

  const fastVal = fastLine[fastLine.length - 1];
  const slowVal = slowLine[slowLine.length - 1];

  const signal: Signal = fastVal >= slowVal ? 'UP' : 'DOWN';

  // Strength: percentage gap between fast & slow relative to price
  const price = closes[closes.length - 1];
  const gap = price > 0 ? Math.abs(fastVal - slowVal) / price : 0;
  const strength = clamp(gap * 100, 0.05, 1); // 1% gap = full strength

  return { fastEma: fastVal, slowEma: slowVal, signal, strength };
}

export function computeMACD(
  closes: number[],
  fast: number,
  slow: number,
  signalPeriod: number,
): { macdLine: number; signalLine: number; histogram: number; signal: Signal; strength: number } {
  const fastLine = ema(closes, fast);
  const slowLine = ema(closes, slow);

  const macdValues: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    macdValues.push(fastLine[i] - slowLine[i]);
  }

  const signalLineArr = ema(macdValues, signalPeriod);

  const macdLine = macdValues[macdValues.length - 1];
  const signalLine = signalLineArr[signalLineArr.length - 1];
  const histogram = macdLine - signalLine;

  const signal: Signal = histogram >= 0 ? 'UP' : 'DOWN';

  // Strength: histogram magnitude relative to price
  const price = closes[closes.length - 1];
  const relHistogram = price > 0 ? Math.abs(histogram) / price : 0;
  const strength = clamp(relHistogram * 500, 0.05, 1);

  return { macdLine, signalLine, histogram, signal, strength };
}

export function computeBollingerBands(
  closes: number[],
  period: number,
  numStdDev: number = 2,
): { upper: number; middle: number; lower: number; percentB: number; signal: Signal; strength: number } {
  const middle = sma(closes, period);
  const sd = stdDev(closes, period);
  const upper = middle + numStdDev * sd;
  const lower = middle - numStdDev * sd;

  const price = closes[closes.length - 1];
  const bandWidth = upper - lower;
  const percentB = bandWidth > 0 ? (price - lower) / bandWidth : 0.5;

  // %B > 0.5 = price is in upper half → UP, else DOWN
  const signal: Signal = percentB >= 0.5 ? 'UP' : 'DOWN';

  // Strength: distance from 0.5
  const strength = clamp(Math.abs(percentB - 0.5) * 2, 0.05, 1);

  return { upper, middle, lower, percentB, signal, strength };
}

export function computeMomentum(
  closes: number[],
  period: number,
): { roc: number; signal: Signal; strength: number } {
  if (closes.length <= period) {
    const change = closes[closes.length - 1] - closes[0];
    return { roc: 0, signal: change >= 0 ? 'UP' : 'DOWN', strength: 0.1 };
  }

  const current = closes[closes.length - 1];
  const past = closes[closes.length - 1 - period];
  const roc = past !== 0 ? ((current - past) / past) * 100 : 0;

  const signal: Signal = roc >= 0 ? 'UP' : 'DOWN';
  const strength = clamp(Math.abs(roc) / 2, 0.05, 1); // 2% ROC = full strength

  return { roc, signal, strength };
}

// ---------------------------------------------------------------------------
// Timeframe derivation
// ---------------------------------------------------------------------------

export function derivePoolTimeframe(startTime: string, endTime: string): Timeframe {
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();
  const durationMin = durationMs / 60_000;

  if (durationMin <= 2) return '1m';
  if (durationMin <= 5) return '3m';
  if (durationMin <= 10) return '5m';
  if (durationMin <= 30) return '15m';
  if (durationMin <= 60) return '30m';
  return '1h';
}

// Candle interval string for Pacifica API
const TIMEFRAME_INTERVAL: Record<Timeframe, string> = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
};

export function getIntervalForTimeframe(tf: Timeframe): string {
  return TIMEFRAME_INTERVAL[tf];
}

// How much history we need (in ms) for a given timeframe to compute all indicators
export function getHistoryDuration(tf: Timeframe): number {
  const params = TIMEFRAME_PARAMS[tf];
  // Need at least max(all periods) + buffer candles of history
  const maxPeriod = Math.max(
    params.rsiPeriod,
    params.emaSlow,
    params.macdSlow + params.macdSignal,
    params.bbPeriod,
    params.momentumPeriod,
  );
  // Convert candles to ms: (maxPeriod + 20 buffer) * interval ms
  const intervalMs: Record<Timeframe, number> = {
    '1m': 60_000,
    '3m': 180_000,
    '5m': 300_000,
    '15m': 900_000,
    '30m': 1_800_000,
    '1h': 3_600_000,
  };
  return (maxPeriod + 20) * intervalMs[tf];
}

// ---------------------------------------------------------------------------
// Composite analysis
// ---------------------------------------------------------------------------

const WEIGHTS = {
  RSI: 0.25,
  MACD: 0.25,
  EMA: 0.20,
  BB: 0.15,
  MOM: 0.15,
};

export function analyzeMarket(candles: TACandle[], timeframe: Timeframe): AnalysisResult | null {
  if (candles.length < 5) return null;

  const closes = candles.map((c) => c.close);
  const params = TIMEFRAME_PARAMS[timeframe];

  // Compute all indicators
  const rsi = computeRSI(closes, params.rsiPeriod);
  const emaCross = computeEMACrossover(closes, params.emaFast, params.emaSlow);
  const macd = computeMACD(closes, params.macdFast, params.macdSlow, params.macdSignal);
  const bb = computeBollingerBands(closes, params.bbPeriod);
  const mom = computeMomentum(closes, params.momentumPeriod);

  const indicators: IndicatorResult[] = [
    { name: 'RSI', signal: rsi.signal, strength: rsi.strength, value: rsi.rsi.toFixed(1) },
    { name: 'EMA', signal: emaCross.signal, strength: emaCross.strength, value: `${emaCross.fastEma.toFixed(2)}/${emaCross.slowEma.toFixed(2)}` },
    { name: 'MACD', signal: macd.signal, strength: macd.strength, value: macd.histogram.toFixed(4) },
    { name: 'BB', signal: bb.signal, strength: bb.strength, value: `%B ${(bb.percentB * 100).toFixed(1)}` },
    { name: 'MOM', signal: mom.signal, strength: mom.strength, value: `${mom.roc >= 0 ? '+' : ''}${mom.roc.toFixed(2)}%` },
  ];

  // Weighted composite score: UP = +1, DOWN = -1, weighted by strength and weight
  const weightedSum =
    (rsi.signal === 'UP' ? 1 : -1) * rsi.strength * WEIGHTS.RSI +
    (macd.signal === 'UP' ? 1 : -1) * macd.strength * WEIGHTS.MACD +
    (emaCross.signal === 'UP' ? 1 : -1) * emaCross.strength * WEIGHTS.EMA +
    (bb.signal === 'UP' ? 1 : -1) * bb.strength * WEIGHTS.BB +
    (mom.signal === 'UP' ? 1 : -1) * mom.strength * WEIGHTS.MOM;

  // Signal: always resolves to UP or DOWN (ties go to current momentum direction)
  const signal: Signal = weightedSum >= 0 ? 'UP' : 'DOWN';

  // Confidence: map absolute weighted sum to 30-95 range
  // Max possible |weightedSum| = 1.0 (all indicators agree at full strength)
  const absSum = Math.abs(weightedSum);
  const confidence = Math.round(30 + absSum * 65);
  const clampedConfidence = clamp(confidence, 30, 95);

  const explanation = generateExplanation(signal, clampedConfidence, indicators, rsi, macd, bb, mom);

  return {
    signal,
    confidence: clampedConfidence,
    indicators,
    explanation,
    timestamp: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Natural language explanation
// ---------------------------------------------------------------------------

function generateExplanation(
  signal: Signal,
  confidence: number,
  indicators: IndicatorResult[],
  rsi: { rsi: number },
  macd: { histogram: number },
  bb: { percentB: number },
  mom: { roc: number },
): string {
  const direction = signal === 'UP' ? 'UPWARD' : 'DOWNWARD';
  const agreeing = indicators.filter((i) => i.signal === signal).length;

  let strength: string;
  if (confidence >= 75) strength = 'STRONG';
  else if (confidence >= 55) strength = 'MODERATE';
  else strength = 'WEAK';

  const parts: string[] = [];

  parts.push(`[SCAN COMPLETE] ${strength} ${direction} signal detected. ${agreeing} of 5 indicators confirm.`);

  if (rsi.rsi > 70) parts.push(`RSI reading ${rsi.rsi.toFixed(0)} — overbought zone.`);
  else if (rsi.rsi < 30) parts.push(`RSI reading ${rsi.rsi.toFixed(0)} — oversold zone.`);

  if (Math.abs(macd.histogram) > 0) {
    parts.push(`MACD histogram ${macd.histogram > 0 ? 'positive' : 'negative'}.`);
  }

  if (bb.percentB > 0.8) parts.push('Price approaching upper Bollinger Band.');
  else if (bb.percentB < 0.2) parts.push('Price approaching lower Bollinger Band.');

  if (Math.abs(mom.roc) > 0.5) {
    parts.push(`Momentum: ${mom.roc > 0 ? '+' : ''}${mom.roc.toFixed(1)}%.`);
  }

  parts.push(`Confidence level: ${confidence}%.`);

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Parse raw Pacifica candles to TA candles
// ---------------------------------------------------------------------------

export function parseCandlesToTA(raw: { o: string; h: string; l: string; c: string; v: string; t: number }[]): TACandle[] {
  return raw.map((c) => ({
    open: parseFloat(c.o),
    high: parseFloat(c.h),
    low: parseFloat(c.l),
    close: parseFloat(c.c),
    volume: parseFloat(c.v),
    time: c.t,
  }));
}
