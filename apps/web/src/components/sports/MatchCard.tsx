'use client';

import { Box, Typography, Chip } from '@mui/material';
import { Gavel, Public, TheaterComedy, AccountBalance, TrendingUp, Star, SportsBasketball, SportsFootball, SportsMma, SportsHockey } from '@mui/icons-material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR, GAIN_COLOR } from '@/lib/constants';
import { AnimatedValue } from '@/components/AnimatedValue';
import type { Pool } from '@/lib/api';
import type { LiveScore } from '@/hooks/useLiveScores';

const PM_CATEGORY_LABELS: Record<string, string> = {
  PM_POLITICS: 'Politics',
  PM_GEO: 'Geopolitics',
  PM_CULTURE: 'Culture',
  PM_FINANCE: 'Finance',
};

const PM_CATEGORY_COLORS: Record<string, string> = {
  PM_POLITICS: '#A78BFA',
  PM_GEO: '#60A5FA',
  PM_CULTURE: '#F472B6',
  PM_FINANCE: '#34D399',
};

const SPORT_BADGES: Record<string, string> = {
  NBA: 'https://r2.thesportsdb.com/images/media/league/badge/frdjqy1536585083.png',
  NHL: 'https://r2.thesportsdb.com/images/media/league/badge/4cem2k1619616539.png',
  NFL: 'https://r2.thesportsdb.com/images/media/league/badge/g85fqz1662057187.png',
  MMA: 'https://r2.thesportsdb.com/images/media/league/badge/bewnz31717531281.png',
};

const SPORT_COLORS: Record<string, string> = {
  NBA: '#F97316',
  NFL: '#22C55E',
  MMA: '#EF4444',
  NHL: '#3B82F6',
};

const PM_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  PM_POLITICS: <Gavel sx={{ fontSize: 48 }} />,
  PM_GEO: <Public sx={{ fontSize: 48 }} />,
  PM_CULTURE: <TheaterComedy sx={{ fontSize: 48 }} />,
  PM_FINANCE: <AccountBalance sx={{ fontSize: 48 }} />,
};

function formatKickoff(dateStr: string, isResolved: boolean): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  if (diff < 0) {
    if (isResolved) return 'Ended';
    return 'Live';
  }
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

