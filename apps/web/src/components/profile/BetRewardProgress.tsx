'use client';

import { Box, Typography } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { UserProfile } from '@/lib/api';
import { UpIcon } from '@/components/UpIcon';

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
      borderRadius: '10px', bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`,
    }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.secondary }}>
          {remaining} more prediction{remaining === 1 ? '' : 's'} to earn{' '}
          <Box component="span" sx={{ color: t.gold, fontWeight: 700 }}>{reward.amount.toLocaleString()} <UpIcon size={13} sx={{ ml: 0.1 }} /></Box>
        </Typography>
        <Box sx={{ mt: 0.7, height: 5, borderRadius: 3, bgcolor: t.hover.medium, overflow: 'hidden' }}>
          <Box sx={{ width: `${pct}%`, height: '100%', borderRadius: 3, bgcolor: t.gold, transition: 'width 0.3s ease' }} />
        </Box>
      </Box>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
        {reward.progress}/{reward.threshold}
      </Typography>
    </Box>
  );
}
