'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, SportsSoccer } from '@mui/icons-material';
import { getIcon } from '@/lib/icon-registry';
import { AssetIcon } from '@/components/AssetIcon';
import { INTERVAL_LABELS } from '@/lib/constants';
import { resolveOddsChartIdentity } from '@/lib/oddsChartProps';
import { YES_ICON, NO_ICON } from '@/lib/predictionIcons';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getSocket, connectSocket, subscribePool, unsubscribePool } from '@/lib/socket';
import { OddsChart } from '@/components/pool/OddsChart';
import { useLiveScore, isMatchActive, isMatchFinished, formatLiveStatus } from '@/hooks/useLiveScores';
import { LiveBadge } from '@/components/LiveBadge';
import type { Pool } from '@/lib/api';
import type { CategoryConfig } from '@/hooks/useCategories';
import { getAssetName } from '@/lib/assets';

/**
 * Pool.matchAnalysis is sometimes a free-text blurb and sometimes a JSON blob
 * with head-to-head + recent matches. Turn it into a short readable string the
 * News box can show. Returns null when there's nothing useful (so the section
 * collapses cleanly).
 */
function formatMatchAnalysis(raw: string | null, homeTeam: string | null, awayTeam: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Free-text - keep as-is.
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return raw;
  try {
    const data = JSON.parse(trimmed) as {
      h2h?: { total?: number; homeWins?: number; awayWins?: number; draws?: number };
      matches?: Array<{ date?: string; home?: string; away?: string; homeScore?: number; awayScore?: number; score?: string }>;
    };
    const home = homeTeam?.trim() || 'Home';
    const away = awayTeam?.trim() || 'Away';
    const parts: string[] = [];
    const h = data.h2h;
    if (h && typeof h === 'object' && (h.total ?? 0) > 0) {
      const hw = h.homeWins ?? 0, aw = h.awayWins ?? 0, dw = h.draws ?? 0;
      parts.push(`Last ${h.total} H2H: ${home} ${hw}W · ${away} ${aw}W · ${dw} draws.`);
    }
    if (Array.isArray(data.matches) && data.matches.length > 0) {
      const recent = data.matches.slice(0, 2).map(m => {
        const d = m.date ? `${m.date}: ` : '';
        const score = m.score || (m.homeScore != null && m.awayScore != null ? `${m.homeScore}-${m.awayScore}` : '');
        const matchStr = score ? `${m.home || home} ${score} ${m.away || away}` : `${m.home || home} vs ${m.away || away}`;
        return `${d}${matchStr}`;
      });
      parts.push(`Recent: ${recent.join('; ')}.`);
    }
    return parts.length > 0 ? parts.join(' ') : null;
  } catch {
    return raw;
  }
}

interface Props {
  pools: Pool[];
  categoryMap: Map<string, CategoryConfig>;
  onSelect: (pool: Pool) => void;
}

/** Kalshi-style featured hero: a carousel of the top trending markets, each shown
 *  large with its outcomes and a live odds chart. Auto-rotates; arrows to navigate. */
