'use client';

import { Box, Typography, Avatar, CircularProgress } from '@mui/material';
import { Groups } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getAvatarUrl } from '@/lib/constants';
import { fetchReferralLeaderboard, type ReferralLeaderboardEntry } from '@/lib/api';

function truncate(a: string): string {
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}
function rankColor(rank: number, t: ReturnType<typeof useThemeTokens>): string {
  if (rank === 1) return t.gold;
  if (rank === 2) return '#C0C0C0';
  if (rank === 3) return '#CD7F32';
  return t.text.quaternary;
}

/**
 * Top referrers by VALID referrals (active + non-suspect). Top 20 carry a UP
 * prize, awarded at campaign end. The caller's own row is pinned below when
 * they're outside the visible list.
 */
export function ReferralLeaderboard() {
  const t = useThemeTokens();
  const { walletAddress } = useWalletBridge();
  const { data, isLoading } = useQuery({
    queryKey: ['referral-leaderboard', walletAddress],
    queryFn: () => fetchReferralLeaderboard(walletAddress ?? undefined),
    refetchInterval: 60_000,
  });
  const entries = data?.data ?? [];
  const self = data?.self ?? null;
  const selfInList = !!walletAddress && entries.some(e => e.walletAddress === walletAddress);

  const row = (e: ReferralLeaderboardEntry, highlight: boolean) => (
    <Box
      key={e.walletAddress}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1,
        bgcolor: highlight ? withAlpha(t.up, 0.08) : 'transparent',
        '&:not(:first-of-type)': { borderTop: `1px solid ${t.border.subtle}` },
        '&:hover': { bgcolor: highlight ? withAlpha(t.up, 0.12) : t.hover.light },
      }}
    >
      <Typography sx={{ width: 24, flexShrink: 0, fontSize: '0.78rem', fontWeight: 800, color: rankColor(e.rank, t), fontVariantNumeric: 'tabular-nums' }}>
        {e.rank}
      </Typography>
      <Avatar src={e.avatarUrl ?? getAvatarUrl(e.walletAddress)} sx={{ width: 28, height: 28, flexShrink: 0, bgcolor: t.bg.surfaceAlt }} />
      <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.85rem', fontWeight: highlight ? 800 : 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {e.displayName || truncate(e.walletAddress)}{highlight ? ' (you)' : ''}
      </Typography>
      <Typography sx={{ flexShrink: 0, fontSize: '0.82rem', fontWeight: 700, color: t.text.secondary, fontVariantNumeric: 'tabular-nums', mr: 1 }}>
        {e.validReferrals}
      </Typography>
      <Box sx={{ flexShrink: 0, minWidth: 78, textAlign: 'right' }}>
        {e.prize > 0 ? (
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 800, color: t.gold, fontVariantNumeric: 'tabular-nums' }}>
            {e.prize.toLocaleString()} UP
          </Typography>
        ) : (
          <Typography sx={{ fontSize: '0.78rem', color: t.text.quaternary }}>—</Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ mt: 4 }}>
      <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 900, color: t.text.primary, mb: 0.5 }}>
        Top Referrers
      </Typography>
      <Typography sx={{ fontSize: '0.78rem', color: t.text.tertiary, mb: 2 }}>
        Ranked by valid referrals (active &amp; verified). Top 20 win UP at campaign end.
      </Typography>

      <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2, overflow: 'hidden', maxWidth: 560 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Groups sx={{ fontSize: 18, color: t.text.secondary }} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Referrer</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Valid</Typography>
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, minWidth: 78, textAlign: 'right' }}>Prize</Typography>
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={22} sx={{ color: t.text.dimmed }} /></Box>
        ) : entries.length === 0 ? (
          <Typography sx={{ fontSize: '0.82rem', color: t.text.tertiary, textAlign: 'center', py: 6 }}>No referrers yet — invite friends to climb the board</Typography>
        ) : (
          <>
            <Box>{entries.map(e => row(e, e.walletAddress === walletAddress))}</Box>
            {self && !selfInList && (
              <Box sx={{ borderTop: `2px dashed ${t.border.medium}` }}>{row(self, true)}</Box>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}
