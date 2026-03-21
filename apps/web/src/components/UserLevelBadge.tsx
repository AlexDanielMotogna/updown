'use client';

import { Box, Typography } from '@mui/material';
import { ACCENT_COLOR, UP_COLOR, GAIN_COLOR } from '@/lib/constants';

// Level tier colors — 10 tiers across 40 levels (4 levels each)
function getTierColor(level: number): string {
  if (level <= 4) return 'rgba(255,255,255,0.5)';
  if (level <= 8) return UP_COLOR;
  if (level <= 12) return GAIN_COLOR;
  if (level <= 16) return ACCENT_COLOR;
  if (level <= 20) return '#A78BFA'; // purple
  if (level <= 24) return '#F472B6'; // pink
  if (level <= 28) return '#FB923C'; // orange
  if (level <= 32) return '#F43F5E'; // rose
  if (level <= 36) return '#E879F9'; // fuchsia
  return '#FACC15'; // gold for 37-40
}

// 10 icons distributed across 40 levels (4 levels per icon)
function getLevelIcon(level: number): string {
  if (level <= 4) return '/Level/Level_1-4.png';
  if (level <= 8) return '/Level/Level_5-8.png';
  if (level <= 12) return '/Level/Level_9-12.png';
  if (level <= 16) return '/Level/Level_13-16.png';
  if (level <= 20) return '/Level/Level_17-20.png';
  if (level <= 24) return '/Level/Level_21-24.png';
  if (level <= 28) return '/Level/Level_25-28.png';
  if (level <= 32) return '/Level/Level_29-32.png';
  if (level <= 36) return '/Level/Level_33-36.png';
  return '/Level/Level_37-40.png';
}

interface UserLevelBadgeProps {
  level: number;
  title: string;
  size?: 'sm' | 'md';
  variant?: 'default' | 'icon-only';
}

export function UserLevelBadge({ level, title, size = 'sm', variant = 'default' }: UserLevelBadgeProps) {
  const color = getTierColor(level);
  const icon = getLevelIcon(level);
  const isSm = size === 'sm';

  if (variant === 'icon-only') {
    return (
      <Box
        component="img"
        src={icon}
        alt={`Level ${level}`}
        sx={{ width: isSm ? 24 : 32, height: isSm ? 24 : 32 }}
      />
    );
  }

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        px: isSm ? 0.5 : 1,
        py: isSm ? 0.25 : 0.5,
      }}
    >
      <Box
        component="img"
        src={icon}
        alt={`Level ${level}`}
        sx={{ width: isSm ? 28 : 36, height: isSm ? 28 : 36 }}
      />
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
