'use client';

import React, { useState, useRef, useMemo } from 'react';
import { Box, Typography, IconButton, Collapse, Popover, Chip } from '@mui/material';
import { ShowChart, FilterList, KeyboardArrowDown, Schedule, GridView, SportsSoccer } from '@mui/icons-material';
import { UP_COLOR, DRAW_COLOR } from '@/lib/constants';
import { useCategories, type CategoryConfig } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';

export const PREDICTION_COLOR = '#A78BFA';

interface DropdownProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  options: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string | null; comingSoon?: boolean }>;
  onChange: (value: string) => void;
  color: string;
}

export function FilterDropdown({ value, label, icon, options, onChange, color }: DropdownProps) {
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
          bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '8px', cursor: 'pointer',
          transition: 'all 0.15s',
          border: open ? `1px solid ${color}30` : '1px solid transparent',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.07)' },
        }}
      >
        {icon || (selected?.img && (
          <Box component="img" src={selected.img} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }} />
        ))}
        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap' }}>
          {selected?.label || label}
        </Typography>
        <KeyboardArrowDown sx={{ fontSize: 16, color: 'rgba(255,255,255,0.35)', transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </Box>
      <Popover
        open={open} anchorEl={anchorRef.current} onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { bgcolor: '#0B0F14', backgroundImage: 'none', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', mt: 0.75, py: 0.5, minWidth: 180, maxHeight: 320, overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)', '&::-webkit-scrollbar': { width: 2 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 4 }, scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.06) transparent' } } }}
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
                bgcolor: active ? `${color}12` : 'transparent', transition: 'background 0.1s',
                '&:hover': soon ? {} : { bgcolor: active ? `${color}18` : 'rgba(255,255,255,0.04)' },
              }}
            >
              {opt.img ? (
                <Box component="img" src={opt.img} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }} />
              ) : opt.icon ? (
                <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? color : 'rgba(255,255,255,0.4)' }}>
                  {opt.icon}
                </Box>
              ) : null}
              <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500, color: soon ? 'rgba(255,255,255,0.3)' : active ? color : 'rgba(255,255,255,0.7)', flex: 1 }}>
                {opt.label}
              </Typography>
              {soon && (
                <Chip label="Soon" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.25)' }} />
              )}
            </Box>
          );
        })}
      </Popover>
    </>
  );
}

export type MarketType = string; // 'CRYPTO' | 'SPORTS' | 'PM_POLITICS' | 'PM_GEO' | ...

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
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const { data: categories } = useCategories();

  // Build dynamic tabs from categories
  const { tabs, sportOptions, leagueOptions } = useMemo(() => {
    const cats = categories || [];
    const pmCats = cats.filter(c => c.type === 'POLYMARKET' && c.enabled);
    const sportsDbCats = cats.filter(c => c.type === 'SPORTSDB_SPORT' && c.enabled);
    const footballCats = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && c.enabled);

    // Coming soon PM categories
    const pmComingSoon = cats.filter(c => c.type === 'POLYMARKET' && !c.enabled && c.comingSoon);

    // Tabs: CRYPTO + SPORTS + enabled PM categories + coming soon PM
    const tabs: Array<{ key: string; label: string; icon: React.ReactNode; color: string; comingSoon?: boolean }> = [
      { key: 'CRYPTO', label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: UP_COLOR },
      { key: 'SPORTS', label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: DRAW_COLOR },
      ...pmCats.map(c => ({
        key: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c),
        color: c.color || PREDICTION_COLOR,
      })),
      ...pmComingSoon.map(c => ({
        key: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c),
        color: c.color || '#666',
        comingSoon: true,
      })),
    ];

    // Sport dropdown: MUI icons only (no badge images), same as Soccer
    const sportsComingSoon = cats.filter(c => c.type === 'SPORTSDB_SPORT' && !c.enabled && c.comingSoon);
    const sportOptions: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string | null; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All Sports', icon: <GridView sx={{ fontSize: 18 }} /> },
      { value: 'SOCCER', label: 'Soccer', icon: <SportsSoccer sx={{ fontSize: 18 }} /> },
      ...sportsDbCats.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c, 18),
      })),
      ...sportsComingSoon.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        icon: buildIcon(c, 18),
        comingSoon: true,
      })),
    ];

    // League dropdown: All + enabled football leagues + coming soon (greyed out)
    const footballComingSoon = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && !c.enabled && c.comingSoon);

    // League dropdown: All + enabled football leagues
    const leagueOptions: Array<{ value: string; label: string; img?: string | null; icon?: React.ReactNode; comingSoon?: boolean }> = [
      { value: 'ALL', label: 'All', img: null, icon: <GridView sx={{ fontSize: 18 }} /> },
      ...footballCats.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        img: c.badgeUrl,
      })),
      ...footballComingSoon.map(c => ({
        value: c.code,
        label: c.shortLabel || c.label,
        img: c.badgeUrl,
        comingSoon: true,
      })),
    ];

    return { tabs, sportOptions, leagueOptions };
  }, [categories]);

  const currentTab = tabs.find(t => t.key === marketType) || tabs[0];
  const tabColor = currentTab.color;
  const isPM = marketType.startsWith('PM_');
  const hideFilters = isPM;

  const assetOpts = assetOptions.map(o => ({ ...o, img: o.img || null }));
  const intervalOpts = intervalOptions.map(o => ({ ...o, img: null }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
      {/* Primary tabs */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 0, overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
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
                  color: tab.comingSoon ? 'rgba(255,255,255,0.15)' : active ? tab.color : 'rgba(255,255,255,0.35)',
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
                  <Chip label="Soon" size="small" sx={{ height: 14, fontSize: '0.5rem', fontWeight: 700, bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', ml: 0.25 }} />
                )}
              </Box>
            );
          })}
        </Box>
        {!hideFilters && (
          <IconButton
            onClick={() => setShowFilters(!showFilters)}
            size="small"
            sx={{ color: showFilters ? tabColor : 'rgba(255,255,255,0.35)', '&:hover': { color: tabColor }, flexShrink: 0 }}
          >
            <FilterList sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>

      {/* Collapsible filter dropdowns */}
      <Collapse in={showFilters && !hideFilters}>
        <Box sx={{ display: 'flex', gap: 1, py: 0.5 }}>
          {marketType === 'CRYPTO' ? (
            <>
              <FilterDropdown value={assetFilter} label="Asset" options={assetOpts} onChange={onAssetChange} color={UP_COLOR} />
              <FilterDropdown value={intervalFilter} label="Interval" icon={<Schedule sx={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }} />} options={intervalOpts} onChange={onIntervalChange} color={UP_COLOR} />
            </>
          ) : marketType === 'SPORTS' ? (
            <>
              <FilterDropdown value={sportFilter} label="Sport" options={sportOptions} onChange={onSportChange || (() => {})} color={DRAW_COLOR} />
              {(sportFilter === 'ALL' || sportFilter === 'SOCCER') && (
                <FilterDropdown value={leagueFilter} label="League" options={leagueOptions} onChange={onLeagueChange} color={DRAW_COLOR} />
              )}
            </>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}
