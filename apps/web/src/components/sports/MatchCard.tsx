'use client';

import { Box, Typography, Chip } from '@mui/material';
import Link from 'next/link';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR, GAIN_COLOR } from '@/lib/constants';
import { formatUSDC } from '@/lib/format';
import type { Pool } from '@/lib/api';

function formatKickoff(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) return 'Live';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

export function MatchCard({ pool }: { pool: Pool }) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const totalDraw = Number(pool.totalDraw);
  const total = totalUp + totalDown + totalDraw;
  const homePct = total > 0 ? Math.round((totalUp / total) * 100) : 33;
  const awayPct = total > 0 ? Math.round((totalDown / total) * 100) : 33;
  const drawPct = total > 0 ? 100 - homePct - awayPct : 34;

  const isLive = pool.status === 'ACTIVE';
  const isJoining = pool.status === 'JOINING';
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const league = pool.league || '';

  return (
    <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none' }}>
      <Box
        sx={{
          bgcolor: '#0D1219',
          p: { xs: 1.5, md: 2 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          transition: 'background 0.15s ease',
          cursor: 'pointer',
          '&:hover': { background: 'rgba(255,255,255,0.04)' },
        }}
      >
        {/* Header: league + kickoff */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {league === 'CL' ? 'Champions League' : league}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isLive && (
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: DOWN_COLOR, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
            )}
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isLive ? DOWN_COLOR : 'rgba(255,255,255,0.4)' }}>
              {formatKickoff(pool.startTime)}
            </Typography>
          </Box>
        </Box>

        {/* Teams */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'right', flex: 1 }}>
            {pool.homeTeam || 'Home'}
          </Typography>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>
            vs
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'left', flex: 1 }}>
            {pool.awayTeam || 'Away'}
          </Typography>
        </Box>

        {/* 3-way odds bar */}
        <Box sx={{ display: 'flex', gap: '2px', height: 28 }}>
          <Box sx={{ flex: homePct, bgcolor: `${UP_COLOR}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: UP_COLOR }}>
              {isResolved && pool.winner === 'UP' ? '\u2713 ' : ''}{homePct}%
            </Typography>
          </Box>
          <Box sx={{ flex: drawPct, bgcolor: `${DRAW_COLOR}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: DRAW_COLOR }}>
              {isResolved && pool.winner === 'DRAW' ? '\u2713 ' : ''}{drawPct}%
            </Typography>
          </Box>
          <Box sx={{ flex: awayPct, bgcolor: `${DOWN_COLOR}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: DOWN_COLOR }}>
              {isResolved && pool.winner === 'DOWN' ? '\u2713 ' : ''}{awayPct}%
            </Typography>
          </Box>
        </Box>

        {/* Labels under odds bar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
          <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>Home</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>Draw</Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)' }}>Away</Typography>
        </Box>

        {/* Pool info */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
            {pool.betCount} predictions
          </Typography>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: GAIN_COLOR }}>
            {formatUSDC(pool.totalPool)}
          </Typography>
        </Box>
      </Box>
    </Link>
  );
}