export function FeaturedHero({ pools, categoryMap, onSelect }: Props) {
  const t = useThemeTokens();
  const [index, setIndex] = useState(0);
  const [live, setLive] = useState<{ up: string; down: string; draw: string } | null>(null);
  const [flash, setFlash] = useState(false);
  // News block expand state. Resets whenever the user navigates to a new
  // featured pool so the next slide isn't "stuck open" from a previous click.
  const [newsExpanded, setNewsExpanded] = useState(false);
  useEffect(() => { setNewsExpanded(false); }, [index]);
  // Trade ticks - floating "+$X UP" pills that animate over the chart on each
  // incoming bet (Kalshi/Polymarket-style live trade indicators).
  type Tick = { id: number; side: 'UP' | 'DOWN' | 'DRAW'; amount: bigint; color: string };
  const [ticks, setTicks] = useState<Tick[]>([]);
  const prevTotalsRef = useRef<{ up: bigint; down: bigint; draw: bigint }>({ up: 0n, down: 0n, draw: 0n });

  const count = pools.length;
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;
  const currentId = pools[safeIndex]?.id;

  // Live totals via WebSocket - re-subscribes whenever the featured pool changes.
  useEffect(() => {
    setLive(null);
    setFlash(false);
    setTicks([]);
    if (typeof window === 'undefined' || !currentId) return;
    // Seed prev totals from the current pool data so the first WS event's delta
    // reflects just that bet (not the whole pool history).
    const cp = pools.find(p => p.id === currentId);
    try {
      prevTotalsRef.current = {
        up: BigInt(cp?.totalUp || '0'),
        down: BigInt(cp?.totalDown || '0'),
        draw: BigInt(cp?.totalDraw || '0'),
      };
    } catch { /* keep */ }
    let tickId = 0;
    const sock = getSocket();
    connectSocket();
    subscribePool(currentId);
    const onUpdate = (d: { id: string; totalUp: string; totalDown: string; totalDraw: string }) => {
      if (d.id !== currentId) return;
      // Delta against the previous totals = the size of this bet, per side.
      try {
        const newUp = BigInt(d.totalUp || '0');
        const newDown = BigInt(d.totalDown || '0');
        const newDraw = BigInt(d.totalDraw || '0');
        const prev = prevTotalsRef.current;
        const dUp = newUp - prev.up;
        const dDown = newDown - prev.down;
        const dDraw = newDraw - prev.draw;
        prevTotalsRef.current = { up: newUp, down: newDown, draw: newDraw };
        const created: Tick[] = [];
        if (dUp > 0n) created.push({ id: ++tickId, side: 'UP', amount: dUp, color: t.up });
        if (dDown > 0n) created.push({ id: ++tickId, side: 'DOWN', amount: dDown, color: t.down });
        if (dDraw > 0n) created.push({ id: ++tickId, side: 'DRAW', amount: dDraw, color: t.draw });
        if (created.length > 0) {
          setTicks(prev => [...prev, ...created]);
          created.forEach(tk => setTimeout(() => setTicks(prev => prev.filter(x => x.id !== tk.id)), 2400));
        }
      } catch { /* ignore parse errors */ }
      setLive({ up: d.totalUp, down: d.totalDown, draw: d.totalDraw });
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    };
    sock.on('pool:updated', onUpdate);
    return () => { sock.off('pool:updated', onUpdate); unsubscribePool(currentId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId, t.up, t.down, t.draw]);

  // Live score for the featured sports pool — must be called every
  // render (rules of hooks), so we resolve it BEFORE the count-zero
  // early return. Falls back to null when the current pool is crypto or
  // PM, which the hook handles without firing a request.
  const currentPool = count > 0 ? pools[safeIndex] : null;
  const currentIsSports = currentPool != null && currentPool.poolType === 'SPORTS' && !currentPool.league?.startsWith('PM_');
  const liveScore = useLiveScore(currentIsSports ? currentPool!.id : null);
  const matchLive = liveScore != null && isMatchActive(liveScore);
  const matchFinished = liveScore != null && isMatchFinished(liveScore.status);

  if (count === 0) return null;
  const pool = pools[safeIndex];

  const isPrediction = !!pool.league?.startsWith('PM_');
  const isCrypto = pool.poolType !== 'SPORTS';
  const isTwoWay = isCrypto || isPrediction || pool.numSides === 2;

  // Category chip
  const category = pool.league ? categoryMap.get(pool.league) : undefined;
  const catColor = isCrypto ? t.up : category?.color || (isPrediction ? t.prediction : t.draw);
  const catLabel = isCrypto ? 'Crypto' : category?.label || pool.league || 'Sports';
  const CatIcon = getIcon(category?.iconKey);
  // Chip icon in the top-left category strip ("CRYPTO" / "POLITICS" / etc.).
  // Sized for the chip itself (~26px) so it actually reads as imagery and
  // not a tiny tag dot. Crypto pulls the Pacifica token SVG, PM markets
  // pull the question's own banner thumbnail, sports fall back to the
  // category badge — same identity rules as the card list.
  const catIcon: ReactNode = isCrypto
    ? <AssetIcon asset={pool.asset} size={30} />
    : isPrediction && pool.homeTeamCrest
      ? <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 30, height: 30, borderRadius: 1, objectFit: 'cover', flexShrink: 0 }} />
      : category?.badgeUrl
        // Dark pad: the Champions League badge is white/silver on transparent
        // — a white pad made it disappear; dark keeps it readable everywhere.
        ? <Box component="img" src={category.badgeUrl} alt="" sx={{ width: 30, height: 30, objectFit: 'contain', flexShrink: 0, ...(category?.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(13,18,25,0.92)', borderRadius: '50%', p: '2px' }) }} />
        : CatIcon ? <CatIcon sx={{ fontSize: 26 }} /> : !isPrediction ? <SportsSoccer sx={{ fontSize: 26 }} /> : null;

  // Title for sports is just "Home vs Away" — the score itself is shown
  // next to each team in the outcomes column below, same as MarketCard.
  // Stuffing it into the title duplicated the info and made the header
  // read like a sentence.
  const title = isCrypto
    ? `${getAssetName(pool.asset)} · ${INTERVAL_LABELS[pool.interval] || pool.interval}`
    : isPrediction
      ? (pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction market')
      : `${pool.homeTeam || 'Home'} vs ${pool.awayTeam || 'Away'}`;

  const tUp = live?.up ?? pool.totalUp;
  const tDown = live?.down ?? pool.totalDown;
  const tDraw = live?.draw ?? pool.totalDraw;
  const totalUp = Number(tUp), totalDown = Number(tDown), totalDraw = Number(tDraw);
  const tot = totalUp + totalDown + totalDraw;
  const pct = (s: number, def: number) => (tot > 0 ? Math.round((s / tot) * 100) : def);
  const upIcon = <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 24, height: 24 }} />;
  const downIcon = <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 24, height: 24 }} />;
  const yesIcon = <Box component="img" src={YES_ICON} alt="" sx={{ width: 24, height: 24 }} />;
  const noIcon = <Box component="img" src={NO_ICON} alt="" sx={{ width: 24, height: 24 }} />;
  // Sports score, mirrors MarketCard: live feed wins over the stored
  // final scores. Attached per-outcome below so the score box can sit
  // next to each team name (and never on Draw).
  const liveHomeScore = liveScore?.homeScore;
  const liveAwayScore = liveScore?.awayScore;
  const showLiveScore = liveScore != null && liveHomeScore != null && liveAwayScore != null && (matchLive || matchFinished);
  const showFinalScore = !showLiveScore && pool.homeScore != null && pool.awayScore != null;
  const homeScoreLabel = showLiveScore ? liveHomeScore! : showFinalScore ? pool.homeScore! : null;
  const awayScoreLabel = showLiveScore ? liveAwayScore! : showFinalScore ? pool.awayScore! : null;

  const outcomes: Array<{ name: string; color: string; pct: number; icon?: ReactNode; crest?: string | null; score?: number }> = isCrypto
    ? [{ name: 'Up', color: t.up, pct: pct(totalUp, 50), icon: upIcon }, { name: 'Down', color: t.down, pct: pct(totalDown, 50), icon: downIcon }]
    : isPrediction
      // Three PM shapes: Yes/No (✓ ✗), Up/Down (▲ ▼), answer-pair (no icon).
      ? !pool.awayTeam
        ? [{ name: 'Yes', color: t.up, pct: pct(totalUp, 50), icon: yesIcon }, { name: 'No', color: t.down, pct: pct(totalDown, 50), icon: noIcon }]
        : pool.homeTeam?.toLowerCase() === 'up' && pool.awayTeam.toLowerCase() === 'down'
          ? [{ name: pool.homeTeam, color: t.up, pct: pct(totalUp, 50), icon: upIcon }, { name: pool.awayTeam, color: t.down, pct: pct(totalDown, 50), icon: downIcon }]
          : [{ name: pool.homeTeam!, color: t.up, pct: pct(totalUp, 50) }, { name: pool.awayTeam, color: t.down, pct: pct(totalDown, 50) }]
      : [
          { name: pool.homeTeam || 'Home', color: t.up, pct: pct(totalUp, isTwoWay ? 50 : 33), crest: pool.homeTeamCrest, ...(homeScoreLabel != null && { score: homeScoreLabel }) },
          ...(!isTwoWay ? [{ name: 'Draw', color: t.draw, pct: pct(totalDraw, 34) }] : []),
          { name: pool.awayTeam || 'Away', color: t.down, pct: pct(totalDown, isTwoWay ? 50 : 33), crest: pool.awayTeamCrest, ...(awayScoreLabel != null && { score: awayScoreLabel }) },
        ];

  // Single source of truth for the chart's endpoint icons — shared with
  // /match/[id] and any future surface via lib/oddsChartProps. Labels are
  // built locally in `chartLabels` below because the hero card's outcome
  // column is narrower than the match page's and needs the short form.
  const { icons: chartIcons } = resolveOddsChartIdentity(pool);
  const shortChartLabel = (n: string | null | undefined): string | undefined =>
    n ? (n.length > 11 ? n.split(' ')[0].slice(0, 11) : n) : undefined;

  const chartLabels: { up?: string; down?: string; draw?: string } = isCrypto
    ? { up: 'Up', down: 'Down' }
    : isPrediction && !pool.awayTeam
      ? { up: 'Yes', down: 'No' }
      : {
          up: shortChartLabel(pool.homeTeam) || 'Home',
          down: shortChartLabel(pool.awayTeam) || 'Away',
          ...(pool.numSides === 3 ? { draw: 'Draw' } : {}),
        };

  let livePoolNum = Number(pool.totalPool);
  try { livePoolNum = Number(BigInt(tUp || '0') + BigInt(tDown || '0') + BigInt(tDraw || '0')); } catch { /* keep */ }
  const volUsd = livePoolNum / 1_000_000;
  const volLabel = volUsd >= 1e6 ? `$${(volUsd / 1e6).toFixed(1)}M` : volUsd >= 1e3 ? `$${(volUsd / 1e3).toFixed(1)}K` : `$${volUsd.toFixed(0)}`;

  // ── News blurb: real matchAnalysis for sports/PM, generated for crypto. ──
  const cryptoBlurb = isCrypto
    ? `Predict whether ${getAssetName(pool.asset)} closes higher or lower at the end of the next ${INTERVAL_LABELS[pool.interval] || pool.interval} round.`
    : null;
  const newsText = formatMatchAnalysis(pool.matchAnalysis ?? null, pool.homeTeam ?? null, pool.awayTeam ?? null) || cryptoBlurb;

  // Trade tick helpers (used by the floating "+$X" pills on incoming bets).
  const fmtTickAmount = (base: bigint): string => {
    const n = Number(base) / 1_000_000;
    if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
    if (n >= 100) return `$${n.toFixed(0)}`;
    return `$${n.toFixed(2)}`;
  };
  const tickName = (side: 'UP' | 'DOWN' | 'DRAW'): string => {
    if (isCrypto) return side === 'UP' ? 'UP' : 'DOWN';
    if (isPrediction) {
      if (side === 'UP') return pool.awayTeam ? pool.homeTeam || 'Yes' : 'Yes';
      return pool.awayTeam || 'No';
    }
    if (side === 'UP') return pool.homeTeam || 'Home';
    if (side === 'DOWN') return pool.awayTeam || 'Away';
    return 'Draw';
  };
  const shortName = (s: string): string => (s.length > 12 ? s.slice(0, 12) + '…' : s);

  return (
    <Box sx={{ bgcolor: t.bg.surface, border: t.surfaceBorder, borderRadius: 2, p: { xs: 1.75, md: 2.5 }, mb: { xs: 3, md: 4 } }}>
      {/* Header: category + pagination */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        {/* Left cluster: category icon + label + LIVE badge (when live).
            The progress detail (e.g. "2nd Inning IN2'") lives on the
            *right* side of the header so it doesn't crowd the LIVE pill
            and reads as a discrete status string at the corner. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, flexWrap: 'wrap' }}>
          <Box sx={{ color: catColor, display: 'flex' }}>{catIcon}</Box>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: catColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{catLabel}</Typography>
          {matchLive && <LiveBadge />}
        </Box>
        {count > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="button" onClick={() => setIndex(i => (i - 1 + count) % count)} sx={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}>
              <ChevronLeft sx={{ fontSize: 16 }} />
            </Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center' }}>{index + 1} / {count}</Typography>
            <Box component="button" onClick={() => setIndex(i => (i + 1) % count)} sx={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}>
              <ChevronRight sx={{ fontSize: 16 }} />
            </Box>
          </Box>
        )}
      </Box>

      {/* Body: outcomes (left) + chart (right). Left column stretches to match
          the chart height so its content can spread (title at top, volume at bottom). */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: { xs: 2, md: 3 }, alignItems: 'stretch' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {/* Title + live progress in the same row — the progress text
              floats to the right edge of the outcomes column (not the
              full card width) so it sits flush with the percentage column
              below. Wraps on tight viewports without overflowing. */}
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
            <Typography
              onClick={() => onSelect(pool)}
              sx={{ fontSize: { xs: '0.95rem', md: '1.05rem' }, fontWeight: 800, color: t.text.primary, lineHeight: 1.3, cursor: 'pointer', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', '&:hover': { color: t.up } }}
            >
              {title}
            </Typography>
            {matchLive && liveScore && (
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', flexShrink: 0 }}>
                {formatLiveStatus(liveScore.status, liveScore.progress)}
              </Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
            {outcomes.map((o) => (
              <Box key={o.name} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                {o.crest ? (
                  <Box component="img" src={o.crest} alt="" sx={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
                ) : o.icon ? (
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>{o.icon}</Box>
                ) : (
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: o.color, flexShrink: 0, mx: '7px' }} />
                )}
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.9rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</Typography>
                {o.score != null && (
                  <Box
                    sx={{
                      minWidth: 26,
                      height: 24,
                      px: 0.6,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: '4px',
                      bgcolor: 'rgba(0,0,0,0.45)',
                      border: `1px solid ${t.border.medium}`,
                      flexShrink: 0,
                    }}
                  >
                    <Typography sx={{ fontSize: '0.88rem', fontWeight: 800, color: t.text.bright, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '0.02em' }}>
                      {o.score}
                    </Typography>
                  </Box>
                )}
                <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: o.color, fontVariantNumeric: 'tabular-nums' }}>{o.pct}%</Typography>
              </Box>
            ))}
          </Box>
          {/* News — click to expand. The clamped/expanded state lives on
              `newsExpanded`; we render the same Typography either fully or
              clipped to 3 lines so a long PM rules blob stays readable
              without rebuilding the layout. The "Show less" hint only
              appears once the block is open; the initial cue is the cursor
              pointer + hover colour shift. */}
          {newsText && (
            <Box sx={{ mt: 0.5 }}>
              <Typography sx={{ fontSize: '0.58rem', fontWeight: 800, color: t.text.dimmed, textTransform: 'uppercase', letterSpacing: '0.07em', mb: 0.5 }}>
                {pool.matchAnalysis ? 'News' : 'About'}
              </Typography>
              <Typography
                onClick={() => setNewsExpanded(e => !e)}
                sx={{
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  color: t.text.rich,
                  lineHeight: 1.5,
                  cursor: 'pointer',
                  transition: 'color 0.15s',
                  '&:hover': { color: t.text.primary },
                  ...(newsExpanded
                    ? {}
                    : {
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }),
                }}
              >
                {newsText}
              </Typography>
              {newsExpanded && (
                <Typography
                  onClick={() => setNewsExpanded(false)}
                  sx={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    color: t.text.tertiary,
                    cursor: 'pointer',
                    mt: 0.5,
                    '&:hover': { color: t.text.primary },
                  }}
                >
                  Show less
                </Typography>
              )}
            </Box>
          )}

          <Box
            onClick={() => onSelect(pool)}
            sx={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 0.5, px: 2, py: 0.75, borderRadius: 1, cursor: 'pointer', bgcolor: withAlpha(catColor, 0.12), color: catColor, fontSize: '0.8rem', fontWeight: 700, mt: 'auto', '&:hover': { bgcolor: withAlpha(catColor, 0.2) } }}
          >
            View market <ChevronRight sx={{ fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary, mt: 1, pt: 0 }}>
            <Box component="span" sx={{ fontWeight: 700, color: flash ? t.gain : t.text.tertiary, px: 0.5, borderRadius: 0.75, bgcolor: flash ? withAlpha(t.gain, 0.15) : 'transparent', transition: 'background-color 0.4s ease, color 0.4s ease' }}>{volLabel} Vol.</Box>
          </Typography>
        </Box>

        <Box sx={{ minWidth: 0, position: 'relative' }}>
          <OddsChart key={pool.id} poolId={pool.id} totalUp={pool.totalUp} totalDown={pool.totalDown} totalDraw={pool.totalDraw} lockSource="updown" hideControls seedDefault threeWay={pool.numSides === 3} labels={chartLabels} icons={chartIcons} />
          {/* Live trade ticks - floating pills on incoming bets. */}
          {ticks.length > 0 && (
            <Box sx={{ position: 'absolute', top: 8, right: 64, pointerEvents: 'none', zIndex: 5, display: 'flex', flexDirection: 'column', gap: 0.25, alignItems: 'flex-end' }}>
              {ticks.map(tk => (
                <Box
                  key={tk.id}
                  sx={{
                    display: 'inline-flex', alignItems: 'center', gap: 0.5,
                    px: 1, py: 0.4,
                    borderRadius: '999px',
                    border: `1px solid ${withAlpha(tk.color, 0.45)}`,
                    bgcolor: withAlpha(tk.color, 0.18),
                    backdropFilter: 'blur(8px)',
                    whiteSpace: 'nowrap',
                    '@keyframes floatTick': {
                      '0%': { transform: 'translateY(0)', opacity: 0 },
                      '15%': { transform: 'translateY(-4px)', opacity: 1 },
                      '100%': { transform: 'translateY(-48px)', opacity: 0 },
                    },
                    animation: 'floatTick 2.4s ease-out forwards',
                  }}
                >
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: tk.color, fontVariantNumeric: 'tabular-nums' }}>
                    +{fmtTickAmount(tk.amount)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: tk.color, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.85 }}>
                    {shortName(tickName(tk.side))}
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}
