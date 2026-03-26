'use client';

import { Box, Typography } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR, GAIN_COLOR, INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { AssetIcon } from '@/components/AssetIcon';
import type { Pool } from '@/lib/api';
import type { LiveScore } from '@/hooks/useLiveScores';
import type { CategoryConfig } from '@/hooks/useCategories';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function poolName(pool: Pool): string {
  if (pool.poolType !== 'SPORTS') return `${pool.asset}/USD`;
  if (pool.league?.startsWith('PM_')) return pool.homeTeam || 'Prediction';
  if (pool.homeTeam && pool.awayTeam) return `${pool.homeTeam} vs ${pool.awayTeam}`;
  return pool.homeTeam || pool.asset;
}

function poolLink(pool: Pool): string {
  return pool.poolType === 'SPORTS' ? `/match/${pool.id}` : `/pool/${pool.id}`;
}

function winnerLabel(pool: Pool): string {
  if (pool.poolType !== 'SPORTS') return `${pool.winner} WINS`;
  if (pool.league?.startsWith('PM_')) {
    return pool.winner === 'UP' ? 'YES' : 'NO';
  }
  if (pool.winner === 'UP') return (pool.homeTeam || 'Home') + ' WINS';
  if (pool.winner === 'DOWN') return (pool.awayTeam || 'Away') + ' WINS';
  return 'DRAW';
}

function winnerColor(pool: Pool): string {
  if (pool.winner === 'UP') return UP_COLOR;
  if (pool.winner === 'DOWN') return DOWN_COLOR;
  return DRAW_COLOR;
}

interface PoolsSidebarListProps {
  pools: Pool[];
  newIds: Set<string>;
  liveScores?: Map<string, LiveScore>;
  categoryMap?: Map<string, CategoryConfig>;
}

export function PoolsSidebarList({ pools, newIds, liveScores, categoryMap }: PoolsSidebarListProps) {
  if (pools.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          No resolved pools yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <AnimatePresence>
        {pools.map((pool, i) => {
          const isNew = newIds.has(pool.id);
          const isSports = pool.poolType === 'SPORTS';
          const isPM = pool.league?.startsWith('PM_');
          const cat = pool.league && categoryMap ? categoryMap.get(pool.league) : undefined;
          const ls = liveScores ? (pool.matchId ? liveScores.get(pool.matchId) : undefined) || (pool.homeTeam ? liveScores.get(pool.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '')) : undefined) : undefined;
          const isMatchLive = ls && ls.status !== 'FT' && ls.status !== 'NS';

          return (
            <motion.div
              key={pool.id}
              initial={isNew ? { opacity: 0, scale: 0.96, y: -10 } : false}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isNew ? i * 0.05 : 0 }}
              layout
            >
              <Link href={poolLink(pool)} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: '#0D1219',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    '&:hover': { background: 'rgba(255,255,255,0.04)' },
                    ...(isMatchLive && { borderLeft: '2px solid #22C55E' }),
                  }}
                >
                  {/* Row 1: Icon + name + right side (interval tag / live score / badge) */}
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0, flex: 1 }}>
                      {/* Icon: crypto asset icon, sports team crest, or PM category badge */}
                      {!isSports ? (
                        <AssetIcon asset={pool.asset} size={22} />
                      ) : cat?.badgeUrl ? (
                        <Box component="img" src={cat.badgeUrl} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', ...(cat.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }) }} />
                      ) : isPM && cat?.color ? (
                        <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: `${cat.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: cat.color }} />
                        </Box>
                      ) : pool.homeTeamCrest ? (
                        <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain' }} />
                      ) : (
                        <AssetIcon asset={pool.asset} size={22} />
                      )}
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {poolName(pool)}
                      </Typography>
                    </Box>
                    {isMatchLive ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                        <Box sx={{ width: 5, height: 5, borderRadius: '50%', bgcolor: '#22C55E', animation: 'livePulse 1.5s infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: '#22C55E' }}>
                          {ls!.homeScore} - {ls!.awayScore}
                        </Typography>
                      </Box>
                    ) : !isSports ? (
                      <Box
                        component="img"
                        src={INTERVAL_TAG_IMAGES[pool.interval] || '/assets/hourly-tag.png'}
                        alt={INTERVAL_LABELS[pool.interval] || pool.interval}
                        sx={{ height: { xs: 32, md: 36 }, imageRendering: '-webkit-optimize-contrast', flexShrink: 0 }}
                      />
                    ) : (
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: GAIN_COLOR, flexShrink: 0 }}>
                        {formatUSDC(pool.totalPool)}
                      </Typography>
                    )}
                  </Box>

                  {/* Row 2: Result / live status */}
                  {isMatchLive ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: '#22C55E' }}>
                        {ls!.status}{ls!.progress ? ` ${ls!.progress}'` : ''}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: GAIN_COLOR }}>
                        {formatUSDC(pool.totalPool)}
                      </Typography>
                    </Box>
                  ) : pool.winner ? (
                    <>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                        {!isSports && (
                          <Box
                            component="img"
                            src={pool.winner === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'}
                            alt=""
                            sx={{ width: 14, height: 14 }}
                          />
                        )}
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: winnerColor(pool), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {winnerLabel(pool)}
                        </Typography>
                        {!isSports && (
                          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: GAIN_COLOR, ml: 'auto' }}>
                            {formatUSDC(pool.totalPool)}
                          </Typography>
                        )}
                      </Box>
                      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                        {timeAgo(pool.endTime)}
                      </Typography>
                    </>
                  ) : null}
                </Box>
              </Link>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </Box>
  );
}
