'use client';

import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

// Level tier colors — use t.levelTiers from theme

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
  const t = useThemeTokens();
  const tierIndex = Math.min(Math.floor((level - 1) / 4), 9);
  const color = t.levelTiers[tierIndex];
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
            color: withAlpha(color, 0.80),
            lineHeight: 1,
          }}
        >
          {title}
        </Typography>
      )}
    </Box>
  );
}
