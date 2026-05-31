'use client';

import { Box, Typography } from '@mui/material';
import { Favorite } from '@mui/icons-material';
import { AnimatedValue } from '@/components/AnimatedValue';
import { Countdown } from '@/components/Countdown';
import { formatLivePrice, priceDecimalsFor, USDC_DIVISOR } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';

interface PriceTargetStripProps {
  strikePrice: string | null;
  livePrice: string | null;
  priceFlash: 'up' | 'down' | null;
  endTime: string;
  status: string;
  finalPrice?: string | null;
  isLive?: boolean;
}

/**
 * Slim 3-cell row that sits between the header and the chart, matching the
 * Polymarket layout: "Price To Beat | Current Price | countdown". Replaces
 * the old PoolInfoCards block — same essential info, far less chrome.
 */
export function PriceTargetStrip({
  strikePrice,
  livePrice,
  priceFlash,
  endTime,
  status,
  finalPrice,
  isLive = true,
}: PriceTargetStripProps) {
  const t = useThemeTokens();
  const isResolved = status === 'RESOLVED' || status === 'CLAIMABLE';
  const strikeNum = strikePrice ? Number(strikePrice) / USDC_DIVISOR : null;
  const liveNum = livePrice ? Number(livePrice) : null;
  const finalNum = finalPrice ? Number(finalPrice) / USDC_DIVISOR : null;
  const delta = liveNum != null && strikeNum != null ? liveNum - strikeNum : null;
  const priceUp = delta != null ? delta >= 0 : null;
  // Delta decimals follow the magnitude of the strike itself — a SOL pool
  // (strike ~82) wants 4 places, a BTC pool (strike ~73k) wants 2.
  const deltaDecimals = strikeNum != null ? priceDecimalsFor(strikeNum) : 2;

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 2, md: 4 },
        flexWrap: 'wrap',
        px: { xs: 2, md: 3 },
        pb: { xs: 1, md: 1.25 },
      }}
    >
      {/* Price To Beat — the strike captured when the pool opened. */}
      <Box>
        <Typography sx={{ fontSize: { xs: '0.62rem', md: '0.7rem' }, fontWeight: 600, color: t.text.tertiary, letterSpacing: '0.02em' }}>
          Price To Beat
        </Typography>
        <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
          {strikeNum != null ? formatLivePrice(strikeNum) : '—'}
        </Typography>
      </Box>

      {/* Current Price — live tick from Pacifica, with a tiny ±delta chip. */}
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ fontSize: { xs: '0.62rem', md: '0.7rem' }, fontWeight: 600, color: t.accent, letterSpacing: '0.02em' }}>
            {isResolved ? 'Final Price' : 'Current Price'}
          </Typography>
          {delta != null && !isResolved && (
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.2 }}>
              <Favorite sx={{ fontSize: 11, color: priceUp ? t.up : t.down }} />
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: priceUp ? t.up : t.down, fontVariantNumeric: 'tabular-nums' }}>
                {priceUp ? '+' : '−'}${Math.abs(delta).toFixed(deltaDecimals)}
              </Typography>
            </Box>
          )}
        </Box>
        <Typography
          sx={{
            fontSize: { xs: '1rem', md: '1.25rem' },
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: priceFlash === 'up' ? t.up : priceFlash === 'down' ? t.down : t.accent,
            transition: 'color 0.15s ease',
            lineHeight: 1.2,
          }}
        >
          {isResolved && finalNum != null
            ? formatLivePrice(finalNum)
            : liveNum != null
              ? <AnimatedValue value={liveNum} prefix="$" duration={0.4} decimals={priceDecimalsFor(liveNum)} />
              : '—'}
        </Typography>
      </Box>

      {/* Countdown — right-aligned mirror of the Polymarket "04 MINS 33 SECS" pill. */}
      {isLive && endTime && (
        <Box sx={{ ml: 'auto', textAlign: 'right' }}>
          <Countdown targetDate={endTime} compact compactFontSize={{ xs: '1rem', md: '1.4rem' }} />
        </Box>
      )}
    </Box>
  );
}
