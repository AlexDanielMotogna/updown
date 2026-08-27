'use client';

import { Box, Typography } from '@mui/material';

import { useThemeTokens } from '@/app/providers';
import { useOnlineCount } from '@/hooks/useOnlineCount';

/**
 * Fixed "LIVE · n" pill showing how many clients are connected right now.
 *
 * Renders nothing until the first `presence` event arrives, so it never flashes
 * a misleading "0" on a cold load or while the socket is still connecting.
 *
 * Counts CONNECTIONS, not people (one user with three tabs counts three), which
 * is why the label says "live" rather than "users".
 *
 * Position: bottom-RIGHT, stacked directly above the AI analyzer FAB.
 * Bottom-left is taken by BoostBadges (`header/BoostBadges.tsx:55`), and the
 * bottom-right corner itself is taken by the AI bot bubble
 * (`AiAnalyzerBot.tsx:217`, 56px desktop / 48px mobile) plus the notification
 * toasts (`NotificationToasts.tsx:231`), so we sit one row up from the bubble
 * and align to its right edge.
 *
 * The bubble is draggable (`useDraggablePosition('bot-drag-pos')`), so a user
 * who drags it can park it over this pill. That is only ever cosmetic: the pill
 * is `pointerEvents: 'none'`, so it can never swallow a click meant for the FAB.
 */
export function LiveCounter() {
  const t = useThemeTokens();
  const online = useOnlineCount();

  if (online === null) return null;

  return (
    <Box
      aria-live="polite"
      sx={{
        position: 'fixed',
        // Right edge, aligned with the AI bot bubble below it (16 mobile / 24 desktop).
        right: { xs: 16, lg: 24 },
        // One row above that bubble: its own offset + its height + a small gap.
        // Mobile: 80 (bubble offset) + 48 (bubble) + 10 = 138, plus the safe area.
        // Desktop: 24 + 56 + 12 = 92.
        bottom: { xs: 'calc(138px + env(safe-area-inset-bottom, 0px))', lg: 92 },
        zIndex: 1200,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        py: 0.5,
        px: 1.25,
        borderRadius: 999,
        bgcolor: t.bg.surface,
        border: `1px solid ${t.border.subtle}`,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        backdropFilter: 'blur(6px)',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <Box
        sx={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          bgcolor: t.up,
          flexShrink: 0,
          boxShadow: `0 0 6px ${t.up}88`,
          '@keyframes livePulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.35 },
          },
          animation: 'livePulse 2s ease-in-out infinite',
          '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
        }}
      />
      <Typography
        sx={{
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          color: t.text.quaternary,
          textTransform: 'uppercase',
        }}
      >
        Live
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.bright, fontVariantNumeric: 'tabular-nums' }}>
        {online.toLocaleString('en-US')}
      </Typography>
    </Box>
  );
}
