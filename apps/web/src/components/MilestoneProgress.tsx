'use client';

import { Box, Typography, Avatar } from '@mui/material';
import { CheckCircle, Lock } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getAvatarUrl } from '@/lib/constants';
import { fetchMilestones } from '@/lib/api';

function truncate(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/**
 * Community milestones — a shared goal (user count) that airdrops UP to all
 * qualified players when reached. Shows the tier track, progress to the next
 * tier, and the effort leaderboard (top contributors by real predictions).
 */
export function MilestoneProgress() {
  const t = useThemeTokens();
  const { walletAddress } = useWalletBridge();
  const { data } = useQuery({
    queryKey: ['milestones', walletAddress],
    queryFn: () => fetchMilestones(walletAddress ?? undefined),
    refetchInterval: 60_000,
  });
  const state = data?.data;
  if (!state) return null;

  const { totalUsers, milestones, contributors, self, activeThreshold } = state;
  const next = milestones.find(m => m.status === 'active');
  const prevTarget = next ? [...milestones].reverse().find(m => m.status === 'completed')?.targetUsers ?? 0 : (milestones[milestones.length - 1]?.targetUsers ?? 0);
  const pct = next ? Math.min(100, Math.max(0, ((totalUsers - prevTarget) / (next.targetUsers - prevTarget)) * 100)) : 100;

  return (
    <Box sx={{ mb: 4, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2, p: { xs: 2, md: 2.5 } }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
        <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 900, color: t.text.primary }}>
          Community Milestones
        </Typography>
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
          {totalUsers.toLocaleString()} players
        </Typography>
      </Box>

      {/* Progress to next tier */}
      {next && (
        <Box sx={{ mb: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.secondary }}>
              Next: <Box component="span" sx={{ color: t.gold }}>{next.label}</Box> · {next.rewardPool.toLocaleString()} UP airdrop
            </Typography>
            <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
              {totalUsers.toLocaleString()} / {next.targetUsers.toLocaleString()}
            </Typography>
          </Box>
          <Box sx={{ height: 8, borderRadius: 4, bgcolor: t.hover.medium, overflow: 'hidden' }}>
            <Box sx={{ width: `${pct}%`, height: '100%', bgcolor: t.gold, transition: 'width 0.4s ease' }} />
          </Box>
        </Box>
      )}

      {/* Tier track */}
      <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 0.5, mb: 2, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
        {milestones.map(m => {
          const done = m.status === 'completed';
          const isNext = m.key === next?.key;
          const color = done ? t.gain : isNext ? t.gold : t.text.quaternary;
          return (
            <Box key={m.key} sx={{
              flex: '1 0 auto', minWidth: 96, textAlign: 'center', px: 1, py: 1.25, borderRadius: 1.5,
              bgcolor: isNext ? withAlpha(t.gold, 0.08) : 'transparent',
              border: `1px solid ${isNext ? withAlpha(t.gold, 0.4) : t.border.subtle}`,
              opacity: !done && !isNext ? 0.6 : 1,
            }}>
              <Box sx={{ display: 'flex', justifyContent: 'center', mb: 0.3, color }}>
                {done ? <CheckCircle sx={{ fontSize: 18 }} /> : isNext ? null : <Lock sx={{ fontSize: 16 }} />}
              </Box>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: t.text.primary }}>{m.label}</Typography>
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                {m.targetUsers.toLocaleString()} users
              </Typography>
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: t.gold }}>{m.rewardPool / 1000}k UP</Typography>
            </Box>
          );
        })}
      </Box>

      {self && (
        <Typography sx={{ fontSize: '0.74rem', color: t.text.secondary, mb: 1.5 }}>
          You: <b>{self.settledBets}</b> predictions ·{' '}
          <Box component="span" sx={{ color: self.qualified ? t.gain : t.text.tertiary, fontWeight: 700 }}>
            {self.qualified ? 'qualified for airdrops' : `${activeThreshold - self.settledBets} more to qualify`}
          </Box>
        </Typography>
      )}

      {/* Effort leaderboard */}
      {contributors.length > 0 && (
        <Box>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
            Top contributors
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
            {contributors.slice(0, 10).map(c => (
              <Box key={c.walletAddress} sx={{
                display: 'flex', alignItems: 'center', gap: 1, px: 1, py: 0.6, borderRadius: 1,
                bgcolor: c.walletAddress === walletAddress ? withAlpha(t.up, 0.08) : 'transparent',
              }}>
                <Typography sx={{ width: 20, fontSize: '0.74rem', fontWeight: 800, color: t.text.quaternary, fontVariantNumeric: 'tabular-nums' }}>{c.rank}</Typography>
                <Avatar src={c.avatarUrl ?? getAvatarUrl(c.walletAddress)} sx={{ width: 22, height: 22, bgcolor: t.bg.surfaceAlt }} />
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.78rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.displayName || truncate(c.walletAddress)}
                </Typography>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{c.settledBets}</Typography>
              </Box>
            ))}
          </Box>
        </Box>
      )}
    </Box>
  );
}
