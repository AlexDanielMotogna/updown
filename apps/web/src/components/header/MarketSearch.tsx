'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, ClickAwayListener, CircularProgress } from '@mui/material';
import { Search, Close } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { searchPools, type PoolSearchResult } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

function resultLabel(r: PoolSearchResult): string {
  if (r.poolType !== 'SPORTS') return `${r.asset} · ${r.interval}`;
  if (r.awayTeam) return `${r.homeTeam} vs ${r.awayTeam}`;
  return r.homeTeam || 'Market';
}

function resultCategory(r: PoolSearchResult): string {
  if (r.poolType !== 'SPORTS') return 'Crypto';
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

  const { data: results = [], isFetching } = useQuery({
    queryKey: ['pool-search', debounced],
    queryFn: () => searchPools(debounced).then(r => r.data ?? []),
    enabled: debounced.length >= 2,
    staleTime: 15_000,
  });

  const navigate = (r: PoolSearchResult) => {
    router.push(r.poolType !== 'SPORTS' ? `/pool/${r.id}` : `/match/${r.id}`);
    setOpen(false);
    setValue('');
  };

  const showDropdown = open && debounced.length >= 2;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative', display: { xs: 'none', sm: 'block' }, flex: 1, maxWidth: 620, mx: { sm: 1.5, lg: 3 } }}>
        <Box
          sx={{
            display: 'flex', alignItems: 'center', gap: 0.75, height: 36,
            bgcolor: t.hover.default, borderRadius: '10px', px: 1.25,
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
                No active markets found
              </Typography>
            ) : (
              results.map(r => (
                <Box
                  key={r.id}
                  onClick={() => navigate(r)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.5, py: 1.1, cursor: 'pointer', '&:hover': { bgcolor: t.hover.default } }}
                >
                  {r.homeTeamCrest ? (
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
                    <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary }}>
                      {resultCategory(r)}
                    </Typography>
                  </Box>
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>
    </ClickAwayListener>
  );
}
