'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Box, Typography, IconButton, Collapse, Popover, Chip } from '@mui/material';
import { ShowChart, FilterList, KeyboardArrowDown, Schedule, GridView, SportsSoccer, LocalFireDepartment, Sort, FiberManualRecord, NewReleases, History, BarChart, Timer, CheckCircleOutline } from '@mui/icons-material';
import { useCategories, type CategoryConfig } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { resolveBadgeBackground } from '@/lib/badgeBackground';

interface DropdownProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  options: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string | null; imgBg?: string | null; comingSoon?: boolean }>;
  onChange: (value: string) => void;
  color: string;
}

export function FilterDropdown({ value, label, icon, options, onChange, color }: DropdownProps) {
  const t = useThemeTokens();
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  return (
    <>
      <Box
        ref={anchorRef}
        onClick={() => setOpen(true)}
        sx={{
          display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 0.75,
          bgcolor: t.hover.default, borderRadius: '8px', cursor: 'pointer',
          transition: 'all 0.15s',
          border: open ? `1px solid ${withAlpha(color, 0.19)}` : '1px solid transparent',
          '&:hover': { bgcolor: t.hover.medium },
        }}
      >
        {icon || (selected?.img && (
          <Box component="img" src={selected.img} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', bgcolor: selected.imgBg ?? resolveBadgeBackground(null), borderRadius: '50%', p: '2px' }} />
        ))}
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, whiteSpace: 'nowrap' }}>
          {selected?.label || label}
        </Typography>
        <KeyboardArrowDown sx={{ fontSize: 16, color: t.text.quaternary, transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </Box>
      <Popover
        open={open} anchorEl={anchorRef.current} onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { bgcolor: t.bg.app, backgroundImage: 'none', border: `1px solid ${t.border.medium}`, borderRadius: '10px', mt: 0.75, py: 0.5, minWidth: 180, maxHeight: 320, overflow: 'auto', boxShadow: `0 8px 32px ${t.shadow.default}`, '&::-webkit-scrollbar': { width: 2 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: t.border.default, borderRadius: 4 }, scrollbarWidth: 'thin', scrollbarColor: `${t.border.default} transparent` } } }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          const soon = opt.comingSoon;
          return (
            <Box
              key={opt.value}
              onClick={() => { if (!soon) { onChange(opt.value); setOpen(false); } }}
              sx={{
                display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1,
                cursor: soon ? 'default' : 'pointer',
                opacity: soon ? 0.4 : 1,
                bgcolor: active ? withAlpha(color, 0.07) : 'transparent', transition: 'background 0.1s',
                '&:hover': soon ? {} : { bgcolor: active ? withAlpha(color, 0.09) : t.hover.default },
              }}
            >
              {opt.img ? (
                <Box component="img" src={opt.img} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: opt.imgBg ?? resolveBadgeBackground(null), borderRadius: '50%', p: '2px' }} />
              ) : opt.icon ? (
                <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? color : t.text.tertiary }}>
                  {opt.icon}
                </Box>
              ) : null}
              <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500, color: soon ? t.text.dimmed : active ? color : t.text.bright, flex: 1 }}>
                {opt.label}
              </Typography>
              {soon && (
                <Chip label="Soon" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 700, bgcolor: t.border.default, color: t.text.muted }} />
              )}
            </Box>
          );
        })}
      </Popover>
    </>
  );
}

export type MarketType = string; // 'CRYPTO' | 'SPORTS' | 'PM_POLITICS' | 'PM_GEO' | ...

// Secondary sort/filter applied to whatever grid the category tab is
// showing. Lives in the URL as ?sort=... so it survives reloads.
// DEFAULT keeps the upstream ordering (live → popular → upcoming → ended).
export type SortFilter =
  | 'DEFAULT'
  | 'NEWEST'
  | 'OLDEST'
  | 'VOLUME'
  | 'LIVE'
  | 'STARTING_SOON'
  | 'ENDED';

