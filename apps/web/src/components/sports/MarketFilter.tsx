'use client';

import { useState, useRef } from 'react';
import { Box, Typography, IconButton, Collapse, Popover } from '@mui/material';
import { ShowChart, SportsSoccer, FilterList, KeyboardArrowDown, Schedule, GridView, TrendingUp, Gavel, Public, TheaterComedy, AccountBalance } from '@mui/icons-material';
import { UP_COLOR, DRAW_COLOR } from '@/lib/constants';

export const PREDICTION_COLOR = '#A78BFA'; // violet for predictions tab

const SPORT_OPTIONS = [
  { value: 'SOCCER', label: 'Soccer', icon: <SportsSoccer sx={{ fontSize: 18 }} /> },
];

const LEAGUE_OPTIONS = [
  { value: 'ALL', label: 'All', img: null, icon: <GridView sx={{ fontSize: 18 }} /> },
  { value: 'CL', label: 'Champions League', img: 'https://crests.football-data.org/CL.png' },
  { value: 'PL', label: 'Premier League', img: 'https://crests.football-data.org/PL.png' },
  { value: 'PD', label: 'La Liga', img: 'https://crests.football-data.org/PD.png' },
  { value: 'SA', label: 'Serie A', img: 'https://crests.football-data.org/SA.png' },
  { value: 'BL1', label: 'Bundesliga', img: 'https://crests.football-data.org/BL1.png' },
  { value: 'FL1', label: 'Ligue 1', img: 'https://crests.football-data.org/FL1.png' },
];

export const PM_CATEGORY_OPTIONS = [
  { value: 'ALL', label: 'All', img: null, icon: <GridView sx={{ fontSize: 18 }} /> },
  { value: 'PM_POLITICS', label: 'Politics', img: null, icon: <Gavel sx={{ fontSize: 18 }} /> },
  { value: 'PM_GEO', label: 'Geopolitics', img: null, icon: <Public sx={{ fontSize: 18 }} /> },
  { value: 'PM_CULTURE', label: 'Culture', img: null, icon: <TheaterComedy sx={{ fontSize: 18 }} /> },
  { value: 'PM_FINANCE', label: 'Finance', img: null, icon: <AccountBalance sx={{ fontSize: 18 }} /> },
];

interface DropdownProps {
  value: string;
  label: string;
  icon?: React.ReactNode;
  options: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string | null }>;
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
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          px: 1.5,
          py: 0.75,
          bgcolor: 'rgba(255,255,255,0.04)',
          borderRadius: '8px',
          cursor: 'pointer',
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
        open={open}
        anchorEl={anchorRef.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: '#0B0F14',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '10px',
              mt: 0.75,
              py: 0.5,
              minWidth: 180,
              boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            },
          },
        }}
      >
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <Box
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: 2,
                py: 1,
                cursor: 'pointer',
                bgcolor: active ? `${color}12` : 'transparent',
                transition: 'background 0.1s',
                '&:hover': { bgcolor: active ? `${color}18` : 'rgba(255,255,255,0.04)' },
              }}
            >
              {opt.img ? (
                <Box component="img" src={opt.img} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }} />
              ) : opt.icon ? (
                <Box sx={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: active ? color : 'rgba(255,255,255,0.4)' }}>
                  {opt.icon}
                </Box>
              ) : (
                <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)' }}>All</Typography>
                </Box>
              )}
              <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500, color: active ? color : 'rgba(255,255,255,0.7)' }}>
                {opt.label}
              </Typography>
            </Box>
          );
        })}
      </Popover>
    </>
  );
}

export type MarketType = 'CRYPTO' | 'SPORTS' | 'PM_POLITICS' | 'PM_GEO' | 'PM_CULTURE' | 'PM_FINANCE';

