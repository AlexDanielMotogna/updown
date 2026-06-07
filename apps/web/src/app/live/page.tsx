'use client';

import { useState, useMemo } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { AppShell } from '@/components';
import { MarketCard } from '@/components/MarketCard';
import { LiveBetPanel } from '@/components/live/LiveBetPanel';
import { useLiveScores, isMatchActive } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { fetchLivePools } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import type { Pool } from '@/lib/api';

export default function LivePage() {
  const t = useThemeTokens();
  const liveScores = useLiveScores();
  const categoryMap = useCategoryMap();
  const [leagueFilter, setLeagueFilter] = useState('ALL');
  const [selected, setSelected] = useState<Pool | null>(null);

  // Live = sports only.
  const { data, isLoading } = useQuery({
    queryKey: ['live-sports'],
    queryFn: () => fetchLivePools({ sort: 'trending', category: 'sports', limit: 60 }),
    refetchInterval: 30_000,
  });
  const allPools = data?.data ?? [];

  // Leagues present, with counts (for the vertical rail + horizontal chips).
  const leagues = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of allPools) { const k = p.league || 'OTHER'; m.set(k, (m.get(k) || 0) + 1); }
    return [...m.entries()]
      .map(([code, count]) => ({ code, count, label: categoryMap.get(code)?.shortLabel || categoryMap.get(code)?.label || code }))
      .sort((a, b) => b.count - a.count);
  }, [allPools, categoryMap]);

  const pools = leagueFilter === 'ALL' ? allPools : allPools.filter(p => (p.league || 'OTHER') === leagueFilter);
  const getLs = (p: Pool) => (p.matchId ? liveScores.get(p.matchId) ?? null : null);
  const liveCount = allPools.filter(p => { const ls = getLs(p); return ls != null && isMatchActive(ls); }).length;

  const filterItem = (active: boolean, label: string, count: number, onClick: () => void) => (
    <Box key={label} component="button" onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, width: '100%', textAlign: 'left',
        px: 1.25, py: 0.85, borderRadius: 1, cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600,
        border: 'none', bgcolor: active ? t.hover.default : 'transparent', color: active ? t.text.primary : t.text.secondary,
        '&:hover': { bgcolor: t.hover.light, color: t.text.primary } }}>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ color: t.text.tertiary, fontWeight: 500 }}>{count}</span>
    </Box>
  );

  const chip = (active: boolean, label: string, onClick: () => void) => (
    <Box key={label} component="button" onClick={onClick}
      sx={{ px: 1.5, py: 0.6, borderRadius: '999px', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        flexShrink: 0, fontFamily: 'inherit', border: `1px solid ${active ? 'transparent' : t.border.subtle}`,
        bgcolor: active ? t.text.primary : 'transparent', color: active ? t.bg.app : t.text.secondary,
        '&:hover': active ? {} : { color: t.text.primary, borderColor: t.border.medium } }}>
      {label}
    </Box>
  );

  return (
    <AppShell>
      <Box sx={{ display: 'flex', gap: 2, maxWidth: 1400, mx: 'auto', px: { xs: 1.5, md: 2.5 }, pt: 2, pb: 6, alignItems: 'flex-start' }}>
        {/* Left vertical sport filters */}
        <Box sx={{ display: { xs: 'none', md: 'block' }, width: 200, flexShrink: 0, position: 'sticky', top: 76, maxHeight: 'calc(100vh - 92px)', overflowY: 'auto' }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, px: 1.25, mb: 0.5 }}>Sports</Typography>
          {filterItem(leagueFilter === 'ALL', 'All sports', allPools.length, () => setLeagueFilter('ALL'))}
          {leagues.map(l => filterItem(leagueFilter === l.code, l.label, l.count, () => setLeagueFilter(l.code)))}
        </Box>

        {/* Center: live header + horizontal chips + feed */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: t.down, animation: 'liveDot 1.4s ease-in-out infinite', '@keyframes liveDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 900, color: t.down, letterSpacing: 0.5 }}>LIVE · {liveCount}</Typography>
          </Box>

          {/* Horizontal sport chips */}
          <Box sx={{ display: 'flex', gap: 1, overflowX: 'auto', pb: 1, mb: 2, '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
            {chip(leagueFilter === 'ALL', 'All', () => setLeagueFilter('ALL'))}
            {leagues.map(l => chip(leagueFilter === l.code, l.label, () => setLeagueFilter(l.code)))}
          </Box>

          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress size={26} sx={{ color: t.text.dimmed }} /></Box>
          ) : pools.length === 0 ? (
            <Typography sx={{ textAlign: 'center', color: t.text.tertiary, py: 8 }}>No live sports markets right now.</Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {pools.map(p => (
                <Box key={p.id} onClick={() => setSelected(p)}
                  sx={{ cursor: 'pointer', borderRadius: 2, outline: selected?.id === p.id ? `2px solid ${t.accent}` : '2px solid transparent', transition: 'outline-color 0.15s' }}>
                  <MarketCard pool={p} liveScore={getLs(p)} category={p.league ? categoryMap.get(p.league) : undefined} />
                </Box>
              ))}
            </Box>
          )}
        </Box>

        {/* Right: inline bet panel */}
        <Box sx={{ display: { xs: 'none', lg: 'block' }, width: 320, flexShrink: 0, position: 'sticky', top: 76 }}>
          <LiveBetPanel pool={selected} />
        </Box>
      </Box>
    </AppShell>
  );
}
