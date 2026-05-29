'use client';

import type { ReactNode } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { TrendingUp, TrendingDown, Star } from '@mui/icons-material';
import { AnimatedValue } from '@/components/AnimatedValue';
import { getIcon } from '@/lib/icon-registry';
import { INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { Pool } from '@/lib/api';
import { isMatchActive, isMatchFinished, formatLiveStatus, type LiveScore } from '@/hooks/useLiveScores';
import type { CategoryConfig } from '@/hooks/useCategories';

const ASSET_NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };

function relTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'In play';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtMult(m: number): string {
  if (!isFinite(m) || m <= 0) return '—';
  if (m >= 100) return '99+x';
  return `${m >= 10 ? m.toFixed(1) : m.toFixed(2)}x`;
}

interface Outcome {
  side: 'UP' | 'DOWN' | 'DRAW';
  name: string;
  color: string;
  crest?: string | null;
  icon?: ReactNode;
  pct: number;
  mult: number;
}

interface MarketCardProps {
  pool: Pool;
  onClick?: () => void;
  category?: CategoryConfig | null;
  userBet?: { side: string; isWinner: boolean | null; betId?: string; claimed?: boolean; refunded?: boolean } | null;
  onClaim?: (poolId: string, betId: string) => void;
  liveScore?: LiveScore | null;
  isPopular?: boolean;
}

/**
 * Unified Kalshi-style market card. Renders any pool type (crypto Up/Down,
 * sports Home/Draw/Away, PM Yes/No) as a clean card: category chip, question,
 * outcome rows (icon + name + multiplier + % pill), and a volume footer.
 */
