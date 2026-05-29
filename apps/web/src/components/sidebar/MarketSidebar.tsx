'use client';

import { useMemo, useState } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { ShowChart, SportsSoccer, GridView, Schedule, Bolt, Speed, Timer, Search, Close } from '@mui/icons-material';
import { SvgIcon } from '@mui/material';

function AllIcon(props: React.ComponentProps<typeof SvgIcon>) {
  return (
    <SvgIcon {...props} viewBox="0 0 24 24">
      <path fillRule="evenodd" d="M3 3v8h8V3zm6 6H5V5h4zm-6 4v8h8v-8zm6 6H5v-4h4zm4-16v8h8V3zm6 6h-4V5h4zm-6 4v8h8v-8zm6 6h-4v-4h4z" />
    </SvgIcon>
  );
}
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useCategories, type CategoryConfig } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

function buildIcon(cat: CategoryConfig, size: number = 16): React.ReactNode {
  const Icon = getIcon(cat.iconKey);
  if (Icon) return <Icon sx={{ fontSize: size }} />;
  return null;
}

const ASSET_OPTIONS: Array<{ value: string; label: string; img?: string; icon?: React.ReactNode }> = [
  { value: 'ALL', label: 'All Assets', icon: <AllIcon sx={{ fontSize: 16 }} /> },
  { value: 'BTC', label: 'Bitcoin', img: 'https://app.pacifica.fi/imgs/tokens/BTC.svg' },
  { value: 'ETH', label: 'Ethereum', img: 'https://app.pacifica.fi/imgs/tokens/ETH.svg' },
  { value: 'SOL', label: 'Solana', img: 'https://app.pacifica.fi/imgs/tokens/SOL.svg' },
];

const INTERVAL_OPTIONS: Array<{ value: string; label: string; icon: React.ReactNode }> = [
  { value: 'ALL', label: 'All Times', icon: <AllIcon sx={{ fontSize: 16 }} /> },
  { value: '3m', label: 'Turbo 3m', icon: <Bolt sx={{ fontSize: 16 }} /> },
  { value: '5m', label: 'Rapid 5m', icon: <Speed sx={{ fontSize: 16 }} /> },
  { value: '15m', label: 'Short 15m', icon: <Timer sx={{ fontSize: 16 }} /> },
  { value: '1h', label: 'Hourly', icon: <Schedule sx={{ fontSize: 16 }} /> },
];

function SidebarSection({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 1.5 }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {children}
      </Box>
    </Box>
  );
}

function SidebarItem({ label, active, color, icon, comingSoon, onClick }: {
  label: string; active: boolean; color: string; icon?: React.ReactNode; comingSoon?: boolean; onClick: () => void;
}) {
  const t = useThemeTokens();
  return (
    <Box
      onClick={comingSoon ? undefined : onClick}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25,
        px: 1.5, py: 1,
        borderRadius: 1,
        cursor: comingSoon ? 'default' : 'pointer',
        bgcolor: active ? withAlpha(color, 0.1) : 'transparent',
        color: comingSoon ? t.text.disabled : active ? color : t.text.secondary,
        opacity: comingSoon ? 0.5 : 1,
        transition: 'all 0.12s ease',
        '&:hover': comingSoon ? {} : { bgcolor: active ? withAlpha(color, 0.12) : t.hover.default, color },
      }}
    >
      {icon}
      <Typography sx={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500, flex: 1 }}>
        {label}
      </Typography>
      {comingSoon && (
        <Chip label="Soon" size="small" sx={{ height: 14, fontSize: '0.45rem', fontWeight: 700, bgcolor: t.border.default, color: t.text.dimmed }} />
      )}
    </Box>
  );
}

