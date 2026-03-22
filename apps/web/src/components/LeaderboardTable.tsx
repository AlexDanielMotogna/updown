'use client';

import { useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Typography,
  Button,
  Tabs,
  Tab,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import {
  EmojiEvents,
  LocalFireDepartment,
  MilitaryTech,
  InfoOutlined,
} from '@mui/icons-material';
import { AnimatePresence } from 'framer-motion';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { LeaderboardRow } from './leaderboard/LeaderboardRow';

export function LeaderboardTable() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const sortOptions: Array<'xp' | 'coins' | 'level'> = ['xp', 'coins', 'level'];
  const tabParam = searchParams.get('tab') as 'xp' | 'coins' | 'level' | null;
  const sortTab = tabParam && sortOptions.includes(tabParam) ? sortOptions.indexOf(tabParam) : 0;
  const sort = sortOptions[sortTab]!;
  const [page, setPage] = useState(1);
  const { data, isLoading } = useLeaderboard({ sort, page, limit: 20 });

  const handleTabChange = useCallback((_: unknown, v: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', sortOptions[v]!);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setPage(1);
  }, [searchParams, router, pathname, sortOptions]);

  const entries = data?.data ?? [];
  const meta = data?.meta;

  return (
    <Box>
      {/* Header: title + sort tabs  same pattern as PoolTable's status tabs */}
      <Box sx={{ mb: 3, mt: { xs: 2, md: 3 } }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Tabs
            value={sortTab}
            onChange={handleTabChange}
            variant="scrollable"
            scrollButtons={false}
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': {
                backgroundColor: ACCENT_COLOR,
                height: 2,
              },
              '& .MuiTab-root': {
                color: 'text.secondary',
                fontWeight: 500,
                textTransform: 'none',
                fontSize: { xs: '0.75rem', sm: '0.85rem' },
                px: { xs: 1.5, sm: 2.5 },
                minHeight: 44,
                minWidth: 'auto',
                gap: 0.75,
                '&.Mui-selected': { color: '#FFFFFF' },
              },
            }}
          >
            <Tab icon={<EmojiEvents sx={{ fontSize: 18 }} />} iconPosition="start" label="TOP XP" />
            <Tab icon={<LocalFireDepartment sx={{ fontSize: 18 }} />} iconPosition="start" label="TOP COINS" />
            <Tab icon={<MilitaryTech sx={{ fontSize: 18 }} />} iconPosition="start" label="TOP LEVEL" />
          </Tabs>
        </Box>
      </Box>

      {/* Loading */}
      {isLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: UP_COLOR }} />
        </Box>
      )}

      {/* Empty */}
      {!isLoading && entries.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
          <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
            No players yet  be the first to earn XP!
          </Typography>
        </Box>
      )}

      {/* Table */}
      {!isLoading && entries.length > 0 && (
        <Box
          sx={{
            borderRadius: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {/* Header  desktop only */}
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '60px 1fr 100px 140px 90px 120px 100px',
              px: 2,
              py: 1,
              bgcolor: '#0D1219',
            }}
          >
            {[
              { label: 'Rank', tip: 'Position based on current sorting' },
              { label: 'Player', tip: 'Wallet address of the player' },
              { label: 'Level', tip: 'Player level based on total XP earned' },
              { label: sort === 'coins' ? 'UP Coins' : 'XP', tip: sort === 'coins' ? 'Total UP Coins earned from winning bets' : 'Total experience points earned from activity' },
              { label: 'W / L', tip: 'Total wins and losses across all pools' },
              { label: 'Win Rate', tip: 'Percentage of bets won' },
              { label: 'Streak', tip: 'Current consecutive wins (resets on loss)' },
            ].map((h) => (
              <Box
                key={h.label}
                sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: 'text.secondary',
                    fontSize: '12px',
                    fontWeight: 600,
                    letterSpacing: '0.08em',
                  }}
                >
                  {h.label}
                </Typography>
                <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                  <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
            ))}
          </Box>

          {/* Rows */}
          <AnimatePresence mode="popLayout">
            {entries.map((entry, i) => (
              <LeaderboardRow
                key={entry.walletAddress}
                entry={entry}
                sort={sort}
                index={i}
              />
            ))}
          </AnimatePresence>
        </Box>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mt: 4, pb: 4 }}>
          <Button
            size="small"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              textTransform: 'none',
              '&:hover': { color: '#fff' },
            }}
          >
            Previous
          </Button>
          <Typography
            sx={{
              fontSize: '0.8rem',
              color: 'text.secondary',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            Page {page} of {meta.totalPages}
          </Typography>
          <Button
            size="small"
            disabled={page >= meta.totalPages}
            onClick={() => setPage((p) => p + 1)}
            sx={{
              fontSize: '0.75rem',
              color: 'text.secondary',
              textTransform: 'none',
              '&:hover': { color: '#fff' },
            }}
          >
            Next
          </Button>
        </Box>
      )}

      {/* End indicator */}
      {!isLoading && entries.length > 0 && meta && page >= meta.totalPages && (
        <Box sx={{ textAlign: 'center', mt: 4, pb: 4 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 400 }}>
            Showing all {meta.total} players
          </Typography>
        </Box>
      )}
    </Box>
  );
}
