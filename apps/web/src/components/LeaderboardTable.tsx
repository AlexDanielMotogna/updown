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
  LinearProgress,
  Tooltip,
} from '@mui/material';
import {
  EmojiEvents,
  LocalFireDepartment,
  MilitaryTech,
  InfoOutlined,
} from '@mui/icons-material';
import Avatar from '@mui/material/Avatar';
import { motion, AnimatePresence } from 'framer-motion';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { UserLevelBadge } from './UserLevelBadge';
import { UP_COLOR, GAIN_COLOR, ACCENT_COLOR, DOWN_COLOR, UP_COINS_DIVISOR, getAvatarUrl } from '@/lib/constants';
import type { LeaderboardEntry } from '@/lib/api';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

function LeaderboardRow({
  entry,
  sort,
  index,
}: {
  entry: LeaderboardEntry;
  sort: 'xp' | 'coins' | 'level';
  index: number;
}) {
  const winRate = entry.totalBets > 0
    ? Math.round((entry.totalWins / entry.totalBets) * 100)
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
      layout
    >
      {/* Desktop row */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '60px 1fr 100px 140px 100px 80px 100px',
          alignItems: 'center',
          px: 2,
          py: 0,
          minHeight: 56,
          bgcolor: '#0D1219',
          transition: 'background 0.15s ease',
          '&:hover': { background: 'rgba(255,255,255,0.04)' },
        }}
      >
        {/* Rank */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {entry.rank <= 3 ? (
            <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MilitaryTech sx={{ fontSize: 24, color: MEDAL_COLORS[entry.rank - 1] }} />
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {entry.rank}
            </Typography>
          )}
        </Box>

        {/* Player */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
          <Avatar
            src={getAvatarUrl(entry.walletAddress)}
            alt={entry.walletAddress}
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: entry.rank <= 3 ? `1.5px solid ${MEDAL_COLORS[entry.rank - 1]}40` : '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: 'monospace',
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.walletAddress.slice(0, 4)}...{entry.walletAddress.slice(-4)}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
              {entry.title}
            </Typography>
          </Box>
        </Box>

        {/* Level */}
        <Box>
          <UserLevelBadge level={entry.level} title={entry.title} size="sm" />
        </Box>

        {/* Primary stat (XP or Coins) */}
        <Box>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 600,
              color: sort === 'coins' ? ACCENT_COLOR : GAIN_COLOR,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {sort === 'coins'
              ? (Number(entry.coinsLifetime) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : Number(entry.totalXp).toLocaleString()}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {sort === 'coins' ? 'UP Coins' : 'XP'}
          </Typography>
        </Box>

        {/* W / L */}
        <Box>
          <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>
            <Box component="span" sx={{ color: GAIN_COLOR, fontWeight: 500 }}>{entry.totalWins}</Box>
            <Box component="span" sx={{ color: 'text.secondary' }}> / </Box>
            <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{entry.totalBets - entry.totalWins}</Box>
          </Typography>
        </Box>

        {/* Win Rate bar */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <LinearProgress
            variant="determinate"
            value={winRate}
            sx={{
              flex: 1,
              height: 6,
              borderRadius: 1,
              bgcolor: 'rgba(255,255,255,0.06)',
              '& .MuiLinearProgress-bar': {
                bgcolor: winRate >= 60 ? GAIN_COLOR : winRate >= 40 ? ACCENT_COLOR : DOWN_COLOR,
                borderRadius: 1,
              },
            }}
          />
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'right' }}>
            {winRate}%
          </Typography>
        </Box>

        {/* Streak */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
          {entry.bestStreak >= 3 && <LocalFireDepartment sx={{ fontSize: 14, color: ACCENT_COLOR }} />}
          <Typography sx={{ fontSize: '0.8rem', color: entry.bestStreak >= 3 ? ACCENT_COLOR : 'text.secondary', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {entry.bestStreak}
          </Typography>
        </Box>
      </Box>

      {/* Mobile card */}
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          bgcolor: '#0D1219',
          p: 2,
        }}
      >
        {/* Row 1: Rank + avatar + player + level */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {entry.rank <= 3 ? (
              <MilitaryTech sx={{ fontSize: 22, color: MEDAL_COLORS[entry.rank - 1] }} />
            ) : (
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>
                {entry.rank}
              </Typography>
            )}
          </Box>
          <Avatar
            src={getAvatarUrl(entry.walletAddress)}
            alt={entry.walletAddress}
            sx={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: entry.rank <= 3 ? `1.5px solid ${MEDAL_COLORS[entry.rank - 1]}40` : '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              sx={{
                fontSize: '0.85rem',
                fontWeight: 600,
                fontFamily: 'monospace',
                color: '#fff',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {entry.walletAddress.slice(0, 6)}...{entry.walletAddress.slice(-4)}
            </Typography>
          </Box>
          <UserLevelBadge level={entry.level} title={entry.title} size="sm" />
        </Box>

        {/* Row 2: stats grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: 1.5,
            pt: 1.5,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: sort === 'coins' ? ACCENT_COLOR : GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {sort === 'coins'
                ? (Number(entry.coinsLifetime) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : Number(entry.totalXp).toLocaleString()}
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
              {sort === 'coins' ? 'Coins' : 'XP'}
            </Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
              <Box component="span" sx={{ color: GAIN_COLOR, fontWeight: 500 }}>{entry.totalWins}</Box>
              <Box component="span" sx={{ color: 'text.secondary' }}>/</Box>
              <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{entry.totalBets - entry.totalWins}</Box>
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
              W / L
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
              {entry.bestStreak >= 3 && <LocalFireDepartment sx={{ fontSize: 14, color: ACCENT_COLOR }} />}
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: entry.bestStreak >= 3 ? ACCENT_COLOR : 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                {entry.bestStreak}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
              Best Streak
            </Typography>
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

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
              gridTemplateColumns: '60px 1fr 100px 140px 100px 80px 100px',
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