export function MatchCard({ pool, onClick, isPopular, liveScore }: { pool: Pool; onClick?: () => void; isPopular?: boolean; liveScore?: LiveScore | null }) {
  const isPrediction = pool.league?.startsWith('PM_');
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const totalDraw = Number(pool.totalDraw);
  const total = totalUp + totalDown + totalDraw;
  const homePct = total > 0 ? Math.round((totalUp / total) * 100) : isPrediction ? 50 : 33;
  const awayPct = total > 0 ? Math.round((totalDown / total) * 100) : isPrediction ? 50 : 33;
  const isTwoWay = isPrediction || pool.numSides === 2;
  const drawPct = isTwoWay ? 0 : (total > 0 ? 100 - homePct - awayPct : 34);

  const isLive = pool.status === 'ACTIVE';
  const isJoining = pool.status === 'JOINING';
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const league = pool.league || '';
  const winnerLabel = isResolved && pool.winner === 'UP' ? (isPrediction ? 'Yes' : pool.homeTeam) : pool.winner === 'DOWN' ? (isPrediction ? 'No' : pool.awayTeam) : pool.winner === 'DRAW' ? 'Draw' : null;

  // Live match data — never show live if pool is already resolved
  const matchLive = !isResolved && liveScore && liveScore.status !== 'FT' && liveScore.status !== 'NS';
  const isLocked = !isResolved && pool.lockTime && new Date(pool.lockTime).getTime() < Date.now();

  const catColor = PM_CATEGORY_COLORS[league] || '#A78BFA';

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
          position: 'relative',
          overflow: 'hidden',
          '&:hover': { background: 'rgba(255,255,255,0.04)' },
          ...(isPrediction && {
            background: `linear-gradient(135deg, ${catColor}08 0%, transparent 60%)`,
            '&:hover': { background: `linear-gradient(135deg, ${catColor}12 0%, rgba(255,255,255,0.02) 60%)` },
          }),
        }}
      >
        {/* Background watermark */}
        {isPrediction && (
          <Box sx={{
            position: 'absolute',
            right: -8,
            top: -8,
            color: catColor,
            opacity: 0.06,
            transform: 'rotate(-15deg)',
            pointerEvents: 'none',
          }}>
            {PM_CATEGORY_ICONS[league] ? (
              <Box sx={{ '& .MuiSvgIcon-root': { fontSize: 90 } }}>
                {PM_CATEGORY_ICONS[league]}
              </Box>
            ) : (
              <TrendingUp sx={{ fontSize: 90 }} />
            )}
          </Box>
        )}
        {/* Header: league/category + kickoff */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isPrediction ? (
              <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: `${PM_CATEGORY_COLORS[league] || '#A78BFA'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: PM_CATEGORY_COLORS[league] || '#A78BFA' }} />
              </Box>
            ) : SPORT_BADGES[league] ? (
              <Box component="img" src={SPORT_BADGES[league]} alt={league} sx={{ width: 22, height: 22, objectFit: 'contain' }} />
            ) : (
              <Box
                component="img"
                src={`https://crests.football-data.org/${league === 'BSA' ? 'bsa' : league}.png`}
                alt={league}
                sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }}
              />
            )}
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: isPrediction ? (PM_CATEGORY_COLORS[league] || '#A78BFA') : SPORT_COLORS[league] || 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {PM_CATEGORY_LABELS[league] || (league === 'CL' ? 'Champions League' : league === 'PL' ? 'Premier League' : league === 'PD' ? 'La Liga' : league === 'SA' ? 'Serie A' : league === 'BL1' ? 'Bundesliga' : league === 'FL1' ? 'Ligue 1' : league === 'BSA' ? 'Brasileirão' : league === 'NBA' ? 'NBA' : league === 'NFL' ? 'NFL' : league === 'MMA' ? 'UFC' : league === 'NHL' ? 'NHL' : league)}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {isPopular && (
              <Chip
                icon={<Star sx={{ fontSize: 11 }} />}
                label="POPULAR"
                size="small"
                sx={{
                  height: 18,
                  fontSize: '0.55rem',
                  fontWeight: 700,
                  bgcolor: `${GAIN_COLOR}15`,
                  color: GAIN_COLOR,
                  border: 'none',
                  '& .MuiChip-icon': { color: GAIN_COLOR, ml: 0.5 },
                }}
              />
            )}
            {isLocked && !matchLive && !isResolved && (
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: '#F59E0B', textTransform: 'uppercase' }}>
                Locked
              </Typography>
            )}
            {matchLive && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22C55E', animation: 'livePulse 1.5s infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.4, transform: 'scale(0.8)' } } }} />
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: '#22C55E' }}>
                  {liveScore!.status}{liveScore!.progress ? ` ${liveScore!.progress}'` : ''}
                </Typography>
              </Box>
            )}
            {!matchLive && (
              <>
                {isLive && (
                  <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: DOWN_COLOR, animation: 'pulse 1.5s infinite', '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                )}
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isLive ? DOWN_COLOR : 'rgba(255,255,255,0.4)' }}>
                  {formatKickoff(pool.startTime, isResolved)}
                </Typography>
              </>
            )}
          </Box>
        </Box>

        {/* Teams / Question */}
        {isPrediction ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, px: 1 }}>
            <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.95rem' }, fontWeight: 700, textAlign: 'center', color: '#fff', lineHeight: 1.3 }}>
              {/* If awayTeam is empty, homeTeam IS the question title. Otherwise show both outcomes. */}
              {pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction Market'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
              <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'right', color: isResolved && pool.winner === 'UP' ? UP_COLOR : '#fff' }}>
                {pool.homeTeam || 'Home'}
              </Typography>
              {pool.homeTeamCrest && (
                <Box component="img" src={pool.homeTeamCrest} alt={pool.homeTeam || ''} sx={{ width: 24, height: 24, objectFit: 'contain' }} />
              )}
            </Box>
            {matchLive ? (
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: '#22C55E', minWidth: 40, textAlign: 'center' }}>
                {liveScore!.homeScore} - {liveScore!.awayScore}
              </Typography>
            ) : isResolved && pool.homeScore != null && pool.awayScore != null ? (
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
        )}

        {/* Result label */}
        {isResolved && winnerLabel && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: pool.winner === 'UP' ? UP_COLOR : pool.winner === 'DOWN' ? DOWN_COLOR : DRAW_COLOR }}>
              {winnerLabel} wins
            </Typography>
          </Box>
        )}

        {/* Odds bar: 2-way for predictions, 3-way for sports */}
        <Box sx={{ display: 'flex', gap: '2px', height: 28 }}>
          <Box sx={{ flex: homePct, bgcolor: isResolved && pool.winner === 'UP' ? `${UP_COLOR}30` : isPrediction ? `${UP_COLOR}12` : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? UP_COLOR : isPrediction ? UP_COLOR : '#fff' }}>
              {isResolved && pool.winner === 'UP' ? '\u2713 ' : ''}{homePct}%
            </Typography>
          </Box>
          {!isTwoWay && (
            <Box sx={{ flex: drawPct, bgcolor: isResolved && pool.winner === 'DRAW' ? `${DRAW_COLOR}25` : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DRAW' ? DRAW_COLOR : 'rgba(255,255,255,0.5)' }}>
                {isResolved && pool.winner === 'DRAW' ? '\u2713 ' : ''}{drawPct}%
              </Typography>
            </Box>
          )}
          <Box sx={{ flex: awayPct, bgcolor: isResolved && pool.winner === 'DOWN' ? `${DOWN_COLOR}25` : isPrediction ? `${DOWN_COLOR}10` : 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : isPrediction ? DOWN_COLOR : '#fff' }}>
              {isResolved && pool.winner === 'DOWN' ? '\u2713 ' : ''}{awayPct}%
            </Typography>
          </Box>
        </Box>

        {/* Labels under odds bar */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'UP' ? UP_COLOR : 'rgba(255,255,255,0.55)' }}>
            {isPrediction ? (pool.awayTeam ? pool.homeTeam : 'Yes') : 'Home'}
          </Typography>
          {!isTwoWay && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DRAW' ? DRAW_COLOR : 'rgba(255,255,255,0.55)' }}>Draw</Typography>
          )}
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : 'rgba(255,255,255,0.55)' }}>
            {isPrediction ? (pool.awayTeam || 'No') : 'Away'}
          </Typography>
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
