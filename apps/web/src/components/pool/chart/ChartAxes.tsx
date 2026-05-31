'use client';

/**
 * Shared axes layer: horizontal gridlines + Y-axis price labels, plus the
 * time-keyed X tick group used by the snake view.
 *
 * Y ticks are anchored at fixed Y positions - they never move with the
 * snake. X ticks (when passed) are keyed by their timestamp so each tick's
 * DOM node persists across renders, letting the CSS transform-transition
 * inside the snake group slide the labels smoothly leftward.
 */

import { useThemeTokens } from '@/app/providers';
import { CHART_FONT_FAMILY, CHART_PADDING, SNAKE_TRANS } from './constants';
import { formatChartPrice, formatChartTime } from './scale';

interface Props {
  dims: { width: number; height: number };
  yTicks: { price: number; y: number }[];
  /** Pass [] to skip X labels (e.g. when the snake renders its own inside
   *  the moving group). */
  xTicks?: { time: number; x: number }[];
  durationMs?: number;
}

export function ChartAxes({ dims, yTicks, xTicks = [], durationMs = 60 * 60 * 1000 }: Props) {
  const t = useThemeTokens();
  return (
    <>
      {yTicks.map((tick, i) => (
        <g key={`y-${i}`}>
          <line
            x1={CHART_PADDING.left}
            x2={dims.width - CHART_PADDING.right}
            y1={tick.y}
            y2={tick.y}
            stroke={t.border.default}
            strokeWidth={1}
          />
          <text
            x={dims.width - CHART_PADDING.right + 8}
            y={tick.y + 4}
            fill={t.text.tertiary}
            fontSize={11}
            fontFamily={CHART_FONT_FAMILY}
            fontWeight={700}
          >
            {formatChartPrice(tick.price)}
          </text>
        </g>
      ))}
      {xTicks.map((tick) => (
        <g
          key={`x-${tick.time}`}
          transform={`translate(${tick.x}, 0)`}
          style={{ transition: `transform ${SNAKE_TRANS}` }}
        >
          <text
            x={0}
            y={dims.height - 6}
            fill={t.text.tertiary}
            fontSize={10}
            fontFamily={CHART_FONT_FAMILY}
            fontWeight={700}
            textAnchor="middle"
          >
            {formatChartTime(tick.time, durationMs)}
          </text>
        </g>
      ))}
    </>
  );
}
