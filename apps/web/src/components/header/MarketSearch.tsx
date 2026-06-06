'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, ClickAwayListener, CircularProgress } from '@mui/material';
import { Search, Close } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { searchPools, fetchTrendingPools, type PoolSearchResult } from '@/lib/api';
import { kindOf } from '@/lib/poolKind';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AssetIcon } from '@/components/AssetIcon';
import { getAssetName } from '@/lib/assets';
import { INTERVAL_LABELS } from '@/lib/constants';

function resultLabel(r: PoolSearchResult): string {
  // Crypto rows reuse the same headline the cards use ("Bitcoin Up or
  // Down · 5m") instead of the bare "BTC · 5m" so the dropdown reads
  // like a real market list rather than an asset ticker.
  if (kindOf(r) === 'crypto') {
    const intervalLabel = INTERVAL_LABELS[r.interval] || r.interval;
    return `${getAssetName(r.asset)} Up or Down · ${intervalLabel}`;
  }
  if (r.awayTeam) return `${r.homeTeam} vs ${r.awayTeam}`;
  return r.homeTeam || 'Market';
}

function resultCategory(r: PoolSearchResult): string {
  if (kindOf(r) === 'crypto') return 'Crypto';
  if (r.league?.startsWith('PM_')) {
    return r.league.slice(3).replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  }
  return 'Sports';
}

/** Navbar typeahead that searches ACTIVE pools (open for betting) and navigates
 *  to the pool/match page on select - like the market search on Polymarket/Kalshi. */
export function MarketSearch() {
  const t = useThemeTokens();
  const router = useRouter();
  const [value, setValue] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value.trim()), 250);
    return () => clearTimeout(id);
  }, [value]);

  const { data: searchResults = [], isFetching: searchFetching } = useQuery({
    queryKey: ['pool-search', debounced],
    queryFn: () => searchPools(debounced).then(r => r.data ?? []),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });

  // When the input is empty and the dropdown is open, we surface the
  // trending mix the home page uses (mixed crypto / sports / PM, ranked
  // by 24h volume, falling through to lower-activity pools when nothing
  // is hot). The trending endpoint returns the full Pool shape; we
  // narrow it to the PoolSearchResult fields the dropdown row renders.
  const { data: trendingResults = [], isFetching: trendingFetching } = useQuery({
    queryKey: ['pool-search-trending'],
    queryFn: async () => {
      const r = await fetchTrendingPools();
      return (r.data ?? []).slice(0, 12).map<PoolSearchResult>(p => ({
        id: p.id,
        status: p.status,
        poolType: p.poolType,
        league: p.league ?? null,
        asset: p.asset,
        interval: p.interval,
        homeTeam: p.homeTeam ?? null,
        awayTeam: p.awayTeam ?? null,
        homeTeamCrest: p.homeTeamCrest ?? null,
        startTime: p.startTime,
      }));
    },
    enabled: open && debounced.length < 2,
    staleTime: 30_000,
  });

  const isSearchMode = debounced.length >= 2;
  const results = isSearchMode ? searchResults : trendingResults;
  const isFetching = isSearchMode ? searchFetching : trendingFetching;

  const navigate = (r: PoolSearchResult) => {
    router.push(kindOf(r) === 'crypto' ? `/pool/${r.id}` : `/match/${r.id}`);
    setOpen(false);
    setValue('');
  };

  const showDropdown = open;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative', display: { xs: 'none', sm: 'block' }, flex: 1, maxWidth: 480, mx: { sm: 1.5, lg: 3 } }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, height: 36,
            bgcolor: t.hover.default, borderRadius: '20px', px: 1.5,
            border: `1px solid ${open ? t.border.medium : 'transparent'}`,
            transition: 'border-color 0.15s',
          }}
        >
          <Search sx={{ fontSize: 18, color: t.text.dimmed, flexShrink: 0 }} />
          <Box
            component="input"
            value={value}
            onFocus={() => setOpen(true)}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => { setValue(e.target.value); setOpen(true); }}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' && results[0]) navigate(results[0]);
              else if (e.key === 'Escape') setOpen(false);
            }}
            placeholder="Search markets"
            sx={{
              flex: 1, minWidth: 0, bgcolor: 'transparent', border: 'none', outline: 'none',
              color: t.text.primary, fontSize: '0.85rem', fontFamily: 'inherit',
              '&::placeholder': { color: t.text.dimmed },
            }}
          />
          {value && (
            <Close
              onClick={() => setValue('')}
              sx={{ fontSize: 16, color: t.text.dimmed, cursor: 'pointer', flexShrink: 0, '&:hover': { color: t.text.primary } }}
            />
          )}
        </Box>

        {showDropdown && (
          <Box
            sx={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
              bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, borderRadius: '8px',
              boxShadow: t.surfaceShadow, overflow: 'hidden', zIndex: 1300,
              maxHeight: '70vh', overflowY: 'auto',
            }}
          >
            {isFetching && results.length === 0 ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                <CircularProgress size={18} sx={{ color: t.text.dimmed }} />
              </Box>
            ) : results.length === 0 ? (
              <Typography sx={{ fontSize: '0.8rem', color: t.text.dimmed, px: 2, py: 2, textAlign: 'center' }}>
                {isSearchMode ? 'No active markets found' : 'No markets available yet'}
              </Typography>
            ) : (
              <>
                {/* Section header — tells the user where the rows come
                    from. Hidden once they type 2+ chars so the dropdown
                    reads as pure search results. */}
                {!isSearchMode && (
                  <Typography
                    sx={{
                      fontSize: '0.6rem',
                      fontWeight: 800,
                      color: t.text.quaternary,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      px: 1.75,
                      pt: 1.25,
                      pb: 0.5,
                    }}
                  >
                    Trending markets
                  </Typography>
                )}
              {results.map(r => (
                <Box
                  key={r.id}
                  onClick={() => navigate(r)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.1, cursor: 'pointer', '&:hover': { bgcolor: t.hover.default } }}
                >
                  {/* Icon priority — crypto gets the Pacifica token SVG
                      via AssetIcon (same identity the cards use), sports
                      / PM keep the homeTeamCrest. Falls back to a coloured
                      initial when neither path resolves. */}
                  {kindOf(r) === 'crypto' ? (
                    <Box sx={{ flexShrink: 0, display: 'flex' }}>
                      <AssetIcon asset={r.asset} size={22} />
                    </Box>
                  ) : r.homeTeamCrest ? (
                    <Box component="img" src={r.homeTeamCrest} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.85)', p: '1px', flexShrink: 0 }} />
                  ) : (
                    <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: withAlpha(t.prediction, 0.15), color: t.prediction, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 700, flexShrink: 0 }}>
                      {resultCategory(r)[0]}
                    </Box>
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {resultLabel(r)}
                    </Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.secondary }}>
                      {resultCategory(r)}
                    </Typography>
                  </Box>
                </Box>
              ))}
              </>
            )}
          </Box>
        )}
      </Box>
    </ClickAwayListener>
  );
}
