'use client';

/**
 * Short-lived overlay rendered on top of MarketCard / PoolCard / the
 * chart panels in /pool/[id] and /match/[id] every time a fresh bet
 * lands. Sourced from the `pool:bet-placed` socket event via useBetFlash.
 *
 * Polymarket-style: NO background pill, NO border, NO shadow. Just the
 * side icon + monospace amount sitting at the bottom of the card so it
 * never blocks the title, odds, or score above. Reads as an unobtrusive
 * "live tape" feed.
 *
 * Two positional variants on the same visual:
 *   - `card`        absolute-anchored to the bottom edge of the card
 *   - `chart-left`  absolute-anchored to the top-left of the chart so
 *                   the pill never collides with the price axis on the
 *                   right edge or the legend at the top
 *
 * For sports markets the icon is the actual team crest, not the
 * UP/DOWN arrow - the caller passes `sideIcon` with crest URLs so the
 * flash matches the rest of the card's iconography (same source as the
 * outcome rows).
 */

import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { USDC_DIVISOR } from '@/lib/format';
import { YES_ICON, NO_ICON, UP_ICON, DOWN_ICON } from '@/lib/predictionIcons';
import type { BetFlash } from '@/hooks/useBetFlash';

type Variant = 'card' | 'chart-left' | 'chart-bottom-right' | 'chart-bottom-left';
type SideKey = 'UP' | 'DOWN' | 'DRAW';

interface BetFlashProps {
  flashes: BetFlash[];
  variant?: Variant;
  /** When true (PM Yes/No markets) the default icons fall back to the
   *  Yes/No glyphs. Ignored when `sideIcon` provides an explicit URL. */
  prediction?: boolean;
  /** Optional explicit labels keyed by side. Overrides the default
   *  Up/Down/Yes/No copy - used for sports to show team names. */
  sideLabel?: Partial<Record<SideKey, string>>;
  /** Optional explicit icon URLs keyed by side. Wins over the default
   *  Yes/No / Up/Down assets. Pass team crests here on sports cards so
   *  the flash matches the outcome row iconography. */
  sideIcon?: Partial<Record<SideKey, string | null | undefined>>;
}

function formatAmount(raw: bigint): string {
  const usd = Number(raw) / USDC_DIVISOR;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}k`;
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  return `$${usd.toFixed(2)}`;
}

export function BetFlash({ flashes, variant = 'card', prediction = false, sideIcon }: BetFlashProps) {
  const t = useThemeTokens();
  if (flashes.length === 0) return null;

  // Bumped over the LWC canvas (z-index 0) + tooltip layer (~2) so the
  // flash never hides behind a hover overlay or the price axis.
  const base = { position: 'absolute' as const, pointerEvents: 'none' as const, zIndex: 10, display: 'flex' as const, flexDirection: 'column' as const, gap: 0.4 };
  const containerSx =
    variant === 'card'
      ? // Centred along the bottom edge of the card so it sits BELOW
        // every meaningful content row and never blocks a click.
        { ...base, left: 0, right: 0, bottom: 8, alignItems: 'center' as const }
      : variant === 'chart-bottom-right'
        ? // Bottom-right of the chart, Kalshi/Polymarket "live tape" — newest
          // at the bottom, older bets stacking upward (column-reverse).
          { ...base, bottom: 10, right: 12, alignItems: 'flex-end' as const, flexDirection: 'column-reverse' as const }
        : variant === 'chart-bottom-left'
          ? // Bottom-left "live tape" — newest at the bottom, older stacking up.
            { ...base, bottom: 10, left: 12, alignItems: 'flex-start' as const, flexDirection: 'column-reverse' as const }
          : // chart-left: top-left, clear of the right price axis + top legend.
            { ...base, top: 10, left: 10, alignItems: 'flex-start' as const };

  return (
    <Box sx={containerSx}>
      <AnimatePresence>
        {flashes.map((flash) => {
          const colour = flash.side === 'UP' ? t.up : flash.side === 'DOWN' ? t.down : t.draw;
          // Explicit per-side icon (sports crest) wins; otherwise we
          // fall back to the prediction Yes/No glyph or the crypto
          // Up/Down arrow. null means "no icon" - render text-only.
          const explicit = sideIcon?.[flash.side];
          const fallback = prediction
            ? (flash.side === 'UP' ? YES_ICON : NO_ICON)
            : (flash.side === 'UP' ? UP_ICON : flash.side === 'DOWN' ? DOWN_ICON : null);
          const iconSrc = explicit !== undefined ? explicit : fallback;
          return (
            <motion.div
              key={flash.key}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{
                opacity: { duration: 0.22, ease: 'easeOut' },
                y: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
              }}
              style={{ pointerEvents: 'none' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.65,
                  // No background, no border, no shadow - Polymarket
                  // "live tape" style. The colour comes from the side
                  // tint on the amount text.
                }}
              >
                {iconSrc && (
                  <Box
                    component="img"
                    src={iconSrc}
                    alt=""
                    sx={{
                      width: 14,
                      height: 14,
                      objectFit: 'contain',
                      // Tiny rounded rect for crests so they read as
                      // badges even at 14px. No-op on the YES/NO glyph
                      // since it's already square SVG content.
                      borderRadius: '3px',
                    }}
                  />
                )}
                <Typography
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: colour,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1.1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  +{formatAmount(flash.amount)}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Box>
  );
}
