'use client';

import { Box, Typography, Chip } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR, GAIN_COLOR } from '@/lib/constants';
import { AnimatedValue } from '@/components/AnimatedValue';
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

export function MatchCard({ pool, onClick }: { pool: Pool; onClick?: () => void }) {
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
  const winnerLabel = isResolved && pool.winner === 'UP' ? pool.homeTeam : pool.winner === 'DOWN' ? pool.awayTeam : pool.winner === 'DRAW' ? 'Draw' : null;

  return (
      <Box
        onClick={onClick}
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box
              component="img"
              src={`https://crests.football-data.org/${league}.png`}
              alt={league}
              sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }}
            />
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {league === 'CL' ? 'Champions League' : league === 'PL' ? 'Premier League' : league === 'PD' ? 'La Liga' : league === 'SA' ? 'Serie A' : league === 'BL1' ? 'Bundesliga' : league === 'FL1' ? 'Ligue 1' : league}
            </Typography>
          </Box>
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
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
            <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'right', color: isResolved && pool.winner === 'UP' ? UP_COLOR : '#fff' }}>
              {pool.homeTeam || 'Home'}
            </Typography>
            {pool.homeTeamCrest && (
              <Box component="img" src={pool.homeTeamCrest} alt={pool.homeTeam || ''} sx={{ width: 24, height: 24, objectFit: 'contain' }} />
            )}
          </Box>
          {isResolved && pool.homeScore != null && pool.awayScore != null ? (
            <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#fff', minWidth: 40, textAlign: 'center' }}>
              {pool.homeScore} - {pool.awayScore}
            </Typography>
          ) : (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>
              vs
            </Typography>
          )}
          <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
            {pool.awayTeamCrest && (
              <Box component="img" src={pool.awayTeamCrest} alt={pool.awayTeam || ''} sx={{ width: 24, height: 24, objectFit: 'contain' }} />
            )}
            <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'left', color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : '#fff' }}>
              {pool.awayTeam || 'Away'}
            </Typography>
          </Box>
        </Box>

        {/* Result label */}
        {isResolved && winnerLabel && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: pool.winner === 'UP' ? UP_COLOR : pool.winner === 'DOWN' ? DOWN_COLOR : DRAW_COLOR }}>
              {winnerLabel} wins
            </Typography>
          </Box>
        )}

        {/* 3-way odds bar */}
        <Box sx={{ display: 'flex', gap: '2px', height: 28 }}>
          <Box sx={{ flex: homePct, bgcolor: isResolved && pool.winner === 'UP' ? `${UP_COLOR}30` : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? UP_COLOR : '#fff' }}>
              {isResolved && pool.winner === 'UP' ? '\u2713 ' : ''}{homePct}%
            </Typography>
          </Box>
          <Box sx={{ flex: drawPct, bgcolor: isResolved && pool.winner === 'DRAW' ? `${DRAW_COLOR}25` : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DRAW' ? DRAW_COLOR : 'rgba(255,255,255,0.5)' }}>
              {isResolved && pool.winner === 'DRAW' ? '\u2713 ' : ''}{drawPct}%
            </Typography>
          </Box>
          <Box sx={{ flex: awayPct, bgcolor: isResolved && pool.winner === 'DOWN' ? `${DOWN_COLOR}25` : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : '#fff' }}>
              {isResolved && pool.winner === 'DOWN' ? '\u2713 ' : ''}{awayPct}%
            </Typography>
          </Box>
        </Box>

        {/* Labels under odds bar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'UP' ? UP_COLOR : 'rgba(255,255,255,0.55)' }}>Home</Typography>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DRAW' ? DRAW_COLOR : 'rgba(255,255,255,0.55)' }}>Draw</Typography>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : 'rgba(255,255,255,0.55)' }}>Away</Typography>
        </Box>

        {/* Pool info */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>
            {pool.betCount} predictions
          </Typography>
          <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: GAIN_COLOR }}>
            <AnimatedValue usdcValue={pool.totalPool} prefix="$" />
          </Typography>
        </Box>
      </Box>
  );
}
