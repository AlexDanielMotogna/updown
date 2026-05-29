'use client';

import { useState } from 'react';
import { Box, Typography, Skeleton, Button, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { fetchRewardHistory } from '@/lib/api';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getRewardMeta, formatRelativeTime } from './reward-meta';

type Filter = 'ALL' | 'XP' | 'COINS';
const FILTERS: Filter[] = ['ALL', 'XP', 'COINS'];

/** Group label for a reward's day, relative to now. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export function RewardsTab({ walletAddress }: { walletAddress: string }) {
  const t = useThemeTokens();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [limit, setLimit] = useState(25);

  const { data: res, isLoading, isFetching } = useQuery({
    queryKey: ['rewardsFeed', walletAddress, filter, limit],
    queryFn: () => fetchRewardHistory(walletAddress, { type: filter === 'ALL' ? undefined : filter, limit }),
    staleTime: 30_000,
  });

  const items = res?.data ?? [];
  const total = res?.meta?.total ?? 0;
  const hasMore = items.length < total;

  // Group consecutive items (already date-desc) by day label.
  const groups: Array<{ label: string; rows: typeof items }> = [];
  for (const r of items) {
    const label = dayLabel(r.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.rows.push(r);
    else groups.push({ label, rows: [r] });
  }

  return (
    <Box sx={{ pb: 3 }}>
      {/* Type filter */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 2 }}>
        {FILTERS.map(f => {
          const active = filter === f;
          return (
            <Box
              key={f}
              onClick={() => { setFilter(f); setLimit(25); }}
              sx={{
                px: 1.75, py: 0.6, borderRadius: 1, cursor: 'pointer', userSelect: 'none',
                fontSize: '0.78rem', fontWeight: 700,
                bgcolor: active ? withAlpha(t.up, 0.12) : t.hover.light,
                color: active ? t.up : t.text.tertiary,
                border: `1px solid ${active ? withAlpha(t.up, 0.3) : 'transparent'}`,
                transition: 'all 0.15s', '&:hover': { color: active ? t.up : t.text.primary },
              }}
            >
              {f === 'ALL' ? 'All' : f === 'XP' ? 'XP' : 'UP Coins'}
            </Box>
          );
        })}
      </Box>

      {isLoading ? (
        <>{[0, 1, 2, 3, 4].map(i => <Skeleton key={i} variant="rounded" height={40} sx={{ bgcolor: t.border.default, mb: 1, borderRadius: 1 }} />)}</>
      ) : items.length === 0 ? (
        <Typography sx={{ fontSize: '0.85rem', color: t.text.quaternary, py: 6, textAlign: 'center' }}>
          No rewards yet. Place a prediction to start earning XP and UP Coins.
        </Typography>
      ) : (
        <>
          {groups.map(g => (
            <Box key={g.label} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.text.dimmed, textTransform: 'uppercase', letterSpacing: '0.05em', mb: 1 }}>
                {g.label}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {g.rows.map(r => {
                  const meta = getRewardMeta(r.reason, t, 16);
                  const isXp = r.type === 'XP';
                  const amount = isXp
                    ? `+${Number(r.amount).toLocaleString()} XP`
                    : `+${(Number(r.amount) / UP_COINS_DIVISOR).toFixed(2)} UP`;
                  return (
                    <Box key={r.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1, borderRadius: 1, bgcolor: t.hover.light }}>
                      <Box sx={{ display: 'flex', color: meta.color, flexShrink: 0 }}>{meta.icon}</Box>
                      <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {meta.label}
                      </Typography>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: isXp ? t.prediction : t.accent, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                        {amount}
                      </Typography>
                      <Typography sx={{ fontSize: '0.7rem', color: t.text.dimmed, flexShrink: 0, width: 60, textAlign: 'right' }}>
                        {formatRelativeTime(r.createdAt)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            </Box>
          ))}

          {hasMore && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Button
                onClick={() => setLimit(l => l + 25)}
                disabled={isFetching}
                sx={{ textTransform: 'none', fontWeight: 600, fontSize: '0.8rem', color: t.text.secondary, bgcolor: t.hover.light, px: 3, py: 0.75, '&:hover': { bgcolor: t.hover.default, color: t.text.primary } }}
              >
                {isFetching ? <CircularProgress size={16} sx={{ color: t.text.secondary }} /> : 'Load more'}
              </Button>
            </Box>
          )}
        </>
      )}
    </Box>
  );
}
