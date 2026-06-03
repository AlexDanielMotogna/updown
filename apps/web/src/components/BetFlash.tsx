'use client';

/**
 * Short-lived pill overlay rendered on top of MarketCard / PoolCard / the
 * chart panels in /pool/[id] and /match/[id] every time a fresh bet
 * lands. Sourced from the `pool:bet-placed` socket event via useBetFlash.
 *
 * Two positional variants on the same visual:
 *   - `card`        absolute-centered over the card, fades in/out
 *   - `chart-left`  absolute-anchored to the top-left of the chart so
 *                   the pill never collides with the price axis on the
 *                   right edge or the legend at the top
 *
 * Visual: a horizontal pill — coloured circle with the side icon,
 * tabular-nums amount in the same colour as the side. Backdrop is a
 * 14% wash of the side colour so it reads as a "bet for this side" hit
 * without screaming. Subtle drop shadow + 1px border give it the
 * Polymarket / Kalshi "professional notification" feel rather than a
 * toast-y celebratory flash.
 */

import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { USDC_DIVISOR } from '@/lib/format';
import { YES_ICON, NO_ICON, UP_ICON, DOWN_ICON } from '@/lib/predictionIcons';
import type { BetFlash } from '@/hooks/useBetFlash';

type Variant = 'card' | 'chart-left';

interface BetFlashProps {
  flashes: BetFlash[];
  variant?: Variant;
  /** When true (PM Yes/No markets and most prediction surfaces) the pill
   *  uses YES/NO iconography instead of UP/DOWN arrows. */
  prediction?: boolean;
  /** For sports / multi-outcome, optional explicit labels keyed by side.
   *  Overrides the default Up/Down/Yes/No copy. Icons fall back to the
   *  UP/DOWN/Draw arrows since sports teams don't have a generic glyph. */
  sideLabel?: Partial<Record<'UP' | 'DOWN' | 'DRAW', string>>;
}

function formatAmount(raw: bigint): string {
  const usd = Number(raw) / USDC_DIVISOR;
  if (usd >= 1000) return `$${(usd / 1000).toFixed(2)}k`;
  if (usd >= 100) return `$${usd.toFixed(0)}`;
  return `$${usd.toFixed(2)}`;
}

export function BetFlash({ flashes, variant = 'card', prediction = false, sideLabel }: BetFlashProps) {
  const t = useThemeTokens();
  if (flashes.length === 0) return null;

  const containerSx = variant === 'card'
    ? {
        position: 'absolute' as const,
        // Centred over the card. pointerEvents none so it never blocks
        // the card click — bets are read-only flashes.
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none' as const,
        zIndex: 4,
        display: 'flex' as const,
        flexDirection: 'column' as const,
        alignItems: 'center' as const,
        gap: 0.5,
      }
    : {
        // Anchored to the top-left of the chart container. The parent
        // must be position: relative for this to work.
        position: 'absolute' as const,
        top: 10,
        left: 10,
        pointerEvents: 'none' as const,
        zIndex: 4,
        display: 'flex' as const,
        flexDirection: 'column' as const,
        alignItems: 'flex-start' as const,
        gap: 0.5,
      };

  return (
    <Box sx={containerSx}>
      <AnimatePresence>
        {flashes.map((flash) => {
          const colour = flash.side === 'UP' ? t.up : flash.side === 'DOWN' ? t.down : t.draw;
          const iconSrc = prediction
            ? (flash.side === 'UP' ? YES_ICON : NO_ICON)
            : (flash.side === 'UP' ? UP_ICON : flash.side === 'DOWN' ? DOWN_ICON : null);
          const label = sideLabel?.[flash.side]
            ?? (prediction
              ? (flash.side === 'UP' ? 'Yes' : 'No')
              : (flash.side === 'UP' ? 'Up' : flash.side === 'DOWN' ? 'Down' : 'Draw'));
          return (
            <motion.div
              key={flash.key}
              initial={{ opacity: 0, y: 8, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              transition={{
                opacity: { duration: 0.22, ease: 'easeOut' },
                y: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                scale: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
              }}
              style={{ pointerEvents: 'none' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1.5,
                  py: 0.75,
                  borderRadius: '999px',
                  bgcolor: withAlpha(colour, 0.14),
                  border: `1px solid ${withAlpha(colour, 0.35)}`,
                  // Tiny lift — reads as "fresh activity" without being a
                  // big celebratory glow.
                  boxShadow: `0 4px 14px ${withAlpha(colour, 0.18)}`,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <Box
                  sx={{
                    width: 20,
                    height: 20,
                    borderRadius: '50%',
                    bgcolor: colour,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {iconSrc ? (
                    <Box component="img" src={iconSrc} alt="" sx={{ width: 12, height: 12 }} />
                  ) : (
                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 800, color: t.text.contrast, lineHeight: 1 }}>
                      {label[0]}
                    </Typography>
                  )}
                </Box>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 800,
                    color: colour,
                    fontVariantNumeric: 'tabular-nums',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}{'  '}+{formatAmount(flash.amount)}
                </Typography>
              </Box>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Box>
  );
}
