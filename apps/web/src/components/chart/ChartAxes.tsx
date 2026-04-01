'use client';

import { formatChartPrice, formatTime, PADDING } from './chart-utils';
import { useThemeTokens } from '@/app/providers';

export interface AxesProps {
  dims: { width: number; height: number };
  yTicks: { price: number; y: number }[];
  xTicks: { time: number; x: number }[];
  duration: number;
}

export function ChartAxes({ dims, yTicks, xTicks, duration }: AxesProps) {
  const t = useThemeTokens();
  return (
    <>
      {yTicks.map((tick, i) => (
        <g key={`y-${i}`}>
          <line x1={PADDING.left} x2={dims.width - PADDING.right} y1={tick.y} y2={tick.y} stroke={t.border.default} strokeWidth={1} />
          <text x={dims.width - PADDING.right + 8} y={tick.y + 4} fill={t.text.tertiary} fontSize={11} fontFamily="var(--font-satoshi), Satoshi, sans-serif">
            {formatChartPrice(tick.price)}
          </text>
        </g>
      ))}
      {xTicks.map((tick, i) => (
        <text key={`x-${i}`} x={tick.x} y={dims.height - 6} fill={t.text.tertiary} fontSize={10} fontFamily="var(--font-satoshi), Satoshi, sans-serif" textAnchor="middle">
          {formatTime(tick.time, duration)}
        </text>
      ))}
    </>
  );
}
