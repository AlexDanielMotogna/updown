'use client';

import { Box, Typography, Chip } from '@mui/material';
import { ShowChart, SportsSoccer } from '@mui/icons-material';
import { UP_COLOR, DRAW_COLOR } from '@/lib/constants';

const LEAGUE_FILTERS = [
  { value: 'ALL', label: 'All Leagues', img: null },
  { value: 'CL', label: 'UCL', img: 'https://crests.football-data.org/CL.png' },
  { value: 'PL', label: 'Premier', img: 'https://crests.football-data.org/PL.png' },
  { value: 'PD', label: 'La Liga', img: 'https://crests.football-data.org/PD.png' },
  { value: 'SA', label: 'Serie A', img: 'https://crests.football-data.org/SA.png' },
  { value: 'BL1', label: 'Bundesliga', img: 'https://crests.football-data.org/BL1.png' },
  { value: 'FL1', label: 'Ligue 1', img: 'https://crests.football-data.org/FL1.png' },
];

interface Props {
  marketType: 'CRYPTO' | 'SPORTS';
  onMarketTypeChange: (type: 'CRYPTO' | 'SPORTS') => void;
  // Crypto filters
  assetFilter: string;
  intervalFilter: string;
  onAssetChange: (value: string) => void;
  onIntervalChange: (value: string) => void;
  assetOptions: Array<{ value: string; label: string; icon?: React.ReactNode; img?: string }>;
  intervalOptions: Array<{ value: string; label: string; icon?: React.ReactNode }>;
  // Sports filters
  leagueFilter: string;
  onLeagueChange: (value: string) => void;
}

export function MarketFilter({
  marketType, onMarketTypeChange,
  assetFilter, intervalFilter, onAssetChange, onIntervalChange,
  assetOptions, intervalOptions,
  leagueFilter, onLeagueChange,
}: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, mb: 3 }}>
      {/* Primary tabs: Crypto | Sports */}
      <Box sx={{ display: 'flex', gap: 0 }}>
        {[
          { key: 'CRYPTO' as const, label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: UP_COLOR },
          { key: 'SPORTS' as const, label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: DRAW_COLOR },
        ].map((tab) => {
          const active = marketType === tab.key;
          return (
            <Box
              key={tab.key}
              onClick={() => onMarketTypeChange(tab.key)}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                px: 2,
                py: 1,
                cursor: 'pointer',
                borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                color: active ? tab.color : 'rgba(255,255,255,0.35)',
                transition: 'all 0.15s ease',
                '&:hover': { color: tab.color },
              }}
            >
              {tab.icon}
              <Typography sx={{ fontSize: '0.85rem', fontWeight: active ? 700 : 500 }}>
                {tab.label}
              </Typography>
            </Box>
          );
        })}
      </Box>

      {/* Sub-filters */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, overflowX: 'auto', '&::-webkit-scrollbar': { display: 'none' }, scrollbarWidth: 'none' }}>
        {marketType === 'CRYPTO' ? (
          <>
            {assetOptions.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                size="small"
                icon={f.img ? <Box component="img" src={f.img} alt={f.label} sx={{ width: 16, height: 16, borderRadius: '50%' }} /> : f.icon as React.ReactElement}
                onClick={() => onAssetChange(f.value)}
                sx={{
                  fontWeight: 600, fontSize: '0.75rem', border: 'none', flexShrink: 0, height: 30,
                  bgcolor: assetFilter === f.value ? `${UP_COLOR}20` : 'rgba(255,255,255,0.04)',
                  color: assetFilter === f.value ? UP_COLOR : 'text.secondary',
                  '&:hover': { bgcolor: assetFilter === f.value ? `${UP_COLOR}28` : 'rgba(255,255,255,0.08)' },
                }}
              />
            ))}
            <Box sx={{ width: '1px', height: 20, bgcolor: 'rgba(255,255,255,0.08)', mx: 0.5, flexShrink: 0 }} />
            {intervalOptions.map((f) => (
              <Chip
                key={f.value}
                label={f.label}
                size="small"
                icon={f.icon as React.ReactElement}
                onClick={() => onIntervalChange(f.value)}
                sx={{
                  fontWeight: 600, fontSize: '0.75rem', border: 'none', flexShrink: 0, height: 30,
                  bgcolor: intervalFilter === f.value ? `${UP_COLOR}20` : 'rgba(255,255,255,0.04)',
                  color: intervalFilter === f.value ? UP_COLOR : 'text.secondary',
                  '&:hover': { bgcolor: intervalFilter === f.value ? `${UP_COLOR}28` : 'rgba(255,255,255,0.08)' },
                }}
              />
            ))}
          </>
        ) : (
          LEAGUE_FILTERS.map((f) => (
            <Chip
              key={f.value}
              label={f.label}
              size="small"
              icon={f.img ? <Box component="img" src={f.img} alt={f.label} sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.9)', borderRadius: '50%', p: '2px' }} /> : undefined}
              onClick={() => onLeagueChange(f.value)}
              sx={{
                fontWeight: 600, fontSize: '0.75rem', border: 'none', flexShrink: 0, height: 30,
                bgcolor: leagueFilter === f.value ? `${DRAW_COLOR}20` : 'rgba(255,255,255,0.04)',
                color: leagueFilter === f.value ? DRAW_COLOR : 'text.secondary',
                '&:hover': { bgcolor: leagueFilter === f.value ? `${DRAW_COLOR}28` : 'rgba(255,255,255,0.08)' },
              }}
            />
          ))
        )}
      </Box>
    </Box>
  );
}