export const SORT_OPTIONS: Array<{ value: SortFilter; label: string; icon: React.ReactNode }> = [
  { value: 'DEFAULT',       label: 'Recommended',     icon: <Sort sx={{ fontSize: 18 }} /> },
  { value: 'NEWEST',        label: 'Newest',          icon: <NewReleases sx={{ fontSize: 18 }} /> },
  { value: 'OLDEST',        label: 'Oldest',          icon: <History sx={{ fontSize: 18 }} /> },
  { value: 'VOLUME',        label: 'Highest volume',  icon: <BarChart sx={{ fontSize: 18 }} /> },
  { value: 'LIVE',          label: 'Live now',        icon: <FiberManualRecord sx={{ fontSize: 14 }} /> },
  { value: 'STARTING_SOON', label: 'Starting in < 2h', icon: <Timer sx={{ fontSize: 18 }} /> },
  { value: 'ENDED',         label: 'Ended',           icon: <CheckCircleOutline sx={{ fontSize: 18 }} /> },
];

interface Props {
  marketType: MarketType;
  onMarketTypeChange: (type: MarketType) => void;
  assetFilter: string;
  intervalFilter: string;
  onAssetChange: (value: string) => void;
  onIntervalChange: (value: string) => void;
  assetOptions: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string }>;
  intervalOptions: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  sportFilter?: string;
  onSportChange?: (value: string) => void;
  leagueFilter: string;
  onLeagueChange: (value: string) => void;
  sortFilter?: SortFilter;
  onSortChange?: (value: SortFilter) => void;
}

function buildIcon(cat: CategoryConfig, size: number = 16): React.ReactNode {
  const Icon = getIcon(cat.iconKey);
  if (Icon) return <Icon sx={{ fontSize: size }} />;
  return null;
}

