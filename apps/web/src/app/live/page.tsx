'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Container, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components';
import { MarketCard } from '@/components/MarketCard';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { fetchLivePools } from '@/lib/api';
import { kindOf } from '@/lib/poolKind';
import { formatUSDC } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

const SORTS = [
  { key: 'trending', label: '🔥 Trending' },
  { key: 'volume', label: '💰 Highest Volume' },
  { key: 'bets', label: '🎲 Most Bets' },
  { key: 'new', label: '🚀 New' },
  { key: 'ending', label: '⚡ Ending Soon' },
];
const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'crypto', label: 'Crypto' },
  { key: 'sports', label: 'Sports' },
  { key: 'politics', label: 'Politics' },
  { key: 'world', label: 'World News' },
];

export default function LivePage() {
  const t = useThemeTokens();
  const router = useRouter();
  const liveScores = useLiveScores();
  const categoryMap = useCategoryMap();
  const [sort, setSort] = useState('trending');
  const [category, setCategory] = useState('all');

  const { data, isLoading } = useQuery({
    queryKey: ['live-pools', sort, category],
    queryFn: () => fetchLivePools({ sort, category }),
    refetchInterval: 30_000,
  });
  const pools = data?.data ?? [];
  const meta = data?.meta;

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <Box
      key={label}
      component="button"
      onClick={onClick}
      sx={{
        px: 1.75, py: 0.75, borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
        whiteSpace: 'nowrap', fontFamily: 'inherit', flexShrink: 0,
        border: `1px solid ${active ? 'transparent' : t.border.subtle}`,
        bgcolor: active ? t.text.primary : 'transparent',
        color: active ? t.bg.app : t.text.secondary,
        '&:hover': active ? {} : { color: t.text.primary, borderColor: t.border.medium },
      }}
    >
      {label}
    </Box>
  );

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ maxWidth: 1200, px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 }, pb: 6 }}>
        {/* Hero */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2, mb: 3, p: { xs: 2, md: 2.5 }, borderRadius: 2, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}` }}>
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: t.down, animation: 'livePulse 1.4s infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
              <Typography sx={{ fontSize: { xs: '1.2rem', md: '1.5rem' }, fontWeight: 900, color: t.text.primary, letterSpacing: 0.5 }}>LIVE MARKETS</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>Active markets open for betting — find the action.</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 3 }}>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: { xs: '1.3rem', md: '1.6rem' }, fontWeight: 900, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{(meta?.activeCount ?? 0).toLocaleString()}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Active markets</Typography>
            </Box>
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: { xs: '1.3rem', md: '1.6rem' }, fontWeight: 900, color: t.gain, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>${formatUSDC(meta?.wageredToday ?? '0', { min: 0 })}</Typography>
              <Typography sx={{ fontSize: '0.7rem', color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>Wagered (24h)</Typography>
            </Box>
          </Box>
        </Box>

        {/* Sort tabs */}
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 1, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
          {SORTS.map(s => chip(sort === s.key, s.label, () => setSort(s.key)))}
        </Box>
        {/* Category chips */}
        <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 3, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
          {CATEGORIES.map(c => chip(category === c.key, c.label, () => setCategory(c.key)))}
        </Box>

        {/* Grid */}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={26} sx={{ color: t.text.dimmed }} /></Box>
        ) : pools.length === 0 ? (
          <Typography sx={{ textAlign: 'center', color: t.text.tertiary, py: 8 }}>No active markets in this filter right now.</Typography>
        ) : (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 2 }}>
            {pools.map(p => (
              <MarketCard
                key={p.id}
                pool={p}
                liveScore={p.matchId ? liveScores.get(p.matchId) : null}
                category={p.league ? categoryMap.get(p.league) : undefined}
                onClick={() => router.push(kindOf(p) === 'crypto' ? `/pool/${p.id}` : `/match/${p.id}`)}
              />
            ))}
          </Box>
        )}
      </Container>
    </AppShell>
  );
}
