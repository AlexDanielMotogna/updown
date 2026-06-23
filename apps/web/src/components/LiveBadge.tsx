'use client';

import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

interface LiveBadgeProps {
  size?: 'sm' | 'md';
}

/**
 * "● LIVE" indicator - just a pulsing green dot + the word LIVE in green,
 * no background pill / border. Progress text ("2nd Inning IN2'", "45'",
 * "Q3 8:42") is rendered by the caller as a separate sibling so it sits
 * naturally with the rest of the meta row and isn't visually trapped
 * inside the badge.
 */
export function LiveBadge({ size = 'md' }: LiveBadgeProps) {
  const t = useThemeTokens();
  const dot = size === 'sm' ? 5 : 6;
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.45, flexShrink: 0, lineHeight: 1 }}>
      <Box
        sx={{
          width: dot,
          height: dot,
          borderRadius: '50%',
          bgcolor: t.gain,
          animation: 'liveBadgePulse 1.5s ease-in-out infinite',
          '@keyframes liveBadgePulse': {
            '0%, 100%': { opacity: 1, transform: 'scale(1)' },
            '50%': { opacity: 0.4, transform: 'scale(0.85)' },
          },
        }}
      />
      <Typography
        sx={{
          fontSize: size === 'sm' ? '0.56rem' : '0.62rem',
          fontWeight: 700,
          color: t.gain,
          letterSpacing: '0.08em',
          lineHeight: 1,
        }}
      >
        LIVE
      </Typography>
    </Box>
  );
}
