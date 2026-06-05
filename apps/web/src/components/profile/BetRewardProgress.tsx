'use client';

import { Box, Typography } from '@mui/material';
import { CardGiftcard } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';

/**
 * Testing-campaign nudge: progress toward the one-time UP reward at 20 real
 * predictions. Hidden once unlocked (the coins are already in the balance) or
 * when the campaign is off (`testingReward` is null from the API).
 */
export function BetRewardProgress({ reward }: { reward: UserProfile['testingReward'] }) {
  const t = useThemeTokens();
  if (!reward || reward.unlocked) return null;

  const remaining = Math.max(0, reward.threshold - reward.progress);
  const pct = Math.min(100, (reward.progress / reward.threshold) * 100);

  return (
    <Box sx={{
      display: 'flex', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, mb: 3,
      borderRadius: 1.5, bgcolor: withAlpha(t.gold, 0.08), border: `1px solid ${withAlpha(t.gold, 0.3)}`,
    }}>
      <CardGiftcard sx={{ fontSize: 22, color: t.gold, flexShrink: 0 }} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.primary }}>
          {remaining} more prediction{remaining === 1 ? '' : 's'} to earn{' '}
          <Box component="span" sx={{ color: t.gold, fontWeight: 800 }}>{reward.amount.toLocaleString()} UP</Box>
        </Typography>
        <Box sx={{ mt: 0.6, height: 6, borderRadius: 3, bgcolor: t.hover.medium, overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: t.gold, transition: 'width 0.3s ease' }} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: t.text.secondary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {reward.progress}/{reward.threshold}
      </Typography>
    </Box>
  );
}
