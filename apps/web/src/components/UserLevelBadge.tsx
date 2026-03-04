'use client';

import { Box, Typography } from '@mui/material';
import { ACCENT_COLOR, UP_COLOR, GAIN_COLOR } from '@/lib/constants';

// Level tier colors
function getTierColor(level: number): string {
  if (level <= 5) return 'rgba(255,255,255,0.5)';
  if (level <= 10) return UP_COLOR;
  if (level <= 20) return GAIN_COLOR;
  if (level <= 30) return ACCENT_COLOR;
  if (level <= 35) return '#A78BFA'; // purple
  return '#F472B6'; // pink for 36-40
}

interface UserLevelBadgeProps {
  level: number;
  title: string;
  size?: 'sm' | 'md';
}

export function UserLevelBadge({ level, title, size = 'sm' }: UserLevelBadgeProps) {
  const color = getTierColor(level);
  const isSm = size === 'sm';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: isSm ? 1 : 1.5,
        py: isSm ? 0.25 : 0.5,
        borderRadius: '4px',
        bgcolor: `${color}15`,
        border: `1px solid ${color}30`,
      }}
    >
      <Typography
        sx={{
          fontSize: isSm ? '0.65rem' : '0.75rem',
          fontWeight: 700,
          color,
          lineHeight: 1,
        }}
      >
        Lv.{level}
      </Typography>
      {!isSm && (
        <Typography
          sx={{
            fontSize: '0.65rem',
            fontWeight: 500,
            color: `${color}CC`,
            lineHeight: 1,
          }}
        >
          {title}
        </Typography>
      )}
    </Box>
  );
}
