'use client';

import { Box, Typography, LinearProgress } from '@mui/material';
import Avatar from '@mui/material/Avatar';
import { MilitaryTech, LocalFireDepartment } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR, getAvatarUrl } from '@/lib/constants';
import { USDC_DIVISOR } from '@/lib/format';
import type { SquadLeaderboardEntry } from '@/lib/api';

const MEDAL_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];

interface SquadLeaderboardProps {
  entries: SquadLeaderboardEntry[] | undefined;
  currentWallet: string | null;
}

function shortWallet(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function LeaderboardRow({ entry, index, isMe }: { entry: SquadLeaderboardEntry; index: number; isMe: boolean }) {
  const pnl = Number(entry.netPnl) / USDC_DIVISOR;
  const winRate = entry.totalBets > 0 ? Math.round((entry.totalWins / entry.totalBets) * 100) : 0;
  const rank = index + 1;

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
          gridTemplateColumns: '50px 1.2fr 80px 140px 120px 100px',
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
          {rank <= 3 ? (
            <MilitaryTech sx={{ fontSize: 24, color: MEDAL_COLORS[rank - 1] }} />
          ) : (
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
              {rank}
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
              border: rank <= 3 ? `1.5px solid ${MEDAL_COLORS[rank - 1]}40` : '1px solid rgba(255,255,255,0.06)',
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
              {shortWallet(entry.walletAddress)}
              {isMe && (
                <Typography component="span" sx={{ color: UP_COLOR, fontSize: '0.7rem', ml: 0.5 }}>
                  (you)
                </Typography>
              )}
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {entry.role}
            </Typography>
          </Box>
        </Box>

        {/* W / L */}
        <Box sx={{ overflow: 'hidden' }}>
          <Typography sx={{ fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            <Box component="span" sx={{ color: GAIN_COLOR, fontWeight: 500 }}>{entry.totalWins}</Box>
            <Box component="span" sx={{ color: 'text.secondary' }}> / </Box>
            <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{entry.totalBets - entry.totalWins}</Box>
          </Typography>
        </Box>

        {/* Win Rate */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, overflow: 'hidden' }}>
          <LinearProgress
            variant="determinate"
            value={winRate}
            sx={{
              width: 50,
              height: 6,
              borderRadius: 1,
              flexShrink: 0,
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

        {/* Wagered */}
        <Box sx={{ overflow: 'hidden' }}>
          <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
            ${(Number(entry.totalWagered) / USDC_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
          </Typography>
        </Box>

        {/* PnL */}
        <Box sx={{ overflow: 'hidden' }}>
          <Typography
            sx={{
              fontSize: '0.85rem',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              color: pnl > 0 ? GAIN_COLOR : pnl < 0 ? DOWN_COLOR : 'text.secondary',
            }}
          >
            {pnl >= 0 ? '+' : ''}{pnl === 0 ? '$0' : `$${pnl.toFixed(2)}`}
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
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <Box sx={{ width: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {rank <= 3 ? (
              <MilitaryTech sx={{ fontSize: 22, color: MEDAL_COLORS[rank - 1] }} />
            ) : (
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: 'text.secondary' }}>{rank}</Typography>
            )}
          </Box>
          <Avatar
            src={getAvatarUrl(entry.walletAddress)}
            alt={entry.walletAddress}
            sx={{ width: 28, height: 28, borderRadius: '50%', border: rank <= 3 ? `1.5px solid ${MEDAL_COLORS[rank - 1]}40` : '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {shortWallet(entry.walletAddress)}
              {isMe && <Typography component="span" sx={{ color: UP_COLOR, fontSize: '0.7rem', ml: 0.5 }}>(you)</Typography>}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1.5, pt: 1.5 }}>
          <Box>
            <Typography sx={{ fontSize: '0.9rem', fontVariantNumeric: 'tabular-nums' }}>
              <Box component="span" sx={{ color: GAIN_COLOR, fontWeight: 500 }}>{entry.totalWins}</Box>
              <Box component="span" sx={{ color: 'text.secondary' }}>/</Box>
              <Box component="span" sx={{ color: DOWN_COLOR, fontWeight: 500 }}>{entry.totalBets - entry.totalWins}</Box>
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>W / L</Typography>
          </Box>
          <Box>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
              ${(Number(entry.totalWagered) / USDC_DIVISOR).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>Wagered</Typography>
          </Box>
          <Box>
            <Typography
              sx={{
                fontSize: '0.9rem',
                fontWeight: 700,
                fontVariantNumeric: 'tabular-nums',
                color: pnl > 0 ? GAIN_COLOR : pnl < 0 ? DOWN_COLOR : 'text.secondary',
              }}
            >
              {pnl >= 0 ? '+' : ''}${Math.abs(pnl).toFixed(2)}
            </Typography>
            <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>PnL</Typography>
          </Box>
        </Box>
      </Box>
    </motion.div>
  );
}

export function SquadLeaderboard({ entries, currentWallet }: SquadLeaderboardProps) {
  if (!entries || entries.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
        <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
          No data yet — play some rounds!
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ borderRadius: 0, display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {/* Header — desktop only */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '50px 1.2fr 80px 140px 120px 100px',
          px: 2,
          py: 1,
          bgcolor: '#0D1219',
        }}
      >
        {['Rank', 'Player', 'W / L', 'Win Rate', 'Wagered', 'PnL'].map((h) => (
          <Typography key={h} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h}
          </Typography>
        ))}
      </Box>

      <AnimatePresence mode="popLayout">
        {entries.map((entry, i) => (
          <LeaderboardRow
            key={entry.walletAddress}
            entry={entry}
            index={i}
            isMe={entry.walletAddress === currentWallet}
          />
        ))}
      </AnimatePresence>
    </Box>
  );
}