export function MarketSidebar() {
  const t = useThemeTokens();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { data: categories } = useCategories();
  const [search, setSearch] = useState('');

  // Only show on pages with market filters
  if (pathname !== '/' && pathname !== '/tournaments') return null;

  const rawType = searchParams.get('type') ?? 'CRYPTO';
  const marketType = rawType && (rawType === 'CRYPTO' || rawType === 'SPORTS' || rawType.startsWith('PM_')) ? rawType : 'CRYPTO';
  const assetFilter = searchParams.get('asset') ?? 'ALL';
  const intervalFilter = searchParams.get('interval') ?? 'ALL';
  const sportFilter = searchParams.get('sport') ?? 'ALL';
  const leagueFilter = searchParams.get('league') ?? 'ALL';

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL') params.delete(key);
    else params.set(key, value);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const { sportOptions, leagueOptions } = useMemo(() => {
    const cats = categories || [];
    const sportsDbCats = cats.filter(c => c.type === 'SPORTSDB_SPORT' && c.enabled);
    const footballCats = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && c.enabled);
    const sportsComingSoon = cats.filter(c => c.type === 'SPORTSDB_SPORT' && !c.enabled && c.comingSoon);
    const footballComingSoon = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && !c.enabled && c.comingSoon);

    const sportOptions: Array<{ value: string; label: string; icon?: React.ReactNode; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Sports', icon: <GridView sx={{ fontSize: 14 }} /> },
      { value: 'SOCCER', label: 'Soccer', icon: <SportsSoccer sx={{ fontSize: 14 }} /> },
      ...sportsDbCats.map(c => ({ value: c.code, label: c.shortLabel || c.label, icon: buildIcon(c, 14) })),
      ...sportsComingSoon.map(c => ({ value: c.code, label: c.shortLabel || c.label, icon: buildIcon(c, 14), comingSoon: true })),
    ];

    const leagueOptions: Array<{ value: string; label: string; img?: string | null; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Leagues', img: null },
      ...footballCats.map(c => ({ value: c.code, label: c.shortLabel || c.label, img: c.badgeUrl })),
      ...footballComingSoon.map(c => ({ value: c.code, label: c.shortLabel || c.label, img: c.badgeUrl, comingSoon: true })),
    ];

    return { sportOptions, leagueOptions };
  }, [categories]);

  const isSports = marketType === 'SPORTS';
  const isCrypto = marketType === 'CRYPTO';
  const isPM = marketType.startsWith('PM_');
  const isTournaments = pathname === '/tournaments';
  const tagFilter = searchParams.get('tag') ?? 'ALL';

  // Topic search — narrows the filter lists below (sports/leagues, PM topics),
  // like the search on Polymarket/Kalshi. Shown only where there are many topics.
  const q = search.trim().toLowerCase();
  const matches = (label: string) => !q || label.toLowerCase().includes(q);
  const showSearch = isPM || isSports;

  // The admin-configured "Sidebar Filters" whitelist for this category — used as a
  // labels-only fallback while the counted result loads (or if a category has no
  // pools at all yet).
  const adminSubcats = useMemo(() => {
    if (!isPM || !categories) return [];
    return categories.find(c => c.code === marketType)?.subcategories ?? [];
  }, [isPM, categories, marketType]);

  // Faceted filters WITH live pool counts. The endpoint returns the curated
  // whitelist filters that actually have pools (ordered), or — when the whitelist
  // matches nothing — auto-derived filters from the pools' real tags. Always
  // fetched for PM so every category shows counts.
  const API = typeof window !== 'undefined' ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002') : '';
  const { data: pmBuckets } = useQuery({
    queryKey: ['pool-subcategories', marketType],
    queryFn: async () => {
      const res = await fetch(`${API}/api/config/pool-subcategories?league=${marketType}`);
      const d = await res.json();
      return (d.data || []) as Array<{ label: string; count: number }>;
    },
    enabled: isPM,
    staleTime: 60_000,
  });

  // Prefer the counted result; fall back to the admin whitelist labels (no count)
  // only while loading or for a category with no pools yet.
  const pmSubcategories: Array<{ label: string; count?: number }> =
    (pmBuckets && pmBuckets.length > 0)
      ? pmBuckets
      : adminSubcats.map(label => ({ label }));

  return (
    <Box sx={{
      display: 'flex', flexDirection: 'column', height: '100%', py: 2, px: 0.5, overflow: 'auto',
      scrollbarWidth: 'none',
      '&::-webkit-scrollbar': { display: 'none' },
    }}>
      {/* Topic search */}
      {showSearch && (
        <Box sx={{ px: 1, mb: 1.5 }}>
          <Box sx={{
            display: 'flex', alignItems: 'center', gap: 0.75,
            bgcolor: t.hover.light, borderRadius: 1, px: 1.25, py: 0.6,
            border: `1px solid ${t.border.subtle}`,
            transition: 'border-color 0.15s',
            '&:focus-within': { borderColor: t.border.medium },
          }}>
            <Search sx={{ fontSize: 16, color: t.text.dimmed, flexShrink: 0 }} />
            <Box
              component="input"
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearch(e.target.value)}
              placeholder="Search topics"
              sx={{
                flex: 1, minWidth: 0, bgcolor: 'transparent', border: 'none', outline: 'none',
                color: t.text.primary, fontSize: '0.8rem', fontFamily: 'inherit',
                '&::placeholder': { color: t.text.dimmed },
              }}
            />
            {search && (
              <Close
                onClick={() => setSearch('')}
                sx={{ fontSize: 14, color: t.text.dimmed, cursor: 'pointer', flexShrink: 0, '&:hover': { color: t.text.primary } }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Crypto filters */}
      {isCrypto && (
        <>
          <SidebarSection>
            {ASSET_OPTIONS.map(o => (
              <SidebarItem
                key={o.value}
                label={o.label}
                active={assetFilter === o.value}
                color={t.up}
                icon={o.img
                  ? <Box component="img" src={o.img} alt={o.value} sx={{ width: 18, height: 18, borderRadius: '50%' }} />
                  : o.icon
                }
                onClick={() => updateParam('asset', o.value)}
              />
            ))}
          </SidebarSection>
          {!isTournaments && (
            <SidebarSection>
              {INTERVAL_OPTIONS.map(o => (
                <SidebarItem
                  key={o.value}
                  label={o.label}
                  active={intervalFilter === o.value}
                  color={t.up}
                  icon={o.icon}
                  onClick={() => updateParam('interval', o.value)}
                />
              ))}
            </SidebarSection>
          )}
        </>
      )}

      {/* Sports filters */}
      {isSports && (
        <>
          <SidebarSection>
            {sportOptions.filter(o => o.value === 'ALL' || matches(o.label)).map(o => (
              <SidebarItem
                key={o.value}
                label={o.label}
                active={sportFilter === o.value}
                color={t.draw}
                icon={o.icon}
                comingSoon={o.comingSoon}
                onClick={() => updateParam('sport', o.value)}
              />
            ))}
          </SidebarSection>
          {(sportFilter === 'ALL' || sportFilter === 'SOCCER') && (
            <SidebarSection>
              {leagueOptions.filter(o => o.value === 'ALL' || matches(o.label)).map(o => (
                <SidebarItem
                  key={o.value}
                  label={o.label}
                  active={leagueFilter === o.value}
                  color={t.draw}
                  icon={o.img ? (
                    <Box component="img" src={o.img} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '1px' }} />
                  ) : <AllIcon sx={{ fontSize: 16 }} />}
                  comingSoon={o.comingSoon}
                  onClick={() => updateParam('league', o.value)}
                />
              ))}
            </SidebarSection>
          )}
        </>
      )}

      {/* PM subcategory filters — admin-managed via config.subcategories */}
      {isPM && pmSubcategories.length > 0 && (
        <SidebarSection>
          <SidebarItem
            label="All"
            active={tagFilter === 'ALL'}
            color={t.prediction}
            icon={<AllIcon sx={{ fontSize: 16 }} />}
            onClick={() => updateParam('tag', 'ALL')}
          />
          {pmSubcategories.filter(({ label }) => matches(label)).map(({ label: tag, count }) => (
            <SidebarItem
              key={tag}
              label={count !== undefined ? `${tag} (${count})` : tag}
              active={tagFilter === tag}
              color={t.prediction}
              onClick={() => updateParam('tag', tag)}
            />
          ))}
          {q && pmSubcategories.filter(({ label }) => matches(label)).length === 0 && (
            <Typography sx={{ fontSize: '0.75rem', color: t.text.dimmed, px: 1.5, py: 1 }}>
              No topics match “{search}”
            </Typography>
          )}
        </SidebarSection>
      )}
    </Box>
  );
}
