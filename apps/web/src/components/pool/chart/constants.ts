/**
 * Constants shared across the chart submodules: layout padding, the snake
 * view's window/tick cadence, and the supported intervals.
 *
 * Anything new shared by SnakeLineChart, CandlesChart, useChartLayout, etc.
 * belongs here so individual files stay focused.
 */

/** SVG chart padding. Top/bottom leave room for the price-tag rail and
 *  x-axis ticks; right reserves the gutter for the current-price label;
 *  left is just a hair of breathing room. */
export const CHART_PADDING = { top: 20, right: 70, bottom: 30, left: 16 };

/** Snake view shows the most recent N minutes of price activity. Bigger
 *  than ~3min and per-frame motion stops reading as motion at native
 *  refresh rate; smaller and the user doesn't see enough context. */
export const SNAKE_WINDOW_MS = 3 * 60 * 1000;

/** Cadence of the rolling-buffer push + the matching CSS transition on
 *  the group transform. 100ms tick with 100ms-linear transform means each
 *  frame stitches into the next on the GPU compositor — no visible step. */
export const SNAKE_TICK_MS = 100;

/** CSS transition string built from SNAKE_TICK_MS so the two stay in sync
 *  when one changes. */
export const SNAKE_TRANS = `${SNAKE_TICK_MS / 1000}s linear`;

/** Available candle intervals for the candlestick view + their visible
 *  durations. Listed shortest-first so INTERVALS[0] is a safe default. */
export const CHART_INTERVALS = [
  { label: '1m', value: '1m', duration: 60 * 60 * 1000 },
  { label: '3m', value: '3m', duration: 3 * 60 * 60 * 1000 },
  { label: '5m', value: '5m', duration: 5 * 60 * 60 * 1000 },
  { label: '15m', value: '15m', duration: 12 * 60 * 60 * 1000 },
  { label: '30m', value: '30m', duration: 24 * 60 * 60 * 1000 },
  { label: '1H', value: '1h', duration: 2 * 24 * 60 * 60 * 1000 },
  { label: '4H', value: '4h', duration: 7 * 24 * 60 * 60 * 1000 },
  { label: '1D', value: '1d', duration: 30 * 24 * 60 * 60 * 1000 },
] as const;

export const CHART_FONT_FAMILY = 'var(--font-satoshi), Satoshi, sans-serif';