export function MarketFilter({
  marketType, onMarketTypeChange,
  assetFilter, intervalFilter, onAssetChange, onIntervalChange,
  assetOptions, intervalOptions,
  sportFilter = 'ALL', onSportChange,
  leagueFilter, onLeagueChange,
  sortFilter = 'DEFAULT', onSortChange,
}: Props) {
  const t = useThemeTokens();
  const [showFilters, setShowFilters] = useState(false);
  const { data: categories } = useCategories();

  // Horizontal tabs overflow on narrow widths. No visible arrows - instead
  // make the row drag-to-scroll (mouse + touch) and translate the vertical
  // mouse wheel into horizontal scroll. Tab clicks still work because we only
  // start "dragging" once the pointer moves past a small threshold.
  const tabsRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({ startX: 0, startScroll: 0, dragging: false, pointerId: -1 });
  const DRAG_THRESHOLD = 5;
  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = tabsRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const el = tabsRef.current;
    if (!el) return;
    dragState.current = { startX: e.clientX, startScroll: el.scrollLeft, dragging: false, pointerId: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (s.pointerId !== e.pointerId) return;
    const dx = e.clientX - s.startX;
    if (!s.dragging) {
      if (Math.abs(dx) < DRAG_THRESHOLD) return;
      s.dragging = true;
      try { tabsRef.current?.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    if (tabsRef.current) tabsRef.current.scrollLeft = s.startScroll - dx;
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragState.current;
    if (s.pointerId !== e.pointerId) return;
    const wasDragging = s.dragging;
    s.dragging = false;
    s.pointerId = -1;
    try { tabsRef.current?.releasePointerCapture?.(e.pointerId); } catch { /* ignore */ }
    if (wasDragging) {
      // Swallow the click that would otherwise fire after a drag.
      const stop = (ev: Event) => { ev.stopPropagation(); window.removeEventListener('click', stop, true); };
      window.addEventListener('click', stop, true);
    }
  };

  // Build dynamic tabs + Sport/League dropdowns from the SPORT_GROUP tree.
  //
  // Hierarchy:
  //   SPORT_GROUP rows = umbrella sports (Football, Rugby, Basketball, ...).
  //     They populate the Sport dropdown.
  //   FOOTBALL_LEAGUE / SPORTSDB_SPORT rows = the actual leagues. They
  //     populate the League dropdown for whatever sport is selected, via
  //     parentCode.
  // Legacy categories without parentCode still surface as top-level entries
  // in the Sport dropdown so a partially-migrated DB keeps working.
  const { tabs, sportOptions, leagueOptions } = useMemo(() => {
    const cats = categories || [];
    const visible = (c: CategoryConfig) => c.enabled || c.comingSoon;
    const sortByOrder = (a: CategoryConfig, b: CategoryConfig) => a.sortOrder - b.sortOrder;

    const pmCats = cats.filter(c => c.type === 'POLYMARKET' && c.enabled);
    const pmComingSoon = cats.filter(c => c.type === 'POLYMARKET' && !c.enabled && c.comingSoon);

    // Tabs: CRYPTO + SPORTS + enabled PM categories + coming soon PM
    const tabs: Array<{ key: string; label: string; icon: React.ReactNode; color: string; comingSoon?: boolean }> = [
      { key: 'TRENDING', label: 'Trending', icon: <LocalFireDepartment sx={{ fontSize: 16 }} />, color: t.accent },
      { key: 'CRYPTO', label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: t.up },
      { key: 'SPORTS', label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: t.draw },
      ...pmCats.map(c => ({
        key: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c),
        color: c.color || t.prediction,
      })),
      ...pmComingSoon.map(c => ({
        key: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c),
        color: c.color || '#666',
        comingSoon: true,
      })),
    ];

    // Sport dropdown = SPORT_GROUP rows + any legacy league with no parent.
    const groups = cats
      .filter(c => c.type === 'SPORT_GROUP' && visible(c))
      .sort(sortByOrder);
    const orphanLeagues = cats
      .filter(c => visible(c)
        && (c.type === 'FOOTBALL_LEAGUE' || c.type === 'SPORTSDB_SPORT')
        && !c.parentCode)
      .sort(sortByOrder);

    const sportOptions: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string | null; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Sports', icon: <GridView sx={{ fontSize: 18 }} /> },
      ...groups.map(c => ({
        value: c.code,
        // Sport GROUPS use the full sport name (Baseball), not shortLabel
        // (which is often the flagship league, e.g. "MLB").
        label: c.label || c.shortLabel || c.code,
        icon: buildIcon(c, 18),
        comingSoon: !c.enabled && c.comingSoon,
      })),
      // Legacy top-level leagues still show - parentCode null shouldn't
      // hide a category from the user just because it pre-dates the
      // hierarchy migration.
      ...orphanLeagues.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c, 18),
        comingSoon: !c.enabled && c.comingSoon,
      })),
    ];

    // League dropdown depends on the selected Sport group. For ALL, surface
    // every league across every group (the historical "All" behaviour).
    // For a specific group, list its children. For an orphan top-level
    // league, hide the League dropdown entirely (no children to show).
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
    const leagueOptions: Array<{ value: string; label: string; img?: string | null; imgBg?: string | null; icon?: React.ReactNode; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All', img: null, icon: <GridView sx={{ fontSize: 18 }} /> },
      ...childLeagues.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        img: c.badgeUrl,
        // Pre-resolve the bg so the dropdown renderer stays dumb - the
        // helper falls back to the historical white when the category
        // hasn't been analyzed yet.
        imgBg: resolveBadgeBackground(c.badgeBgColor),
        comingSoon: !c.enabled && c.comingSoon,
      })),
    ];

    return { tabs, sportOptions, leagueOptions };
  }, [categories, sportFilter, t]);

  // Whether to render the League dropdown next to Sport: only if the
  // selected sport has at least one child league (or is "All").
  const showLeagueFilter = sportFilter === 'ALL' || leagueOptions.length > 1;

  const currentTab = tabs.find(tab => tab.key === marketType) || tabs[0];
  const tabColor = currentTab.color;
  const isPM = marketType.startsWith('PM_');
  // Hide the secondary filter row only on the Trending landing - every
  // category grid (crypto, sports, PM_*) gets the row so users can sort
  // / filter the cards (newest, ended, live, starting soon, volume, …).
  // PM used to be excluded but a sort selector makes sense there too;
  // PM rows just don't have Asset/Interval or Sport/League dropdowns,
  // they only get the Sort one below.
  const hideFilters = marketType === 'TRENDING';

  const assetOpts = assetOptions.map(o => ({ ...o, img: o.img || null }));
  const intervalOpts = intervalOptions.map(o => ({ ...o, img: null }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, py: 0.5 }}>
      {/* Primary tabs */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box
          ref={tabsRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          sx={{
            display: 'flex', gap: 0, overflow: 'auto', minWidth: 0,
            cursor: 'grab', userSelect: 'none', touchAction: 'pan-x',
            '&:active': { cursor: 'grabbing' },
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {tabs.map((tab) => {
            const active = marketType === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => { if (!tab.comingSoon) { onMarketTypeChange(tab.key); setShowFilters(false); } }}
                sx={{
                  display: 'flex', alignItems: 'center', gap: 0.75,
                  px: { xs: 1.25, md: 2 }, py: 1,
                  cursor: tab.comingSoon ? 'default' : 'pointer',
                  borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                  color: tab.comingSoon ? t.text.disabled : active ? tab.color : t.text.quaternary,
                  opacity: tab.comingSoon ? 0.5 : 1,
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  '&:hover': tab.comingSoon ? {} : { color: tab.color },
                  position: 'relative',
                }}
              >
                {tab.icon}
                <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: active ? 700 : 500 }}>
                  {tab.label}
                </Typography>
                {tab.comingSoon && (
                  <Chip label="Soon" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 700, bgcolor: t.border.default, color: t.text.dimmed, ml: 0.25 }} />
                )}
              </Box>
            );
          })}
        </Box>
        {!hideFilters && (
          <IconButton
            onClick={() => setShowFilters(!showFilters)}
            size="small"
            sx={{ color: showFilters ? tabColor : t.text.quaternary, '&:hover': { color: tabColor }, flexShrink: 0 }}
          >
            <FilterList sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>

      {/* Collapsible filter dropdowns */}
      <Collapse in={showFilters && !hideFilters}>
        <Box sx={{ display: 'flex', gap: 1, py: 0.5, flexWrap: 'wrap' }}>
          {/* Sort/filter: same dropdown across crypto / sports / PM. Sits
              first so users don't have to hunt for it after picking sport
              or asset. "Recommended" keeps the upstream order. */}
          {onSortChange && (
            <FilterDropdown
              value={sortFilter}
              label="Sort"
              icon={<Sort sx={{ fontSize: 18, color: t.text.secondary }} />}
              options={SORT_OPTIONS.map(o => ({ value: o.value, label: o.label, icon: o.icon }))}
              onChange={(v) => onSortChange(v as SortFilter)}
              color={tabColor}
            />
          )}
          {marketType === 'CRYPTO' ? (
            <>
              <FilterDropdown value={assetFilter} label="Asset" options={assetOpts} onChange={onAssetChange} color={t.up} />
              <FilterDropdown value={intervalFilter} label="Interval" icon={<Schedule sx={{ fontSize: 18, color: t.text.secondary }} />} options={intervalOpts} onChange={onIntervalChange} color={t.up} />
            </>
          ) : marketType === 'SPORTS' ? (
            <>
              <FilterDropdown value={sportFilter} label="Sport" options={sportOptions} onChange={onSportChange || (() => {})} color={t.draw} />
              {/* League dropdown appears only when the selected sport has
                  child leagues. Top-level sports without children (rare
                  legacy state) hide the League dropdown entirely. */}
              {showLeagueFilter && (
                <FilterDropdown value={leagueFilter} label="League" options={leagueOptions} onChange={onLeagueChange} color={t.draw} />
              )}
            </>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}
