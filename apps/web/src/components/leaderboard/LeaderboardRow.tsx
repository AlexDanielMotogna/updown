'use client';

import {
  Box,
  Typography,
  LinearProgress,
} from '@mui/material';
import {
  MilitaryTech,
  LocalFireDepartment,
} from '@mui/icons-material';
import Avatar from '@mui/material/Avatar';
import { motion } from 'framer-motion';
import { UserLevelBadge } from '../UserLevelBadge';
import { GAIN_COLOR, ACCENT_COLOR, DOWN_COLOR, UP_COINS_DIVISOR, getAvatarUrl } from '@/lib/constants';
import type { LeaderboardEntry } from '@/lib/api';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export function LeaderboardRow({
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
          gridTemplateColumns: '60px 1fr 100px 140px 90px 120px 100px',
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden' }}>
          <LinearProgress
            variant="determinate"
            value={winRate}
            sx={{
              width: 50,
              flexShrink: 0,
              height: 6,
              borderRadius: 1,
              bgcolor: `${DOWN_COLOR}40`,
              '& .MuiLinearProgress-bar': {
                bgcolor: winRate >= 60 ? GAIN_COLOR : winRate >= 40 ? ACCENT_COLOR : DOWN_COLOR,
                borderRadius: 1,
              },
            }}
          />
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontWeight: 500, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
            {winRate}%
          </Typography>
        </Box>

        {/* Streak */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
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
          <Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
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
