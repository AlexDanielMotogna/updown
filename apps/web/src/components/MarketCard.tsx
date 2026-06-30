'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { Star } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { AnimatedValue } from '@/components/AnimatedValue';
import { LiveBadge } from '@/components/LiveBadge';
import { Countdown } from '@/components/Countdown';
import { BetFlash } from '@/components/BetFlash';
import { useBetFlash } from '@/hooks/useBetFlash';
import { formatPrice } from '@/lib/format';
import { getSocket, connectSocket, subscribePool, unsubscribePool } from '@/lib/socket';
import { getIcon } from '@/lib/icon-registry';
import { YES_ICON, NO_ICON } from '@/lib/predictionIcons';
import { INTERVAL_LABELS } from '@/lib/constants';
import { formatPredictionWindow } from '@/lib/format';
import { kindOf } from '@/lib/poolKind';
import { getAssetName } from '@/lib/assets';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import type { Pool } from '@/lib/api';
import { isMatchActive, isMatchFinished, formatLiveStatus, isAwaitingFinalResult, type LiveScore } from '@/hooks/useLiveScores';
import type { CategoryConfig } from '@/hooks/useCategories';

function relTime(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'In play';
  // Under an hour we surface seconds - short crypto rounds (3m/5m/15m)
  // need the seconds digit to feel "live" rather than tick by minute.
  if (diff < 60 * 60_000) {
    const totalSec = Math.floor(diff / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
  const h = Math.floor(diff / (60 * 60_000));
  if (h < 24) return `${h}h`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Sport cards show the actual kickoff (day + clock time) so users know exactly
// when the match starts, instead of a vague "6h". Same-day gets a "Today"
// prefix; anything else shows the date.
function matchStartLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`;
}

function fmtMult(m: number): string {
  if (!isFinite(m) || m <= 0) return '-';
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
  /** Optional score box rendered next to the name on sports cards. */
  score?: number;
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

  const kind = kindOf(pool);
  const isPrediction = kind === 'pm';
  const isCrypto = kind === 'crypto';
  const isTwoWay = isCrypto || isPrediction || pool.numSides === 2;
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const isLocked = !isResolved && !!pool.lockTime && new Date(pool.lockTime).getTime() < Date.now();
  // "NEW" badge: surfaces pools created in the last 2h so users can spot
  // freshly-listed markets in the grid. Excluded for crypto - those pools
  // are minted every few minutes by the scheduler so a NEW pill would be
  // background noise; only meaningful for sports / PM where listings are
  // sparse and human-driven. Stops showing once the pool resolves.
  const createdMs = pool.createdAt ? new Date(pool.createdAt).getTime() : 0;
  const isNew = !isCrypto && !isResolved && createdMs > 0 && Date.now() - createdMs < 2 * 60 * 60 * 1000;

  const matchFinished = !isResolved && liveScore != null && isMatchFinished(liveScore.status);
  // Phase B: past expected match end but feed hasn't reported FT yet - we
  // stop showing the live timer and surface an "Awaiting result" badge.
  // Only relevant on sports pools (PM markets don't have a notion of FT).
  // Computed before `matchLive` so a stuck "2H 95'" feed state doesn't keep
  // the LIVE indicator pulsing past the grace window.
  const awaitingFinalFeed = kind === 'sports'
    && isAwaitingFinalResult({ startTime: pool.startTime, status: pool.status, league: pool.league }, liveScore?.status);
  const matchLive = !isResolved && liveScore != null && isMatchActive(liveScore) && !awaitingFinalFeed;

  // ── Live totals via WebSocket: subscribe to this pool's room and update the
  // odds/volume in real time as bets land (with a brief flash). ──
  const [live, setLive] = useState<{ up: string; down: string; draw: string } | null>(null);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sock = getSocket();
    connectSocket();
    subscribePool(pool.id);
    const onUpdate = (d: { id: string; totalUp: string; totalDown: string; totalDraw: string }) => {
      if (d.id !== pool.id) return;
      setLive({ up: d.totalUp, down: d.totalDown, draw: d.totalDraw });
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    };
    sock.on('pool:updated', onUpdate);
    return () => { sock.off('pool:updated', onUpdate); unsubscribePool(pool.id); };
  }, [pool.id]);

  const tUp = live?.up ?? pool.totalUp;
  const tDown = live?.down ?? pool.totalDown;
  const tDraw = live?.draw ?? pool.totalDraw;
  let livePoolStr = pool.totalPool;
  try { livePoolStr = (BigInt(tUp || '0') + BigInt(tDown || '0') + BigInt(tDraw || '0')).toString(); } catch { /* keep */ }

  // ── Category chip ──
  const catColor = isCrypto ? t.up : category?.color || (isPrediction ? t.prediction : t.draw);
  // Show the FULL league/category name (e.g. "FIFA World Cup", not "FWC"): users
  // often don't recognise our acronyms. shortLabel is only a last-resort fallback.
  const catLabel = isCrypto ? 'Crypto' : category?.label || category?.shortLabel || pool.league || 'Sports';
  const CatIcon = getIcon(category?.iconKey);
  const catBadge = category?.badgeUrl;

  // ── Title ──
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;
  // For crypto we use the Polymarket-style phrasing ("Bitcoin Up or Down") and
  // surface the actual prediction window ("May 29, 10:35 PM - 10:40 PM ET") as
  // a subtitle below - the implicit interval is encoded in the start/end gap.
  // Sports score: resolved here once, attached to each outcome row below
  // as a small chip next to the team name. Live feed wins over the
  // stored final scores so a card mid-match always reflects "now".
  const liveHomeScore = liveScore?.homeScore;
  const liveAwayScore = liveScore?.awayScore;
  const showLiveScore = liveScore != null && liveHomeScore != null && liveAwayScore != null && (matchLive || matchFinished);
  const showFinalScore = !showLiveScore && pool.homeScore != null && pool.awayScore != null;
  const homeScoreLabel = showLiveScore ? liveHomeScore! : showFinalScore ? pool.homeScore! : null;
  const awayScoreLabel = showLiveScore ? liveAwayScore! : showFinalScore ? pool.awayScore! : null;
  // Crypto title merges the asset prompt with the strike - once a pool is
  // live the strike doesn't change, so it reads as part of the headline
  // rather than a separate metadata row.
  const cryptoTitle = pool.strikePrice
    ? `${getAssetName(pool.asset)} Up or Down | ${formatPrice(pool.strikePrice)} target`
    : `${getAssetName(pool.asset)} Up or Down`;
  const title = isCrypto
    ? cryptoTitle
    : isPrediction
      ? (pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction market')
      : `${pool.homeTeam || 'Home'} vs ${pool.awayTeam || 'Away'}`;
  const cryptoWindow = isCrypto ? formatPredictionWindow(pool.startTime, pool.endTime) : null;

  // ── Outcomes ──
  const totalUp = Number(tUp);
  const totalDown = Number(tDown);
  const totalDraw = Number(tDraw);
  const total = totalUp + totalDown + totalDraw;
  const odds = (sideTotal: number, defPct: number) => ({
    pct: total > 0 ? Math.round((sideTotal / total) * 100) : defPct,
    mult: total > 0 && sideTotal > 0 ? total / sideTotal : (isTwoWay ? 2 : 3),
  });

  const outcomes: Outcome[] = [];
  if (isCrypto) {
    outcomes.push({ side: 'UP', name: 'Up', color: t.up, icon: <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />, ...odds(totalUp, 50) });
    outcomes.push({ side: 'DOWN', name: 'Down', color: t.down, icon: <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />, ...odds(totalDown, 50) });
  } else if (isPrediction) {
    // Three PM shapes get badged differently:
    //   • Yes/No        → cyan ✓ / red ✗ glyph (lib/predictionIcons).
    //   • Up/Down       → green ▲ / red ▼ glyph (the crypto PNGs).
    //   • Answer pair   → no per-outcome icon, just the answer text.
    const yesNo = !pool.awayTeam;
    const upDown =
      !!pool.awayTeam &&
      pool.homeTeam?.toLowerCase() === 'up' &&
      pool.awayTeam.toLowerCase() === 'down';
    const upIcon = yesNo
      ? <Box component="img" src={YES_ICON} alt="" sx={{ width: 18, height: 18 }} />
      : upDown
        ? <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />
        : undefined;
    const downIcon = yesNo
      ? <Box component="img" src={NO_ICON} alt="" sx={{ width: 18, height: 18 }} />
      : upDown
        ? <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />
        : undefined;
    outcomes.push({
      side: 'UP',
      name: yesNo ? 'Yes' : pool.homeTeam!,
      color: t.up,
      ...(upIcon && { icon: upIcon }),
      ...odds(totalUp, 50),
    });
    outcomes.push({
      side: 'DOWN',
      name: yesNo ? 'No' : pool.awayTeam!,
      color: t.down,
      ...(downIcon && { icon: downIcon }),
      ...odds(totalDown, 50),
    });
  } else {
    outcomes.push({
      side: 'UP',
      name: pool.homeTeam || 'Home',
      color: t.up,
      crest: pool.homeTeamCrest,
      ...(homeScoreLabel != null && { score: homeScoreLabel }),
      ...odds(totalUp, isTwoWay ? 50 : 33),
    });
    if (!isTwoWay) outcomes.push({ side: 'DRAW', name: 'Draw', color: t.draw, ...odds(totalDraw, 34) });
    outcomes.push({
      side: 'DOWN',
      name: pool.awayTeam || 'Away',
      color: t.down,
      crest: pool.awayTeamCrest,
      ...(awayScoreLabel != null && { score: awayScoreLabel }),
      ...odds(totalDown, isTwoWay ? 50 : 33),
    });
  }

  const rightLabel = isResolved
    ? 'Ended'
    : awaitingFinalFeed
      ? 'Awaiting result'
      : matchLive && liveScore
        ? formatLiveStatus(liveScore.status, liveScore.progress)
        : matchFinished
          ? 'Full time'
          : kind === 'sports' && new Date(pool.startTime).getTime() > Date.now()
            ? matchStartLabel(pool.startTime)
            : relTime(pool.status === 'UPCOMING' ? pool.startTime : pool.endTime);

  const canClaim = isResolved && userBet?.isWinner && !userBet.claimed && userBet.betId && onClaim;

  // BetFlash overlay - subscribes to pool:bet-placed and renders a
  // 2-second pill in the centre of the card every time a fresh bet
  // lands. Hook is idempotent and bails when poolId is falsy, so it's
  // safe even on placeholder cards.
  const flashes = useBetFlash(pool.id);

  return (
    <Box
      onClick={onClick}
      sx={{
        position: 'relative',
        bgcolor: t.bg.surface,
        border: t.surfaceBorder,
        borderRadius: 2,
        p: { xs: 1.5, md: 1.75 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1,
        height: '100%', // fill the grid cell so cards in a row match height
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 0.15s, background 0.15s',
        '&:hover': { borderColor: t.border.medium, bgcolor: t.hover.subtle },
      }}
    >
      <BetFlash
        flashes={flashes}
        variant="card"
        prediction={isPrediction}
        sideLabel={!isCrypto && !isPrediction
          ? { UP: pool.homeTeam || 'Home', DOWN: pool.awayTeam || 'Away', DRAW: 'Draw' }
          : undefined}
        // Sports flashes use the actual team crest (same image source as
        // the outcome rows) so the pulse reads as 'X just bet on FCB'
        // rather than an abstract Up/Down arrow.
        sideIcon={!isCrypto && !isPrediction
          ? { UP: pool.homeTeamCrest, DOWN: pool.awayTeamCrest, DRAW: null }
          : undefined}
      />
      {/* Header: category chip + right meta (Popular pill + live/time-to-close).
          PM cards skip this row entirely so the question sits flush at the top
          edge of the card - the question + thumbnail are enough context, and
          the sidebar filter tells the user which bucket they're in. PM's meta
          is rendered inline next to the title further down. */}
      {!isPrediction && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
            {/* Identity thumbnail — 36x36, same size as the PM title image.
                Crypto = token, sports = league badge / home crest. */}
            <Box sx={{ width: 36, height: 36, borderRadius: 1, flexShrink: 0, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: isCrypto ? 'transparent' : withAlpha(catColor, 0.1) }}>
              {isCrypto ? (
                <AssetIcon asset={pool.asset} size={36} />
              ) : catBadge ? (
                <Box component="img" src={catBadge} alt="" sx={{ width: 28, height: 28, objectFit: 'contain' }} />
              ) : pool.homeTeamCrest ? (
                <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 28, height: 28, objectFit: 'contain' }} />
              ) : CatIcon ? (
                <CatIcon sx={{ fontSize: 20, color: catColor }} />
              ) : (
                <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: catColor }} />
              )}
            </Box>
            <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: catColor, textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {catLabel}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {isNew && (
              <Chip label="NEW" size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.06em', bgcolor: withAlpha(t.prediction, 0.14), color: t.prediction }} />
            )}
            {isPopular && (
              <Chip icon={<Star sx={{ fontSize: 10 }} />} label="Popular" size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.1), color: t.gain, '& .MuiChip-icon': { color: t.gain, ml: 0.4 } }} />
            )}
            {matchLive ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <LiveBadge />
                {liveScore && (
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                    {formatLiveStatus(liveScore.status, liveScore.progress)}
                  </Typography>
                )}
              </Box>
            ) : isCrypto && !isResolved && !awaitingFinalFeed && (pool.status === 'UPCOMING' || pool.status === 'JOINING' || pool.status === 'ACTIVE') ? (
              <Countdown
                targetDate={pool.status === 'UPCOMING' ? pool.startTime : pool.endTime}
                compact
                compactFontSize="0.66rem"
              />
            ) : (
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary }}>{rightLabel}</Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Title (PM markets show the market image as a thumbnail; meta floats
          to the top-right of the title row so the question sits flush at the
          top of the card). */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1, minHeight: '2.4em' }}>
        {/* PM keeps its market image in the title row (crypto/sports show their
            36x36 identity badge in the header instead). */}
        {isPrediction && pool.homeTeamCrest && (
          <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 36, height: 36, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }} />
        )}
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography sx={{ fontSize: { xs: '0.88rem', md: '0.92rem' }, fontWeight: 600, color: t.text.primary, lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {title}
          </Typography>
          {cryptoWindow && (
            <Typography
              suppressHydrationWarning
              sx={{
                fontSize: '0.66rem',
                fontWeight: 500,
                color: t.text.tertiary,
                fontVariantNumeric: 'tabular-nums',
                lineHeight: 1.35,
                mt: 0.25,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {cryptoWindow}
            </Typography>
          )}
        </Box>
        {isPrediction && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0, mt: 0.25 }}>
            {isNew && (
              <Chip label="NEW" size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 800, letterSpacing: '0.06em', bgcolor: withAlpha(t.prediction, 0.14), color: t.prediction }} />
            )}
            {isPopular && (
              <Chip icon={<Star sx={{ fontSize: 10 }} />} label="Popular" size="small" sx={{ height: 16, fontSize: '0.5rem', fontWeight: 700, bgcolor: withAlpha(t.gain, 0.1), color: t.gain, '& .MuiChip-icon': { color: t.gain, ml: 0.4 } }} />
            )}
            <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary, whiteSpace: 'nowrap' }}>{rightLabel}</Typography>
          </Box>
        )}
      </Box>

      {/* Outcomes — grow to fill the card and center vertically so 2-outcome
          cards (Yes/No) don't leave a void: the spare height splits evenly
          above/below instead of pooling above the footer. */}
      <Box sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 0.25, flex: 1 }}>
        {outcomes.map((o) => {
          const isWinner = isResolved && pool.winner === o.side;
          return (
            <Box key={o.side} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
              {o.crest ? (
                <Box component="img" src={o.crest} alt="" sx={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
              ) : o.icon ? (
                <Box sx={{ color: o.color, display: 'flex', flexShrink: 0 }}>{o.icon}</Box>
              ) : (
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: o.color, flexShrink: 0, mx: '6px' }} />
              )}
              <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.82rem', fontWeight: isWinner ? 700 : 500, color: isWinner ? o.color : t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.name}
              </Typography>
              {o.score != null && (
                <Box
                  sx={{
                    minWidth: 22,
                    height: 22,
                    px: 0.5,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '4px',
                    bgcolor: 'rgba(0,0,0,0.45)',
                    border: `1px solid ${t.border.medium}`,
                    flexShrink: 0,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      color: t.text.bright,
                      fontVariantNumeric: 'tabular-nums',
                      lineHeight: 1,
                      letterSpacing: '0.02em',
                    }}
                  >
                    {o.score}
                  </Typography>
                </Box>
              )}
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

      {/* Footer: volume + meta / claim — pinned to the bottom of the card */}
      <Box sx={{ mt: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', pt: 0.75, borderTop: `1px solid ${t.border.subtle}` }}>
        <Typography component="span" sx={{ fontSize: '0.72rem', fontWeight: 700, color: flash ? t.gain : t.text.tertiary, fontVariantNumeric: 'tabular-nums', px: 0.5, borderRadius: 0.75, bgcolor: flash ? withAlpha(t.gain, 0.15) : 'transparent', transition: 'background-color 0.4s ease, color 0.4s ease' }}>
          <AnimatedValue usdcValue={livePoolStr} prefix="$" /> Vol.
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
