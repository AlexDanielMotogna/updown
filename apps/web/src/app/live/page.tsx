'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography } from '@mui/material';
import { GridView, Speed, Timer, AvTimer, Schedule, ExpandMore, ExpandLess, CurrencyBitcoin } from '@mui/icons-material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components';
import { MarketCard } from '@/components/MarketCard';
import { MarketCardSkeleton } from '@/components/MarketCardSkeleton';
import { AssetIcon } from '@/components/AssetIcon';
import { MarketsRightRail } from '@/components/sidebar/MarketsRightRail';
import { MarketFilter, type MarketType } from '@/components/sports/MarketFilter';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';
import { fetchPools } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { ReactNode } from 'react';
import type { Pool } from '@/lib/api';

const ASSET_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: 'BTC', label: 'BTC', img: '/coins/btc-coin.png' },
  { value: 'ETH', label: 'ETH', img: '/coins/eth-coin.png' },
  { value: 'SOL', label: 'SOL', img: '/coins/sol-coin.png' },
];
const INTERVAL_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: '3m', label: '3 min', icon: <Speed sx={{ fontSize: 16 }} /> },
  { value: '5m', label: '5 min', icon: <Timer sx={{ fontSize: 16 }} /> },
  { value: '15m', label: '15 min', icon: <AvTimer sx={{ fontSize: 16 }} /> },
  { value: '1h', label: '1 hour', icon: <Schedule sx={{ fontSize: 16 }} /> },
];

const endsToday = (p: Pool): boolean => {
  if (!p.endTime) return false;
  const d = new Date(p.endTime); const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};

interface Sub { key: string; label: string; count: number }
interface Topic { key: string; label: string; count: number; subs: Sub[]; kind: 'crypto' | 'sport' | 'pm' }

