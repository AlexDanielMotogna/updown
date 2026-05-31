'use client';

import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';

/**
 * Canonical XP progress bar. Used by /profile and by the navbar dropdown so
 * the user sees the same fill colour, the same numbers, and the same
 * progression callout regardless of where they look.
 *
 * Accepts the whole UserProfile shape - keeps the call sites short and
 * guarantees that any number derivation (xpInLevel, xpSpan, next-level
 * label) stays in one place.
 */

interface XpProgressBarProps {
  profile: Pick<
    UserProfile,
    'level' | 'totalXp' | 'xpForCurrentLevel' | 'xpForNextLevel' | 'xpProgress' | 'nextLevel'
  >;
  /** Compact mode hides the "→ Lv.X Title" label on the right. */
  compact?: boolean;
}

/** Tier colour matches the level badge ring - keeps the visual language tight. */
function tierColor(level: number, tiers: string[]): string {
  const idx = Math.min(Math.floor((level - 1) / 4), tiers.length - 1);
  return tiers[Math.max(0, idx)];
}

export function XpProgressBar({ profile, compact }: XpProgressBarProps) {
  const t = useThemeTokens();
  const xpInLevel = Number(profile.totalXp) - Number(profile.xpForCurrentLevel);
  const xpSpan = Number(profile.xpForNextLevel) - Number(profile.xpForCurrentLevel);
  const pct = Math.max(0, Math.min(100, (profile.xpProgress || 0) * 100));
  const color = tierColor(profile.level, t.levelTiers);

  return (
    <Box>
      <Box sx={{
        width: '100%',
        height: 8,
        borderRadius: 4,
        bgcolor: t.border.default,
        overflow: 'hidden',
      }}>
        <Box sx={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 4,
          background: `linear-gradient(90deg, ${withAlpha(color, 0.7)}, ${color})`,
          transition: 'width 0.4s ease',
        }} />
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 0.5, gap: 1 }}>
        <Typography sx={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: t.text.quaternary,
          fontVariantNumeric: 'tabular-nums',
          whiteSpace: 'nowrap',
        }}>
          {xpInLevel.toLocaleString()} / {xpSpan.toLocaleString()} XP
        </Typography>
        {!compact && (
          <Typography sx={{
            fontSize: '0.7rem',
            fontWeight: 600,
            color: t.text.muted,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {profile.nextLevel
              ? `→ Lv.${profile.nextLevel.level} ${profile.nextLevel.title}`
              : 'MAX LEVEL'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
