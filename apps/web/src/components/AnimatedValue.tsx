'use client';

import CountUp from 'react-countup';
import { USDC_DIVISOR } from '@/lib/format';

interface AnimatedValueProps {
  /** Raw USDC on-chain string — will be divided by USDC_DIVISOR */
  usdcValue?: string;
  /** Plain numeric value (use instead of usdcValue) */
  value?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  separator?: string;
}

export function AnimatedValue({
  usdcValue,
  value,
  prefix = '',
  suffix = '',
  decimals = 2,
  duration = 0.8,
  separator = ',',
}: AnimatedValueProps) {
  const raw = usdcValue != null ? Number(usdcValue) / USDC_DIVISOR : (value ?? 0);
  const end = Number.isFinite(raw) ? raw : 0;

  return (
    <CountUp
      end={end}
      prefix={prefix}
      suffix={suffix}
      decimals={decimals}
      duration={duration}
      separator={separator}
      preserveValue
      useEasing
    />
  );
}