export default function LivePage() {
  const t = useThemeTokens();
  const router = useRouter();
  const liveScores = useLiveScores();
  const categoryMap = useCategoryMap();
  const [topic, setTopic] = useState('ALL');
  const [sub, setSub] = useState('ALL');
  const queryClient = useQueryClient();

  // Force-refresh categories on entry so a stale in-memory copy can't mislabel topics.
  useEffect(() => { queryClient.invalidateQueries({ queryKey: ['pool-categories'] }); }, [queryClient]);

  const goToHome = useCallback((key: string, value: string) => {
    const params = new URLSearchParams();
    if (key === 'type' && value !== 'CRYPTO') params.set('type', value);
    else if (key !== 'type' && value !== 'ALL') params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }, [router]);

  const filterBar = (
    <MarketFilter
      marketType={'TRENDING' as MarketType}
      onMarketTypeChange={(v: MarketType) => goToHome('type', v)}
      assetFilter="ALL" intervalFilter="ALL"
      onAssetChange={v => goToHome('asset', v)}
      onIntervalChange={v => goToHome('interval', v)}
      assetOptions={ASSET_FILTERS} intervalOptions={INTERVAL_FILTERS}
      sportFilter="ALL" onSportChange={v => goToHome('sport', v)}
      leagueFilter="ALL" onLeagueChange={v => goToHome('league', v)}
    />
  );

  // All open pools; "live" = ends today.
  const { data, isLoading } = useQuery({
    queryKey: ['live-today'],
    queryFn: () => fetchPools({ status: 'JOINING,ACTIVE', limit: 300 }),
    refetchInterval: 30_000,
  });
  const today = useMemo(() => (data?.data ?? []).filter(endsToday), [data]);

  // Build the topic tree from today's pools (so only covered/whitelisted sports appear).
  const topics = useMemo<Topic[]>(() => {
    const crypto = { count: 0, assets: new Map<string, number>() };
    const sports = new Map<string, { label: string; count: number; leagues: Map<string, { label: string; count: number }> }>();
    const pm = new Map<string, { label: string; count: number }>();

    for (const p of today) {
      if (p.poolType === 'CRYPTO') {
        crypto.count++; const a = p.asset || 'OTHER'; crypto.assets.set(a, (crypto.assets.get(a) || 0) + 1);
      } else if (p.poolType === 'POLYMARKET' || p.league?.startsWith('PM_')) {
        const code = p.league || 'PM'; const c = categoryMap.get(code);
        const e = pm.get(code); pm.set(code, { label: c?.shortLabel || c?.label || 'Predictions', count: (e?.count || 0) + 1 });
      } else {
        const lg = p.league || 'OTHER'; const lcat = categoryMap.get(lg);
        const groupCode = lcat?.parentCode || lg; const gcat = categoryMap.get(groupCode);
        const g = sports.get(groupCode) || { label: gcat?.label || gcat?.shortLabel || groupCode, count: 0, leagues: new Map() };
        g.count++;
        const le = g.leagues.get(lg); g.leagues.set(lg, { label: lcat?.shortLabel || lcat?.label || lg, count: (le?.count || 0) + 1 });
        sports.set(groupCode, g);
      }
    }

    const out: Topic[] = [];
    // Sports first (each sport = topic; leagues = subs).
    for (const [key, g] of [...sports.entries()].sort((a, b) => b[1].count - a[1].count)) {
      out.push({ key, label: g.label, count: g.count, kind: 'sport',
        subs: [...g.leagues.entries()].map(([k, v]) => ({ key: k, label: v.label, count: v.count })).sort((a, b) => b.count - a.count) });
    }
    // Crypto (assets = subs).
    if (crypto.count > 0) {
      out.push({ key: 'CRYPTO', label: 'Crypto', count: crypto.count, kind: 'crypto',
        subs: [...crypto.assets.entries()].map(([k, v]) => ({ key: k, label: k, count: v })).sort((a, b) => b.count - a.count) });
    }
    // PM categories (no subs).
    for (const [key, v] of [...pm.entries()].sort((a, b) => b[1].count - a[1].count)) {
      out.push({ key, label: v.label, count: v.count, kind: 'pm', subs: [] });
    }
    return out;
  }, [today, categoryMap]);

  const pools = useMemo(() => {
    const matches = (p: Pool): boolean => {
      if (topic === 'ALL') return true;
      if (topic === 'CRYPTO') return p.poolType === 'CRYPTO' && (sub === 'ALL' || p.asset === sub);
      if (topic.startsWith('PM_')) return p.league === topic;
      // sport group
      if (p.poolType !== 'SPORTS') return false;
      const g = categoryMap.get(p.league || '')?.parentCode || p.league;
      if (g !== topic) return false;
      return sub === 'ALL' || p.league === sub;
    };
    return today.filter(matches);
  }, [today, topic, sub, categoryMap]);

  const getLs = (p: Pool) => (p.matchId ? liveScores.get(p.matchId) ?? null : null);

  const kindColor = (kind: Topic['kind']): string => (kind === 'crypto' ? t.up : kind === 'pm' ? t.prediction : t.draw);

  const topicIcon = (tp: Topic): ReactNode => {
    if (tp.kind === 'crypto') return <CurrencyBitcoin sx={{ fontSize: 18 }} />;
    const cat = categoryMap.get(tp.key);
    if (cat?.badgeUrl) return <Box component="img" src={cat.badgeUrl} alt="" sx={{ width: 18, height: 18, objectFit: 'contain' }} />;
    const Icon = getIcon(cat?.iconKey);
    return Icon ? <Icon sx={{ fontSize: 18 }} /> : <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'currentColor' }} />;
  };
  const subIcon = (kind: Topic['kind'], key: string): ReactNode => {
    if (kind === 'crypto') return <AssetIcon asset={key} size={16} />;
    const cat = categoryMap.get(key);
    if (cat?.badgeUrl) return <Box component="img" src={cat.badgeUrl} alt="" sx={{ width: 16, height: 16, objectFit: 'contain' }} />;
    const Icon = getIcon(cat?.iconKey);
    return Icon ? <Icon sx={{ fontSize: 16 }} /> : <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />;
  };

  // Matches the markets MarketSidebar SidebarItem (same fonts, gaps, padding, active color).
  const row = (icon: ReactNode, label: string, count: number, active: boolean, color: string, onClick: () => void, opts?: { indent?: boolean; expandable?: boolean; expanded?: boolean }) => (
    <Box key={(opts?.indent ? 'sub-' : '') + label} component="button" onClick={onClick}
      sx={{ display: 'flex', alignItems: 'center', gap: 1.25, width: '100%', textAlign: 'left', fontFamily: 'inherit', border: 'none', cursor: 'pointer',
        pl: opts?.indent ? 3.5 : 1.5, pr: 1.5, py: 1, borderRadius: 1, transition: 'all 0.12s ease',
        bgcolor: active ? withAlpha(color, 0.1) : 'transparent',
        color: active ? color : t.text.secondary,
        '&:hover': { bgcolor: active ? withAlpha(color, 0.12) : t.hover.default, color } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>{icon}</Box>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label} <Box component="span" sx={{ color: t.text.tertiary, fontWeight: 500 }}>({count})</Box>
      </Typography>
      {opts?.expandable && (opts.expanded ? <ExpandLess sx={{ fontSize: 18 }} /> : <ExpandMore sx={{ fontSize: 18 }} />)}
    </Box>
  );

  return (
    <AppShell topBar={filterBar}>
      <Box sx={{ display: 'flex', gap: 2, px: { xs: 1.5, md: 2.5 }, pt: 2, pb: 6, alignItems: 'flex-start' }}>
        {/* Left: topic + subfilter tree (live = ends today) */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: 0.5, width: 210, flexShrink: 0, position: 'sticky', top: 128, maxHeight: 'calc(100vh - 144px)', overflowY: 'auto' }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 800, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, px: 1.25, mb: 0.5 }}>Live today</Typography>
          {row(<GridView sx={{ fontSize: 18 }} />, 'All', today.length, topic === 'ALL', t.text.primary, () => { setTopic('ALL'); setSub('ALL'); })}
          {topics.map(tp => (
            <Box key={tp.key} sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {row(topicIcon(tp), tp.label, tp.count, topic === tp.key, kindColor(tp.kind), () => { setTopic(tp.key); setSub('ALL'); }, { expandable: tp.subs.length > 0, expanded: topic === tp.key })}
              {topic === tp.key && tp.subs.length > 0 && (
                <>
                  {row(<GridView sx={{ fontSize: 16 }} />, 'All ' + tp.label, tp.count, sub === 'ALL', kindColor(tp.kind), () => setSub('ALL'), { indent: true })}
                  {tp.subs.map(s => row(subIcon(tp.kind, s.key), s.label, s.count, sub === s.key, kindColor(tp.kind), () => setSub(s.key), { indent: true }))}
                </>
              )}
            </Box>
          ))}
        </Box>

        {/* Center: header + 2-column grid */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Box sx={{ width: 9, height: 9, borderRadius: '50%', bgcolor: t.down, animation: 'liveDot 1.4s ease-in-out infinite', '@keyframes liveDot': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.3 } } }} />
            <Typography sx={{ fontSize: '1.3rem', fontWeight: 900, color: t.down, letterSpacing: 0.5 }}>LIVE · {today.length}</Typography>
          </Box>

          {isLoading ? (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gridAutoRows: '1fr', gap: 2 }}>
              {Array.from({ length: 6 }).map((_, i) => <MarketCardSkeleton key={i} />)}
            </Box>
          ) : pools.length === 0 ? (
            <Typography sx={{ textAlign: 'center', color: t.text.tertiary, py: 8 }}>Nothing live today in this filter.</Typography>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gridAutoRows: '1fr', gap: 2 }}>
              {pools.map(p => (
                <MarketCard key={p.id} pool={p} liveScore={getLs(p)} category={p.league ? categoryMap.get(p.league) : undefined}
                  onClick={() => router.push(p.poolType === 'CRYPTO' ? `/pool/${p.id}` : `/match/${p.id}`)} />
              ))}
            </Box>
          )}
        </Box>

        {/* Right: markets rail */}
        <Box sx={{ display: { xs: 'none', lg: 'block' }, width: 240, flexShrink: 0, position: 'sticky', top: 128, height: 'calc(100vh - 144px)' }}>
          <MarketsRightRail />
        </Box>
      </Box>
    </AppShell>
  );
}