interface Props {
  marketType: MarketType;
  onMarketTypeChange: (type: MarketType) => void;
  assetFilter: string;
  intervalFilter: string;
  onAssetChange: (value: string) => void;
  onIntervalChange: (value: string) => void;
  assetOptions: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string }>;
  intervalOptions: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  leagueFilter: string;
  onLeagueChange: (value: string) => void;
}

const TABS: Array<{ key: MarketType; label: string; icon: React.ReactNode; color: string }> = [
  { key: 'CRYPTO', label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: UP_COLOR },
  { key: 'SPORTS', label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: DRAW_COLOR },
  { key: 'PM_POLITICS', label: 'Politics', icon: <Gavel sx={{ fontSize: 16 }} />, color: '#A78BFA' },
  { key: 'PM_GEO', label: 'Geopolitics', icon: <Public sx={{ fontSize: 16 }} />, color: '#60A5FA' },
  { key: 'PM_CULTURE', label: 'Culture', icon: <TheaterComedy sx={{ fontSize: 16 }} />, color: '#F472B6' },
  { key: 'PM_FINANCE', label: 'Finance', icon: <AccountBalance sx={{ fontSize: 16 }} />, color: '#34D399' },
];

export function MarketFilter({
  marketType, onMarketTypeChange,
  assetFilter, intervalFilter, onAssetChange, onIntervalChange,
  assetOptions, intervalOptions,
  leagueFilter, onLeagueChange,
}: Props) {
  const [showFilters, setShowFilters] = useState(false);
  const currentTab = TABS.find(t => t.key === marketType) || TABS[0];
  const tabColor = currentTab.color;
  const isPM = marketType.startsWith('PM_');

  const assetOpts = assetOptions.map(o => ({ ...o, img: o.img || null }));
  const intervalOpts = intervalOptions.map(o => ({ ...o, img: null }));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 3 }}>
      {/* Primary tabs */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 0, overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
          {TABS.map((tab) => {
            const active = marketType === tab.key;
            return (
              <Box
                key={tab.key}
                onClick={() => { onMarketTypeChange(tab.key); setShowFilters(false); }}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.75,
                  px: { xs: 1.25, md: 2 },
                  py: 1,
                  cursor: 'pointer',
                  borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                  color: active ? tab.color : 'rgba(255,255,255,0.35)',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  '&:hover': { color: tab.color },
                }}
              >
                {tab.icon}
                <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: active ? 700 : 500 }}>
                  {tab.label}
                </Typography>
              </Box>
            );
          })}
        </Box>
        {!isPM && (
          <IconButton
            onClick={() => setShowFilters(!showFilters)}
            size="small"
            sx={{ color: showFilters ? tabColor : 'rgba(255,255,255,0.35)', '&:hover': { color: tabColor }, flexShrink: 0 }}
          >
            <FilterList sx={{ fontSize: 20 }} />
          </IconButton>
        )}
      </Box>

      {/* Collapsible filter dropdowns (crypto + sports only) */}
      <Collapse in={showFilters && !isPM}>
        <Box sx={{ display: 'flex', gap: 1, py: 0.5 }}>
          {marketType === 'CRYPTO' ? (
            <>
              <FilterDropdown value={assetFilter} label="Asset" options={assetOpts} onChange={onAssetChange} color={UP_COLOR} />
              <FilterDropdown value={intervalFilter} label="Interval" icon={<Schedule sx={{ fontSize: 18, color: 'rgba(255,255,255,0.5)' }} />} options={intervalOpts} onChange={onIntervalChange} color={UP_COLOR} />
            </>
          ) : marketType === 'SPORTS' ? (
            <>
              <FilterDropdown value="SOCCER" label="Sport" icon={<SportsSoccer sx={{ fontSize: 18 }} />} options={SPORT_OPTIONS} onChange={() => {}} color={DRAW_COLOR} />
              <FilterDropdown value={leagueFilter} label="League" options={LEAGUE_OPTIONS} onChange={onLeagueChange} color={DRAW_COLOR} />
            </>
          ) : null}
        </Box>
      </Collapse>
    </Box>
  );
}
