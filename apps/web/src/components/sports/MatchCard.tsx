'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Box, Typography, Chip, Tooltip } from '@mui/material';
import { TrendingUp, Star, IosShare } from '@mui/icons-material';
import { AnimatedValue } from '@/components/AnimatedValue';
import { getIcon } from '@/lib/icon-registry';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { Pool } from '@/lib/api';
import { isMatchActive, isMatchFinished, formatLiveStatus, type LiveScore } from '@/hooks/useLiveScores';
import type { CategoryConfig } from '@/hooks/useCategories';

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

export function MatchCard({ pool, onClick, isPopular, liveScore, category, userBet, onClaim }: { pool: Pool; onClick?: () => void; isPopular?: boolean; liveScore?: LiveScore | null; category?: CategoryConfig | null; userBet?: { side: string; isWinner: boolean | null; betId?: string; claimed?: boolean; refunded?: boolean } | null; onClaim?: (poolId: string, betId: string) => void }) {
  const t = useThemeTokens();
  const router = useRouter();
  const isPrediction = pool.league?.startsWith('PM_');
  const catColor = category?.color || (isPrediction ? t.prediction : t.text.quaternary);
  const catLabel = category?.label || pool.league || '';
  const catBadge = category?.badgeUrl;
  const CatIcon = getIcon(category?.iconKey);
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const totalDraw = Number(pool.totalDraw);
  const total = totalUp + totalDown + totalDraw;
  const homePct = total > 0 ? Math.round((totalUp / total) * 100) : isPrediction ? 50 : 33;
  const awayPct = total > 0 ? Math.round((totalDown / total) * 100) : isPrediction ? 50 : 33;
  const isTwoWay = isPrediction || pool.numSides === 2;
  const drawPct = isTwoWay ? 0 : (total > 0 ? 100 - homePct - awayPct : 34);

  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const league = pool.league || '';
  const winnerLabel = isResolved && pool.winner === 'UP' ? (isPrediction ? 'Yes' : pool.homeTeam) : pool.winner === 'DOWN' ? (isPrediction ? 'No' : pool.awayTeam) : pool.winner === 'DRAW' ? 'Draw' : null;

  // Live match data — never show live if pool is already resolved
  const matchLive = !isResolved && liveScore && isMatchActive(liveScore);
  const matchFinished = !isResolved && liveScore && isMatchFinished(liveScore.status);
  const isLocked = !isResolved && pool.lockTime && new Date(pool.lockTime).getTime() < Date.now();
  const hasStarted = new Date(pool.startTime).getTime() < Date.now();
  const hasScore = pool.homeScore != null && pool.awayScore != null;
  const awaitingResolution = !isResolved && hasScore && !matchLive;

  return (
      <Box
        sx={{
          bgcolor: t.bg.surfaceAlt,
          border: t.surfaceBorder,
          boxShadow: t.surfaceShadow,
          borderRadius: 1.5,
          p: { xs: 1.5, md: 2 },
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          transition: 'background 0.15s ease',
          position: 'relative',
          overflow: 'hidden',
          '&:hover': { background: t.hover.default },
          ...(isPrediction && {
            background: `linear-gradient(135deg, ${withAlpha(catColor, 0.03)} 0%, transparent 60%)`,
            '&:hover': { background: `linear-gradient(135deg, ${withAlpha(catColor, 0.07)} 0%, ${t.hover.subtle} 60%)` },
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
            {CatIcon ? (
              <CatIcon sx={{ fontSize: 90 }} />
            ) : (
              <TrendingUp sx={{ fontSize: 90 }} />
            )}
          </Box>
        )}
        {/* Header: league/category + kickoff */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            {catBadge ? (
              <Box component="img" src={catBadge} alt={league} sx={{ width: 22, height: 22, objectFit: 'contain', ...(category?.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }) }} />
            ) : isPrediction ? (
              <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: withAlpha(catColor, 0.13), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: catColor }} />
              </Box>
            ) : null}
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: catColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {catLabel}
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
                  bgcolor: withAlpha(t.gain, 0.08),
                  color: t.gain,
                  border: 'none',
                  '& .MuiChip-icon': { color: t.gain, ml: 0.5 },
                }}
              />
            )}
            {matchLive ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.gain, animation: 'livePulse 1.5s infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1, transform: 'scale(1)' }, '50%': { opacity: 0.4, transform: 'scale(0.8)' } } }} />
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: t.gain }}>
                  {formatLiveStatus(liveScore!.status, liveScore!.progress)}
                </Typography>
              </Box>
            ) : matchFinished || awaitingResolution ? (
              <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.secondary }}>
                Full Time
              </Typography>
            ) : isResolved ? (
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.tertiary }}>
                Ended
              </Typography>
            ) : hasStarted ? (
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: t.accent, textTransform: 'uppercase' }}>
                In Progress
              </Typography>
            ) : isLocked ? (
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: t.accent, textTransform: 'uppercase' }}>
                Starting Soon
              </Typography>
            ) : (
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.tertiary }}>
                {formatKickoff(pool.startTime, false)}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Teams / Question */}
        {isPrediction ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, px: 1 }}>
            <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.95rem' }, fontWeight: 700, textAlign: 'center', color: t.text.primary, lineHeight: 1.3 }}>
              {/* If awayTeam is empty, homeTeam IS the question title. Otherwise show both outcomes. */}
              {pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction Market'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1 }}>
              <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'right', color: isResolved && pool.winner === 'UP' ? t.up : t.text.primary }}>
                {pool.homeTeam || 'Home'}
              </Typography>
              {pool.homeTeamCrest && (
                <Box component="img" src={pool.homeTeamCrest} alt={pool.homeTeam || ''} sx={{ width: 24, height: 24, objectFit: 'contain' }} />
              )}
            </Box>
            {(matchLive || matchFinished) && liveScore ? (
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: matchLive ? t.gain : t.text.primary, minWidth: 40, textAlign: 'center' }}>
                {liveScore.homeScore} - {liveScore.awayScore}
              </Typography>
            ) : hasScore ? (
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: t.text.primary, minWidth: 40, textAlign: 'center' }}>
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
              <Typography sx={{ fontSize: { xs: '0.9rem', md: '1rem' }, fontWeight: 700, textAlign: 'left', color: isResolved && pool.winner === 'DOWN' ? t.down : t.text.primary }}>
                {pool.awayTeam || 'Away'}
              </Typography>
            </Box>
          </Box>
        )}

        {/* Result label */}
        {isResolved && winnerLabel && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.5 }}>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: pool.winner === 'UP' ? t.up : pool.winner === 'DOWN' ? t.down : t.draw }}>
              {winnerLabel} wins
            </Typography>
          </Box>
        )}

        {/* Prediction markets: Yes/No duel buttons */}
        {isPrediction && !isResolved ? (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, minHeight: 42 }}>
              <Box
                onClick={!isLocked && !matchLive && !matchFinished ? onClick : undefined}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  py: 0.75, borderRadius: 1, cursor: !isLocked ? 'pointer' : 'default',
                  bgcolor: withAlpha(t.up, 0.08), border: `1px solid ${withAlpha(t.up, 0.2)}`,
                  transition: 'all 0.15s ease',
                  ...(!isLocked && { '&:hover': { bgcolor: withAlpha(t.up, 0.15), borderColor: withAlpha(t.up, 0.4) } }),
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.up }}>{homePct}%</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.tertiary }}>
                  {pool.awayTeam ? pool.homeTeam : 'Yes'}
                </Typography>
              </Box>
              <Box
                onClick={!isLocked && !matchLive && !matchFinished ? onClick : undefined}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                  py: 0.75, borderRadius: 1, cursor: !isLocked ? 'pointer' : 'default',
                  bgcolor: withAlpha(t.down, 0.08), border: `1px solid ${withAlpha(t.down, 0.2)}`,
                  transition: 'all 0.15s ease',
                  ...(!isLocked && { '&:hover': { bgcolor: withAlpha(t.down, 0.15), borderColor: withAlpha(t.down, 0.4) } }),
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.down }}>{awayPct}%</Typography>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.tertiary }}>
                  {pool.awayTeam || 'No'}
                </Typography>
              </Box>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.secondary }}>
                {pool.betCount} predictions
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.gain }}>
                <AnimatedValue usdcValue={pool.totalPool} prefix="$" /> Vol.
              </Typography>
            </Box>
          </>
        ) : isPrediction && isResolved ? (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, minHeight: 42 }}>
              <Chip
                label={`${winnerLabel} wins`}
                size="small"
                sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700, bgcolor: withAlpha(pool.winner === 'UP' ? t.up : t.down, 0.1), color: pool.winner === 'UP' ? t.up : t.down }}
              />
              {userBet?.refunded ? (
                <Chip label="Refunded" size="small" sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700, bgcolor: withAlpha(t.accent, 0.1), color: t.accent }} />
              ) : userBet?.isWinner && !userBet.claimed && userBet.betId && onClaim ? (
                <Chip
                  label="Claim"
                  size="small"
                  onClick={(e) => { e.stopPropagation(); onClaim(pool.id, userBet.betId!); }}
                  sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.1), color: t.gain, cursor: 'pointer', '&:hover': { bgcolor: withAlpha(t.gain, 0.2) } }}
                />
              ) : userBet?.isWinner && userBet.claimed ? (
                <Chip label="Claimed" size="small" sx={{ height: 24, fontSize: '0.7rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.1), color: t.gain }} />
              ) : null}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.secondary }}>{pool.betCount} predictions</Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.gain }}><AnimatedValue usdcValue={pool.totalPool} prefix="$" /> Vol.</Typography>
            </Box>
          </>
        ) : (
          /* Sports cards: keep original odds bar + labels + CTA */
          <>
            {/* Odds bar: 3-way for sports */}
            <Box sx={{ display: 'flex', gap: '2px', height: 28 }}>
              <Box sx={{ flex: homePct, bgcolor: isResolved && pool.winner === 'UP' ? withAlpha(t.up, 0.19) : t.hover.strong, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? t.up : t.text.primary }}>
                  {isResolved && pool.winner === 'UP' ? '\u2713 ' : ''}{homePct}%
                </Typography>
              </Box>
              {!isTwoWay && (
                <Box sx={{ flex: drawPct, bgcolor: isResolved && pool.winner === 'DRAW' ? withAlpha(t.draw, 0.15) : 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
                  <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DRAW' ? t.draw : t.text.secondary }}>
                    {isResolved && pool.winner === 'DRAW' ? '\u2713 ' : ''}{drawPct}%
                  </Typography>
                </Box>
              )}
              <Box sx={{ flex: awayPct, bgcolor: isResolved && pool.winner === 'DOWN' ? withAlpha(t.down, 0.15) : t.hover.strong, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'flex 0.3s ease' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? t.down : t.text.primary }}>
                  {isResolved && pool.winner === 'DOWN' ? '\u2713 ' : ''}{awayPct}%
                </Typography>
              </Box>
            </Box>

            {/* Labels under odds bar */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 0.5 }}>
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'UP' ? t.up : t.text.strong }}>
                {pool.homeTeam?.slice(0, 3).toUpperCase() || 'Home'}
              </Typography>
              {!isTwoWay && (
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DRAW' ? t.draw : t.text.strong }}>Draw</Typography>
              )}
              <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isResolved && pool.winner === 'DOWN' ? t.down : t.text.strong }}>
                {pool.awayTeam?.slice(0, 3).toUpperCase() || 'Away'}
              </Typography>
            </Box>

            {/* Pool info */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 500, color: t.text.secondary }}>
                {pool.betCount} predictions
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <IosShare
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = `${window.location.origin}/match/${pool.id}`;
                    const text = `${pool.homeTeam || 'Home'} vs ${pool.awayTeam || 'Away'}`;
                    try {
                      if (navigator.share) await navigator.share({ title: `UpDown - ${text}`, url });
                      else await navigator.clipboard.writeText(url);
                    } catch { /* ignore */ }
                  }}
                  sx={{ fontSize: 15, color: t.text.strong, cursor: 'pointer', '&:hover': { color: t.text.primary }, transition: 'color 0.15s' }}
                />
                <Typography component="span" sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.gain }}>
                  <AnimatedValue usdcValue={pool.totalPool} prefix="$" />
                </Typography>
              </Box>
            </Box>

            {/* Sports CTA */}
            {isResolved && userBet?.refunded ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 0.75 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.accent }}>Refunded</Typography>
              </Box>
            ) : isResolved && userBet?.isWinner && !userBet.claimed && userBet.betId && onClaim ? (
              <Box
                onClick={(e) => { e.stopPropagation(); onClaim(pool.id, userBet.betId!); }}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  py: 0.75, borderRadius: '4px',
                  bgcolor: withAlpha(t.gain, 0.08), cursor: 'pointer',
                  transition: 'background 0.15s',
                  '&:hover': { bgcolor: withAlpha(t.gain, 0.15) },
                }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: t.gain }}>
                  Claim Winnings
                </Typography>
              </Box>
            ) : !isResolved && (
              <Box
                onClick={(e) => {
                  e.stopPropagation();
                  if (!isLocked && !matchLive && !matchFinished) {
                    onClick?.();
                  } else {
                    router.push(`/match/${pool.id}`);
                  }
                }}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  py: 0.75, borderRadius: '4px',
                  bgcolor: isLocked || matchLive || matchFinished ? t.hover.subtle : t.up,
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  '&:hover': { filter: 'brightness(1.1)' },
                }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.04em', color: isLocked || matchLive || matchFinished ? t.text.muted : t.text.contrast }}>
                  {matchLive || matchFinished ? 'View Match' : isLocked ? 'View Match' : 'Predict Now'}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>
  );
}
