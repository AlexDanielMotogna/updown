'use client';

import { Box, Typography } from '@mui/material';
import { ACCENT_COLOR, UP_COLOR, GAIN_COLOR } from '@/lib/constants';

// Level tier colors
function getTierColor(level: number): string {
  if (level <= 10) return 'rgba(255,255,255,0.5)';
  if (level <= 20) return UP_COLOR;
  if (level <= 30) return GAIN_COLOR;
  if (level <= 40) return ACCENT_COLOR;
  if (level <= 50) return '#A78BFA'; // purple
  if (level <= 60) return '#F472B6'; // pink
  if (level <= 70) return '#FB923C'; // orange
  if (level <= 80) return '#F43F5E'; // rose
  if (level <= 90) return '#E879F9'; // fuchsia
  return '#FACC15'; // gold for 91-100
}

function getLevelIcon(level: number): string {
  if (level <= 10) return '/Level/Level_icons-1-10.png';
  if (level <= 20) return '/Level/Level_icons-10-20.png';
  if (level <= 30) return '/Level/Level_icons-20-30.png';
  if (level <= 40) return '/Level/Level_icons-30-40.png';
  if (level <= 50) return '/Level/Level_icons-40-50.png';
  if (level <= 60) return '/Level/Level_icons-50-60.png';
  if (level <= 70) return '/Level/Level_icons-60-70.png';
  if (level <= 80) return '/Level/Level_icons-70-80.png';
  if (level <= 90) return '/Level/Level_icons-80-90.png';
  return '/Level/Level_icons-90-100.png';
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
        px: isSm ? 1 : 1.5,
        py: isSm ? 0.25 : 0.5,
        borderRadius: '4px',
        bgcolor: `${color}15`,
        border: `1px solid ${color}30`,
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