export function MarketCard({ pool, onClick, category, userBet, onClaim, liveScore, isPopular }: MarketCardProps) {
  const t = useThemeTokens();

  const isPrediction = !!pool.league?.startsWith('PM_');
  const isCrypto = pool.poolType !== 'SPORTS';
  const isTwoWay = isCrypto || isPrediction || pool.numSides === 2;
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const isLocked = !isResolved && !!pool.lockTime && new Date(pool.lockTime).getTime() < Date.now();

  const matchLive = !isResolved && liveScore != null && isMatchActive(liveScore);
  const matchFinished = !isResolved && liveScore != null && isMatchFinished(liveScore.status);

  // ── Category chip ──
  const catColor = isCrypto ? t.up : category?.color || (isPrediction ? t.prediction : t.draw);
  const catLabel = isCrypto ? 'Crypto' : category?.shortLabel || category?.label || pool.league || 'Sports';
  const CatIcon = getIcon(category?.iconKey);
  const catBadge = category?.badgeUrl;

  // ── Title ──
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  const title = isCrypto
    ? `${ASSET_NAMES[pool.asset] || pool.asset} · ${intervalLabel}`
    : isPrediction
      ? (pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction market')
      : `${pool.homeTeam || 'Home'} vs ${pool.awayTeam || 'Away'}`;

  // ── Outcomes ──
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const totalDraw = Number(pool.totalDraw);
  const total = totalUp + totalDown + totalDraw;
  const odds = (sideTotal: number, defPct: number) => ({
    pct: total > 0 ? Math.round((sideTotal / total) * 100) : defPct,
    mult: total > 0 && sideTotal > 0 ? total / sideTotal : (isTwoWay ? 2 : 3),
  });

  const outcomes: Outcome[] = [];
  if (isCrypto) {
    outcomes.push({ side: 'UP', name: 'Up', color: t.up, icon: <TrendingUp sx={{ fontSize: 16 }} />, ...odds(totalUp, 50) });
    outcomes.push({ side: 'DOWN', name: 'Down', color: t.down, icon: <TrendingDown sx={{ fontSize: 16 }} />, ...odds(totalDown, 50) });
  } else if (isPrediction) {
    // Yes/No (or named) outcomes use a colour dot — the market's image is the
    // card thumbnail (shown next to the title), not a per-outcome icon.
    outcomes.push({ side: 'UP', name: pool.awayTeam ? pool.homeTeam! : 'Yes', color: t.up, ...odds(totalUp, 50) });
    outcomes.push({ side: 'DOWN', name: pool.awayTeam || 'No', color: t.down, ...odds(totalDown, 50) });
  } else {
    outcomes.push({ side: 'UP', name: pool.homeTeam || 'Home', color: t.up, crest: pool.homeTeamCrest, ...odds(totalUp, isTwoWay ? 50 : 33) });
    if (!isTwoWay) outcomes.push({ side: 'DRAW', name: 'Draw', color: t.draw, ...odds(totalDraw, 34) });
    outcomes.push({ side: 'DOWN', name: pool.awayTeam || 'Away', color: t.down, crest: pool.awayTeamCrest, ...odds(totalDown, isTwoWay ? 50 : 33) });
  }

  const rightLabel = isResolved
    ? 'Ended'
    : matchLive && liveScore
      ? formatLiveStatus(liveScore.status, liveScore.progress)
      : matchFinished
        ? 'Full time'
        : relTime(pool.status === 'UPCOMING' ? pool.startTime : pool.endTime);

  const canClaim = isResolved && userBet?.isWinner && !userBet.claimed && userBet.betId && onClaim;

  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: t.bg.surface,
        border: t.surfaceBorder,
        borderRadius: 2,
        p: { xs: 1.5, md: 1.75 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
        '&:hover': { borderColor: t.border.medium, bgcolor: t.hover.subtle },
      }}
    >
      {/* Header: category + right meta */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, minWidth: 0 }}>
          {catBadge ? (
            <Box component="img" src={catBadge} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', ...(category?.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '1px' }) }} />
          ) : CatIcon ? (
            <CatIcon sx={{ fontSize: 16, color: catColor }} />
          ) : (
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: catColor }} />
          )}
          <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: catColor, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {catLabel}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          {isPopular && (
            <Chip icon={<Star sx={{ fontSize: 10 }} />} label="Popular" size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.1), color: t.gain, '& .MuiChip-icon': { color: t.gain, ml: 0.4 } }} />
          )}
          {matchLive ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
              <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.gain, animation: 'mcPulse 1.5s infinite', '@keyframes mcPulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.35 } } }} />
              <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.gain }}>{rightLabel}</Typography>
            </Box>
          ) : (
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary }}>{rightLabel}</Typography>
          )}
        </Box>
      </Box>

      {/* Title (PM markets show the market image as a thumbnail) */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: '2.4em' }}>
        {isPrediction && pool.homeTeamCrest && (
          <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 30, height: 30, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <Typography sx={{ fontSize: { xs: '0.88rem', md: '0.92rem' }, fontWeight: 700, color: t.text.primary, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {title}
        </Typography>
      </Box>

      {/* Outcomes */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
        {outcomes.map((o) => {
          const isWinner = isResolved && pool.winner === o.side;
          return (
            <Box key={o.side} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              {o.crest ? (
                <Box component="img" src={o.crest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
              ) : o.icon ? (
                <Box sx={{ color: o.color, display: 'flex', flexShrink: 0 }}>{o.icon}</Box>
              ) : (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: o.color, flexShrink: 0, mx: '6px' }} />
              )}
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: isWinner ? 700 : 500, color: isWinner ? o.color : t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.name}
              </Typography>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 500, color: t.text.quaternary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                {fmtMult(o.mult)}
              </Typography>
              <Box sx={{ minWidth: 50, textAlign: 'center', px: 1, py: 0.35, borderRadius: '999px', flexShrink: 0, border: `1px solid ${isWinner ? withAlpha(o.color, 0.5) : t.border.strong}`, bgcolor: isWinner ? withAlpha(o.color, 0.08) : 'transparent' }}>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 700, color: isWinner ? o.color : t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                  {o.pct}%
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Box>

      {/* Footer: volume + meta / claim */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.75, borderTop: `1px solid ${t.border.subtle}` }}>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 600, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
          <AnimatedValue usdcValue={pool.totalPool} prefix="$" /> Vol.
        </Typography>
        {canClaim ? (
          <Chip
            label="Claim"
            size="small"
            onClick={(e) => { e.stopPropagation(); onClaim!(pool.id, userBet!.betId!); }}
            sx={{ height: 22, fontSize: '0.68rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.12), color: t.gain, cursor: 'pointer', '&:hover': { bgcolor: withAlpha(t.gain, 0.2) } }}
          />
        ) : userBet?.refunded ? (
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.accent }}>Refunded</Typography>
        ) : userBet?.isWinner && userBet.claimed ? (
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.gain }}>Claimed</Typography>
        ) : (
          <Typography sx={{ fontSize: '0.7rem', fontWeight: 500, color: t.text.quaternary }}>
            {pool.betCount} {isPrediction ? 'predictions' : 'bets'}
          </Typography>
        )}
      </Box>
    </Box>
  );
}
