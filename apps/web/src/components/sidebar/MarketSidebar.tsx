'use client';

import { useMemo } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { ShowChart, SportsSoccer, GridView, Schedule, Bolt, Speed, Timer } from '@mui/icons-material';
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

  // Only show on pages with market filters
  if (pathname !== '/' && pathname !== '/tournaments') return null;

  const rawType = searchParams.get('type') ?? 'CRYPTO';
  const marketType = rawType && (rawType === 'TRENDING' || rawType === 'CRYPTO' || rawType === 'SPORTS' || rawType.startsWith('PM_')) ? rawType : 'CRYPTO';
  const assetFilter = searchParams.get('asset') ?? 'ALL';
  const intervalFilter = searchParams.get('interval') ?? 'ALL';
  // Legacy SOCCER bookmarks are folded into the FOOTBALL group code.
  const rawSportRead = searchParams.get('sport') ?? 'ALL';
  const sportFilter = rawSportRead === 'SOCCER' ? 'FOOTBALL' : rawSportRead;
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
    const visible = (c: CategoryConfig) => c.enabled || c.comingSoon;
    const sortByOrder = (a: CategoryConfig, b: CategoryConfig) => a.sortOrder - b.sortOrder;

    // Sport dropdown = SPORT_GROUP rows + any legacy league without a parent.
    const groups = cats.filter(c => c.type === 'SPORT_GROUP' && visible(c)).sort(sortByOrder);
    const orphanLeagues = cats
      .filter(c => visible(c)
        && (c.type === 'FOOTBALL_LEAGUE' || c.type === 'SPORTSDB_SPORT')
        && !c.parentCode)
      .sort(sortByOrder);

    const sportOptions: Array<{ value: string; label: string; icon?: React.ReactNode; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Sports', icon: <GridView sx={{ fontSize: 14 }} /> },
      ...groups.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c, 14),
        comingSoon: !c.enabled && c.comingSoon,
      })),
      ...orphanLeagues.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c, 14),
        comingSoon: !c.enabled && c.comingSoon,
      })),
    ];

    // League dropdown = children of the selected sport group, or every
    // sport-typed league when ALL is selected.
    const leaguesForSport = (sportCode: string): CategoryConfig[] => {
      if (sportCode === 'ALL') {
        return cats
          .filter(c => visible(c) && (c.type === 'FOOTBALL_LEAGUE' || c.type === 'SPORTSDB_SPORT'))
          .sort(sortByOrder);
      }
      return cats
        .filter(c => visible(c) && c.parentCode === sportCode)
        .sort(sortByOrder);
    };

    const childLeagues = leaguesForSport(sportFilter);
    const leagueOptions: Array<{ value: string; label: string; img?: string | null; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Leagues', img: null },
      ...childLeagues.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        img: c.badgeUrl,
        comingSoon: !c.enabled && c.comingSoon,
      })),
    ];

    return { sportOptions, leagueOptions };
  }, [categories, sportFilter]);

  const isSports = marketType === 'SPORTS';
  const isCrypto = marketType === 'CRYPTO';
  const isPM = marketType.startsWith('PM_');
  const isTournaments = pathname === '/tournaments';
  const tagFilter = searchParams.get('tag') ?? 'ALL';

  // The admin-configured "Sidebar Filters" whitelist for this category - used as a
  // labels-only fallback while the counted result loads (or if a category has no
  // pools at all yet).
  const adminSubcats = useMemo(() => {
    if (!isPM || !categories) return [];
    return categories.find(c => c.code === marketType)?.subcategories ?? [];
  }, [isPM, categories, marketType]);

  // Faceted filters WITH live pool counts. The endpoint returns the curated
  // whitelist filters that actually have pools (ordered), or - when the whitelist
  // matches nothing - auto-derived filters from the pools' real tags. Always
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
            {sportOptions.map(o => (
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
          {/* League sub-section: ALL surfaces every league; a SPORT_GROUP
              selection surfaces its children; a specific-league sport
              selection collapses to just 'All Leagues' so we hide it. */}
          {leagueOptions.length > 1 && (
            <SidebarSection>
              {leagueOptions.map(o => (
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

      {/* PM subcategory filters - admin-managed via config.subcategories */}
      {isPM && pmSubcategories.length > 0 && (
        <SidebarSection>
          <SidebarItem
            label="All"
            active={tagFilter === 'ALL'}
            color={t.prediction}
            icon={<AllIcon sx={{ fontSize: 16 }} />}
            onClick={() => updateParam('tag', 'ALL')}
          />
          {pmSubcategories.map(({ label: tag, count }) => (
            <SidebarItem
              key={tag}
              label={count !== undefined ? `${tag} (${count})` : tag}
              active={tagFilter === tag}
              color={t.prediction}
              onClick={() => updateParam('tag', tag)}
            />
          ))}
        </SidebarSection>
      )}
    </Box>
  );
}
