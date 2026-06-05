'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

/** Fields read off the profile aggregate to evaluate achievements. */
interface AchievementsProfile {
  rank?: number | null;
  stats?: {
    netPnl?: string | number | null;
    totalWon?: string | number | null;
    totalWagered?: string | number | null;
    volumeStaked?: string | number | null;
    totalBets?: number | null;
    totalWins?: number | null;
    winRate?: string | number | null;
    bestStreak?: number | null;
  } | null;
}

interface Props {
  profile?: AchievementsProfile | null;
}

const USDC = 1_000_000;

/**
 * Achievement badges derived entirely from the profile aggregate — gives the
 * profile a sense of progression beyond raw P&L. Unlocked badges show in
 * colour; locked ones are dimmed with the criteria in a tooltip, so there's
 * always a next goal visible.
 */
export function ProfileAchievements({ profile }: Props) {
  const t = useThemeTokens();
  const num = (v: string | number | null | undefined) => (v == null ? 0 : Number(v));
  const s = profile?.stats;

  const netPnl = s?.netPnl != null ? num(s.netPnl) : num(s?.totalWon) - num(s?.totalWagered);
  const totalBets = num(s?.totalBets);
  const totalWins = num(s?.totalWins);
  const volume = num(s?.volumeStaked) / USDC;
  const winRate = num(s?.winRate);
  const bestStreak = num(s?.bestStreak);
  const rank = profile?.rank ?? null;

  const badges: Array<{ emoji: string; label: string; unlocked: boolean; how: string }> = [
    { emoji: '🎯', label: 'First Prediction', unlocked: totalBets >= 1, how: 'Place your first prediction' },
    { emoji: '💰', label: 'First Profit', unlocked: netPnl > 0, how: 'Finish all-time net positive' },
    { emoji: '🔟', label: '10 Wins', unlocked: totalWins >= 10, how: 'Win 10 predictions' },
    { emoji: '📊', label: '50 Predictions', unlocked: totalBets >= 50, how: 'Make 50 predictions' },
    { emoji: '🔥', label: 'Hot Streak', unlocked: bestStreak >= 5, how: 'Hit a 5-win streak' },
    { emoji: '🎖️', label: 'Top 100', unlocked: rank != null && rank <= 100, how: 'Reach global rank ≤ 100' },
    { emoji: '🐋', label: 'Whale', unlocked: volume >= 1000, how: 'Stake $1,000 in total volume' },
    { emoji: '🏹', label: 'Sharpshooter', unlocked: totalBets >= 10 && winRate >= 60, how: '60%+ win rate over 10+ predictions' },
  ];

  const unlockedCount = badges.filter(b => b.unlocked).length;

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1.25 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>Achievements</Typography>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.tertiary }}>
          {unlockedCount}/{badges.length}
        </Typography>
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, 1fr)' }, gap: 1 }}>
        {badges.map(b => (
          <Tooltip key={b.label} arrow title={b.unlocked ? `Unlocked — ${b.how}` : `Locked — ${b.how}`}>
            <Box
              sx={{
                display: 'flex', alignItems: 'center', gap: 1,
                px: 1.25, py: 1, borderRadius: 1.5,
                bgcolor: b.unlocked ? t.bg.surfaceAlt : 'transparent',
                border: `1px solid ${b.unlocked ? t.border.medium : t.border.subtle}`,
                opacity: b.unlocked ? 1 : 0.45,
                filter: b.unlocked ? 'none' : 'grayscale(1)',
                transition: 'opacity 0.15s ease',
                cursor: 'default',
              }}
            >
              <Box sx={{ fontSize: '1.25rem', lineHeight: 1, flexShrink: 0 }}>{b.emoji}</Box>
              <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.15, minWidth: 0 }}>
                {b.label}
              </Typography>
            </Box>
          </Tooltip>
        ))}
      </Box>
    </Box>
  );
}
