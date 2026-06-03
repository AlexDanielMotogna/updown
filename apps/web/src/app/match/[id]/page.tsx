'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Box, Typography, Button, TextField, CircularProgress } from '@mui/material';
import { GridView, Speed, Timer, AvTimer, Schedule, TrendingUp } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePool } from '@/hooks/usePools';
import { useDeposit, useClaim } from '@/hooks/useTransactions';
import { useClaimableBets } from '@/hooks/useBets';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { AppShell, TransactionModal, EmptyMessage } from '@/components';
import { ThreeWaySelector } from '@/components/sports/ThreeWaySelector';
import { OddsChart } from '@/components/pool/OddsChart';
import { resolveOddsChartIdentity } from '@/lib/oddsChartProps';
import { MatchHeader } from '@/components/sports/MatchHeader';
import { MatchScoreRow } from '@/components/sports/MatchScoreRow';
import { MatchInsights } from '@/components/sports/MatchInsights';
import { DeterminingCard, OutcomeCard, CancelledCard } from '@/components/pool/ResolutionCards';
import { BetFlash } from '@/components/BetFlash';
import { useBetFlash } from '@/hooks/useBetFlash';
import { MarketFilter, type MarketType } from '@/components/sports/MarketFilter';
import { useThemeTokens } from '@/app/providers';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { useLiveScore, isMatchActive, isMatchFinished, formatLiveStatus, isAwaitingFinalResult } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';

// Filter dropdown options — same set the home page uses so MarketFilter
// renders consistently. Changes navigate back to /.
const ASSET_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: 'BTC', label: 'BTC', img: '/coins/btc-coin.png' },
  { value: 'ETH', label: 'ETH', img: '/coins/eth-coin.png' },
  { value: 'SOL', label: 'SOL', img: '/coins/sol-coin.png' },
];

const INTERVAL_FILTERS = [
  { value: 'ALL', label: 'All', icon: <GridView sx={{ fontSize: 16 }} /> },
  { value: '3m', label: '3 min', icon: <Speed sx={{ fontSize: 16 }} /> },
  { value: '5m', label: '5 min', icon: <Timer sx={{ fontSize: 16 }} /> },
  { value: '15m', label: '15 min', icon: <AvTimer sx={{ fontSize: 16 }} /> },
  { value: '1h', label: '1 hour', icon: <Schedule sx={{ fontSize: 16 }} /> },
];

const PRESETS = [10, 50, 100, 500];

interface PoolBet {
  wallet: string;
  side: string;
  amount: string;
  createdAt: string;
}

function MarketInfo({ description }: { description: string }) {
  const t = useThemeTokens();
  const [tab, setTab] = useState<'rules' | 'context'>('rules');

  // Split description: first paragraph = context summary, rest = rules
  const paragraphs = description.split('\n\n').filter(Boolean);
  const rules = paragraphs.filter(p => p.toLowerCase().includes('resolve') || p.toLowerCase().includes('source') || p.toLowerCase().includes('otherwise'));
  const context = paragraphs.filter(p => !rules.includes(p));
  // If can't split cleanly, put everything in rules
  const rulesText = rules.length > 0 ? rules.join('\n') : description.replace(/\n\n+/g, '\n');
  const contextText = context.length > 0 ? context.join('\n') : null;

  return (
    <Box>
      {/* Tab switcher */}
      <Box sx={{ display: 'flex', gap: '2px', mb: 1.5 }}>
        {(['rules', 'context'] as const).map(tabKey => (
          <Box
            key={tabKey}
            onClick={() => setTab(tabKey)}
            sx={{
              px: 1.5, py: 0.5, borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              bgcolor: tab === tabKey ? t.hover.strong : 'transparent',
              color: tab === tabKey ? t.text.primary : t.text.quaternary,
              '&:hover': { bgcolor: t.hover.default },
            }}
          >
            {tabKey === 'rules' ? 'Rules' : 'Market Context'}
          </Box>
        ))}
      </Box>

      {/* Content */}
      {tab === 'rules' && (
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: t.text.rich, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {rulesText}
        </Typography>
      )}
      {tab === 'context' && (
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: t.text.rich, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
          {contextText || 'No additional context available for this market.'}
        </Typography>
      )}
    </Box>
  );
}

export default function MatchDetailPage() {
  const t = useThemeTokens();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { data: poolData, isLoading } = usePool(id);
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset: resetDeposit } = useDeposit();
  const { claim, state: claimState, reset: resetClaim } = useClaim();
  const { data: claimableData } = useClaimableBets();

  const [side, setSide] = useState<'UP' | 'DOWN' | 'DRAW' | null>(null);
  const [amount, setAmount] = useState('');
  const [showTxModal, setShowTxModal] = useState(false);

  // Activity log state
  const [bets, setBets] = useState<PoolBet[]>([]);
  const knownBetsRef = useRef<Set<string>>(new Set());
  const [newBetKeys, setNewBetKeys] = useState<Set<string>>(new Set());

  // Live totals polling
  const [liveTotals, setLiveTotals] = useState<{
    totalUp: string;
    totalDown: string;
    totalDraw: string;
    totalPool: string;
    betCount: number;
  } | null>(null);

  const pool = poolData?.data;

  // Crypto pools live at /pool/[id] — the surface here is built around
  // sports / PM markets (home vs away team, kickoffs, FT pills). Landing
  // a crypto pool here used to render HOM/AWA placeholders and an "FT"
  // pill, which looked like the pool had vanished. Bounce to the right
  // page as soon as we know the type.
  useEffect(() => {
    if (pool && pool.poolType === 'CRYPTO') {
      router.replace(`/pool/${pool.id}`);
    }
  }, [pool, router]);

  const liveScore = useLiveScore(pool?.id ?? null);
  const categoryMap = useCategoryMap();
  const betFlashes = useBetFlash(pool?.id);
  const isResolved = pool ? (pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED') : false;
  // CANCELLED pools (PM markets retired by Polymarket where neither
  // Gamma nor CTF could resolve, or sports pools admin-cancelled) need
  // their own surface — without this flag the page falls through to
  // DeterminingCard and the user sees "Hold on, determining winner…"
  // forever for a market that will never resolve.
  const isCancelled = pool ? pool.status === 'CANCELLED' : false;
  const matchFinished = liveScore && isMatchFinished(liveScore.status);
  const isLocked = pool && !isResolved && pool.lockTime && new Date(pool.lockTime).getTime() < Date.now();
  const hasStarted = pool && new Date(pool.startTime).getTime() < Date.now();
  const hasScore = pool && pool.homeScore != null && pool.awayScore != null;
  // Phase B: surface the "awaiting final result" placeholder when the match
  // is past expected end but the feed hasn't reported FT yet. Backend
  // triggers the Odds API FT fallback after the grace window for non-knockout
  // leagues; until then the UI stops pretending it's still live. Computed
  // BEFORE matchLive so we can exclude "stuck 2H 95'" feed states from the
  // live indicator.
  const awaitingFinalFeed = pool ? isAwaitingFinalResult(pool, liveScore?.status) : false;
  const matchLive = liveScore && isMatchActive(liveScore) && !awaitingFinalFeed;
  // PM-specific awaiting state: once the betting window closes we're
  // sitting on Polymarket / UMA to confirm the outcome. The generic
  // `awaitingFinalFeed` path keys on startTime + a sports duration which
  // doesn't translate cleanly to PM markets (their startTime is when the
  // market opened, which can be days ago — `+2h` always reads as "past
  // expected end"). We also need the loader to keep showing while the
  // pool sits in RESOLVED/CLAIMABLE without a `winner` field yet, which
  // happens during the brief window between the scheduler flipping the
  // status and the resolve-on-chain call writing the side.
  const isPmPool = pool?.league?.startsWith('PM_') ?? false;
  const pmPredictionsClosed = isPmPool && pool && (
    (pool.lockTime && new Date(pool.lockTime).getTime() < Date.now()) ||
    (pool.endTime && new Date(pool.endTime).getTime() < Date.now())
  );
  const awaitingResolution = pool && (
    (!isResolved && ((hasScore && !matchLive) || awaitingFinalFeed)) ||
    (!isResolved && pmPredictionsClosed) ||
    (isResolved && !pool.winner)
  );

  // Poll bets + pool totals every 5s
  const poolId = pool?.id;
  useEffect(() => {
    if (!poolId) {
      setBets([]);
      knownBetsRef.current.clear();
      setLiveTotals(null);
      return;
    }
    let active = true;
    const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
    const betsUrl = `${apiBase}/api/pools/${poolId}/bets`;
    const poolUrl = `${apiBase}/api/pools/${poolId}`;

    const poll = async () => {
      try {
        const r = await fetch(betsUrl);
        const d = await r.json();
        if (!active || !d.success) return;
        const freshKeys = new Set<string>();
        for (const b of d.data) {
          const key = `${b.wallet}-${b.createdAt}`;
          if (!knownBetsRef.current.has(key)) {
            freshKeys.add(key);
            knownBetsRef.current.add(key);
          }
        }
        setBets(d.data);
        if (freshKeys.size > 0 && freshKeys.size <= 5) {
          setNewBetKeys(freshKeys);
          setTimeout(() => setNewBetKeys(new Set()), 2000);
        }
      } catch { /* ignore */ }

      try {
        const pr = await fetch(poolUrl);
        const pd = await pr.json();
        if (active && pd.success && pd.data) {
          setLiveTotals({
            totalUp: pd.data.totalUp,
            totalDown: pd.data.totalDown,
            totalDraw: pd.data.totalDraw ?? '0',
            totalPool: pd.data.totalPool,
            betCount: pd.data.betCount ?? 0,
          });
        }
      } catch { /* ignore */ }
    };

    poll();
    const iv = setInterval(poll, 5000);
    return () => { active = false; clearInterval(iv); };
  }, [poolId]);

  const amountNum = parseFloat(amount) || 0;
  const amountUsdc = Math.round(amountNum * USDC_DIVISOR);
  const balanceNum = balance ? balance.uiAmount : 0;

  const totalUp = Number(liveTotals?.totalUp ?? pool?.totalUp ?? 0);
  const totalDown = Number(liveTotals?.totalDown ?? pool?.totalDown ?? 0);
  const totalDraw = Number(liveTotals?.totalDraw ?? pool?.totalDraw ?? 0);
  const betCount = liveTotals?.betCount ?? pool?.betCount ?? 0;
  const totalPoolStr = liveTotals?.totalPool ?? pool?.totalPool ?? '0';

  const canSubmit = connected && side && amountNum > 0 && amountNum <= balanceNum && depositState.status === 'idle';

  // Payout calc
  const estimatedPayout = useMemo(() => {
    if (!pool || !side || amountNum <= 0) return 0;
    const tUp = Number(liveTotals?.totalUp ?? pool.totalUp);
    const tDown = Number(liveTotals?.totalDown ?? pool.totalDown);
    const tDraw = Number(liveTotals?.totalDraw ?? pool.totalDraw);
    const totalPool = tUp + tDown + tDraw + amountUsdc;
    const sideTotal = (side === 'UP' ? tUp : side === 'DOWN' ? tDown : tDraw) + amountUsdc;
    if (sideTotal === 0) return 0;
    return (amountUsdc / sideTotal) * totalPool / USDC_DIVISOR;
  }, [pool, side, amountUsdc, amountNum, liveTotals]);

  const handleSubmit = async () => {
    if (!pool || !side) return;
    setShowTxModal(true);
    try { await deposit(pool.id, side as 'UP' | 'DOWN', amountUsdc); } catch { /* handled in state */ }
  };

  const handleCloseTxModal = () => {
    setShowTxModal(false);
    resetDeposit();
  };

  // Category navbar — flips back to the home grid on any change, so the
  // filter strip stays sticky-present the way /pool/[id] does.
  const goToHome = useCallback((key: string, value: string) => {
    const params = new URLSearchParams();
    // Default home view is CRYPTO; only set 'type' for everything else.
    if (key === 'type' && value !== 'CRYPTO') params.set('type', value);
    else if (key !== 'type' && value !== 'ALL') params.set(key, value);
    const qs = params.toString();
    router.push(qs ? `/?${qs}` : '/');
  }, [router]);

  // Pre-select the right top-tab so the user lands on /match/[id] with the
  // matching category highlighted. PM markets use the league code as their
  // own tab; everything else falls under SPORTS.
  const initialMarketType: MarketType = poolData?.data?.league?.startsWith('PM_')
    ? poolData.data.league
    : 'SPORTS';

  const filterBar = (
    <MarketFilter
      marketType={initialMarketType}
      onMarketTypeChange={(v: MarketType) => goToHome('type', v)}
      assetFilter="ALL"
      intervalFilter="ALL"
      onAssetChange={v => goToHome('asset', v)}
      onIntervalChange={v => goToHome('interval', v)}
      assetOptions={ASSET_FILTERS}
      intervalOptions={INTERVAL_FILTERS}
      sportFilter="ALL"
      onSportChange={v => goToHome('sport', v)}
      leagueFilter="ALL"
      onLeagueChange={v => goToHome('league', v)}
    />
  );

  // Show the same spinner while the redirect-to-/pool/[id] effect runs for
  // crypto pools. Otherwise the page would briefly flash the sports header
  // (HOM / AWA / "FT") before the navigation kicked in.
  if (isLoading || (pool && pool.poolType === 'CRYPTO')) {
    return (
      <AppShell topBar={filterBar}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: t.up }} />
        </Box>
      </AppShell>
    );
  }

  if (!pool) {
    return (
      <AppShell topBar={filterBar}>
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: t.text.primary, mb: 1 }}>
            Match not found
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: t.text.soft, mb: 3 }}>
            This market may have ended or is no longer available.
          </Typography>
          <Link href="/?type=SPORTS" style={{ textDecoration: 'none' }}>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                px: 4,
                py: 1,
                bgcolor: t.border.default,
                color: t.text.primary,
                fontWeight: 600,
                fontSize: '0.85rem',
                borderRadius: '5px',
                cursor: 'pointer',
                transition: 'background 0.15s',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.10)' },
              }}
            >
              Back to Markets
            </Box>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const league = pool.league || '';
  const isPrediction = league.startsWith('PM_');
  const category = categoryMap.get(league);
  const catColor = category?.color || (isPrediction ? t.prediction : t.text.primary);
  const catLabel = category?.label || league;
  const catBadge = category?.badgeUrl;
  const CatIcon = getIcon(category?.iconKey);
  const homeShort = isPrediction ? '' : (pool.homeTeam || 'Home').slice(0, 3).toUpperCase();
  const awayShort = isPrediction ? '' : (pool.awayTeam || 'Away').slice(0, 3).toUpperCase();
  const winnerLabel = isResolved ? (pool.winner === 'UP' ? (isPrediction && !pool.awayTeam ? 'Yes' : pool.homeTeam) : pool.winner === 'DOWN' ? (isPrediction && !pool.awayTeam ? 'No' : pool.awayTeam) : pool.winner === 'DRAW' ? 'Draw' : null) : null;
  const winnerColor = pool.winner === 'UP' ? t.up : pool.winner === 'DOWN' ? t.down : t.draw;

  const kickoff = new Date(pool.startTime).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  // ── Header + score-row derivation ────────────────────────────────────────
  // Short status word for the breadcrumb pill in MatchHeader. PM markets
  // don't have halves / full-time / kickoffs — they have a market endDate,
  // so we use "ENDED" / "CLOSING" instead of sports terminology. Sports
  // and crypto keep the FT / LIVE pill they always had.
  const endedLabel = isPrediction ? 'ENDED' : 'FT';
  const headerStatus = isResolved ? endedLabel
    : matchLive ? 'LIVE'
    : matchFinished || awaitingResolution ? endedLabel
    : isLocked ? 'LOCKED'
    : hasStarted ? 'IN PROGRESS'
    : pool.status === 'JOINING' ? 'OPEN'
    : 'UPCOMING';
  const headerStatusColor = headerStatus === 'LIVE' ? t.gain
    : headerStatus === 'IN PROGRESS' ? t.accent
    : headerStatus === 'OPEN' ? t.up
    : t.text.secondary;
  const headerStatusPulse = headerStatus === 'LIVE';

  // Breadcrumb chain after the status pill. PM categories are flat; football
  // leagues are nested under Soccer; SportsDB sports are already sport-level.
  const breadcrumbs: string[] = isPrediction
    ? [catLabel]
    : category?.type === 'FOOTBALL_LEAGUE'
      ? ['Sports', 'Soccer', catLabel]
      : category?.type === 'SPORTSDB_SPORT'
        ? ['Sports', catLabel]
        : ['Sports', catLabel];

  // Pool resolution wins over the upstream live feed: TheSportsDB sometimes
  // lags behind by minutes and still reports "2H" while our scheduler has
  // already pulled the final score and resolved the pool. Always defer to
  // the pool's own state before falling back to feed-driven status.
  // PM markets close at a fixed endDate — use "Market closed" instead of
  // sports-y "Full Time", and "Closes" instead of "Kickoff" pre-close.
  const endedStatusText = isPrediction ? 'Market closed' : 'Full Time';
  const preStartText = isPrediction ? `Closes ${kickoff}` : `Kickoff ${kickoff}`;
  const scoreStatusText = isResolved || matchFinished || awaitingResolution
    ? endedStatusText
    : matchLive && liveScore
      ? `LIVE · ${formatLiveStatus(liveScore.status, liveScore.progress)}`
      : isLocked
        ? 'Locked'
        : hasStarted
          ? 'In progress'
          : preStartText;
  const scoreVariant: 'live' | 'ended' | 'scheduled' | 'inplay' =
    isResolved || matchFinished || awaitingResolution
      ? 'ended'
      : matchLive
        ? 'live'
        : hasStarted
          ? 'inplay'
          : 'scheduled';

  return (
    <AppShell topBar={filterBar}>
      {/* Single grid mirroring /pool/[id]: header + score + insights stack
          in the left column, the bet card pins at the top of the right
          column so both surfaces start from the same Y. */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' },
          gap: { xs: 0, md: 2 },
          alignItems: 'start',
          maxWidth: 1400,
          mx: 'auto',
          pt: { xs: 1.5, md: 2.5 },
          px: { xs: 0, md: 1 },
        }}
      >
        {/* ── Left column: Header + Score + Insights + Activity ── */}
        <Box sx={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: { xs: 1.5, md: 2 } }}>
          <MatchHeader
            statusLabel={headerStatus}
            statusColor={headerStatusColor}
            statusPulse={headerStatusPulse}
            breadcrumbs={breadcrumbs}
            title={pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || catLabel}
            // PM markets carry the question thumbnail in homeTeamCrest, so it
            // takes priority over the category badge — the user wants the
            // visual identity to come from the question itself, falling back
            // to the league badge / filter icon only when no image exists.
            leagueBadgeUrl={(isPrediction ? pool.homeTeamCrest : null) || catBadge}
            leagueIcon={(isPrediction ? pool.homeTeamCrest : null) || catBadge ? null : (CatIcon as unknown as React.ComponentType<{ sx?: object }>) || null}
            padBadge={category?.type === 'FOOTBALL_LEAGUE'}
            fillBadge={isPrediction && !!pool.homeTeamCrest}
            tileBg={catColor ? `${catColor}1A` : undefined}
          />
          {!isPrediction && (
            <MatchScoreRow
              homeTeam={pool.homeTeam || 'Home'}
              awayTeam={pool.awayTeam || 'Away'}
              homeCrest={pool.homeTeamCrest}
              awayCrest={pool.awayTeamCrest}
              homeScore={liveScore?.homeScore ?? pool.homeScore ?? null}
              awayScore={liveScore?.awayScore ?? pool.awayScore ?? null}
              statusText={scoreStatusText}
              variant={scoreVariant}
            />
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 5, px: { xs: 2, md: 3 }, pb: { xs: 4, md: 4 } }}>
          {/* Chart slot. Wrap with position: relative so BetFlash can
              anchor to the top-left regardless of which chart variant
              renders (sports MatchInsights vs PM OddsChart). */}
          <Box sx={{ position: 'relative' }}>
            <BetFlash
              flashes={betFlashes}
              variant="chart-left"
              prediction={isPrediction}
              sideLabel={!isPrediction ? { UP: pool.homeTeam || 'Home', DOWN: pool.awayTeam || 'Away', DRAW: 'Draw' } : undefined}
            />
            {/* Sports: chart + head-to-head as a toggle. Labels + icons are
                resolved via the shared helper so the chart hover tooltip
                and right-edge badges use the same crests + dot fallbacks as
                the cards. */}
            {!isPrediction && (() => {
              const { labels, icons } = resolveOddsChartIdentity(pool);
              return (
                <MatchInsights
                  poolId={pool.id}
                  homeTeam={pool.homeTeam || 'Home'}
                  awayTeam={pool.awayTeam || 'Away'}
                  totalUp={liveTotals?.totalUp ?? pool.totalUp}
                  totalDown={liveTotals?.totalDown ?? pool.totalDown}
                  totalDraw={liveTotals?.totalDraw ?? (pool.totalDraw ?? '0')}
                  numSides={pool.numSides}
                  matchAnalysis={pool.matchAnalysis}
                  labels={labels}
                  icons={icons}
                />
              );
            })()}

            {/* Prediction markets: keep the standalone OddsChart + rules tabs.
                We pass seedDefault so a fresh PM market with no Polymarket
                history yet still renders a flat baseline instead of the
                "No market data" placeholder — the UpDown bet stream
                backfills on top once /bets-odds-history responds. Icons +
                labels match the cards (Yes/No glyph when there's no
                awayTeam, question banner otherwise). */}
            {isPrediction && (() => {
              const { labels, icons, threeWay } = resolveOddsChartIdentity(pool);
              return (
                <OddsChart
                  poolId={pool.id}
                  question={pool.homeTeam}
                  currentOdds={pool.marketOdds}
                  totalUp={pool.totalUp}
                  totalDown={pool.totalDown}
                  seedDefault
                  labels={labels}
                  icons={icons}
                  threeWay={threeWay}
                />
              );
            })()}
          </Box>
          {isPrediction && pool.matchAnalysis && (
            <MarketInfo description={pool.matchAnalysis} />
          )}

          {/* Activity log */}
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
              Activity
            </Typography>
            <Box sx={{
              maxHeight: 280,
              overflow: 'auto',
              '&::-webkit-scrollbar': { display: 'none' },
              scrollbarWidth: 'none',
              msOverflowStyle: 'none' as unknown as string,
            }}>
              {bets.length === 0 && (
                <EmptyMessage>No predictions yet</EmptyMessage>
              )}
              <AnimatePresence>
                {bets.map((b) => {
                  const key = `${b.wallet}-${b.createdAt}`;
                  const isNew = newBetKeys.has(key);
                  const sideColor = b.side === 'UP' ? t.up : b.side === 'DOWN' ? t.down : t.draw;
                  const sideLabel = isPrediction
                    ? (b.side === 'UP' ? (pool.awayTeam ? pool.homeTeam?.slice(0, 3).toUpperCase() : 'YES') : b.side === 'DOWN' ? (pool.awayTeam ? pool.awayTeam?.slice(0, 3).toUpperCase() : 'NO') : 'DRAW')
                    : (b.side === 'UP' ? (pool.homeTeam?.slice(0, 3).toUpperCase() || 'HOME') : b.side === 'DOWN' ? (pool.awayTeam?.slice(0, 3).toUpperCase() || 'AWAY') : 'DRAW');
                  const amt = (Number(b.amount) / USDC_DIVISOR).toFixed(2);
                  const ago = Math.floor((Date.now() - new Date(b.createdAt).getTime()) / 60000);
                  const timeStr = ago < 1 ? 'now' : ago < 60 ? `${ago}m` : `${Math.floor(ago / 60)}h`;
                  return (
                    <motion.div
                      key={key}
                      initial={isNew ? { opacity: 0, scale: 0.96, y: -10 } : false}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                      layout
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, fontSize: '0.75rem', fontWeight: 600 }}>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.soft, width: 75, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.wallet}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: sideColor, width: 55, flexShrink: 0 }}>
                          {sideLabel}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.primary, flex: 1, textAlign: 'right' }}>
                          ${amt}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: t.text.muted, width: 25, textAlign: 'right', flexShrink: 0 }}>
                          {timeStr}
                        </Typography>
                      </Box>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </Box>
          </Box>
          </Box>
        </Box>

        {/* ── Right column: Selector + Bet form (or end-of-pool card) ── */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          width: '100%',
          mt: { xs: 2, md: 0 },
        }}>
          {(() => {
            // Same Polymarket / Kalshi pattern crypto uses: as soon as the
            // match is over we drop the bet form and show one of the shared
            // resolution cards instead.
            const subtitleSports = pool.awayTeam
              ? `${pool.homeTeam} vs ${pool.awayTeam} · ${catLabel}`
              : pool.homeTeam || catLabel;
            const subtitlePM = pool.homeTeam || catLabel;
            const subtitle = isPrediction ? subtitlePM : subtitleSports;
            // PM markets close at a fixed endDate; sports have a kickoff.
            // Past-tense "Closed" reads correctly because the resolution
            // cards only render once startTime is in the past.
            const metaPrefix = isPrediction ? 'Closed' : 'Kickoff';
            const meta = pool.startTime ? `${metaPrefix} ${kickoff}` : undefined;
            // The DeterminingCard's generic body line is too vague for PM —
            // operators have asked us to surface BOTH the source we're
            // waiting on AND a realistic timing window. Sports get a much
            // tighter copy because TheSportsDB / Odds API confirm within
            // minutes of full-time.
            const determiningBody = isPrediction
              ? "Waiting for Polymarket's UMA oracle to confirm the outcome. Resolution usually lands within a few hours but can take 1-3 days for contested questions."
              : pool.poolType === 'SPORTS'
                ? "Waiting for the final whistle to be confirmed by the data feed. Usually within minutes of full time."
                : undefined; // crypto keeps the generic on-chain copy
            // CANCELLED takes precedence over every other end-state. The
            // pool can show CANCELLED + winner=null + status flag, so we
            // must check this BEFORE isResolved (which is false here) and
            // BEFORE the determining branch (which would otherwise spin
            // forever for a market that's been formally cancelled).
            if (isCancelled) {
              return <CancelledCard subtitle={subtitle} meta={meta} />;
            }
            if (isResolved && winnerLabel) {
              return (
                <OutcomeCard
                  subtitle={subtitle}
                  meta={meta}
                  outcomeLabel={winnerLabel}
                  outcomeColor={winnerColor}
                />
              );
            }
            if (matchFinished || awaitingResolution) {
              return <DeterminingCard subtitle={subtitle} meta={meta} bodyText={determiningBody} />;
            }
            return null;
          })()}
          {!isCancelled && !(isResolved && winnerLabel) && !(matchFinished || awaitingResolution) && (
          <Box sx={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1.5,
            width: '100%',
            bgcolor: { md: t.hover.subtle },
            borderRadius: '5px',
            p: { md: 2 },
          }}>
          {/* Teams / Question */}
          {isPrediction ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2, px: 1 }}>
              <Box sx={{ width: 56, height: 56, flexShrink: 0, borderRadius: 1.5, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pool.homeTeamCrest
                  ? <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <TrendingUp sx={{ fontSize: 28, color: catColor }} />}
              </Box>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.4 }}>
                {pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, py: 1.5 }}>
              <Box sx={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                {pool.homeTeamCrest && (
                  <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 40, height: 40, objectFit: 'contain', mb: 0.5, mx: 'auto', display: 'block' }} />
                )}
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? t.up : t.text.primary }}>{homeShort}</Typography>
              </Box>
              {(matchLive || matchFinished) && !isResolved && liveScore ? (
                <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: matchLive ? t.gain : t.text.primary }}>
                    {liveScore.homeScore} - {liveScore.awayScore}
                  </Typography>
                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: matchLive ? t.gain : t.text.tertiary, opacity: 0.8 }}>
                    {formatLiveStatus(liveScore.status, liveScore.progress)}
                  </Typography>
                </Box>
              ) : hasScore ? (
                <Box sx={{ textAlign: 'center', flexShrink: 0 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>
                    {pool.homeScore} - {pool.awayScore}
                  </Typography>
                  {awaitingResolution && (
                    <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: t.text.tertiary }}>
                      Full Time
                    </Typography>
                  )}
                </Box>
              ) : isResolved && pool.homeScore != null && pool.awayScore != null ? (
                <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary, flexShrink: 0 }}>
                  {pool.homeScore} - {pool.awayScore}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.muted, flexShrink: 0 }}>vs</Typography>
              )}
              <Box sx={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                {pool.awayTeamCrest && (
                  <Box component="img" src={pool.awayTeamCrest} alt="" sx={{ width: 40, height: 40, objectFit: 'contain', mb: 0.5, mx: 'auto', display: 'block' }} />
                )}
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? t.down : t.text.primary }}>{awayShort}</Typography>
              </Box>
            </Box>
          )}

          {/* Winner badge in right column */}
          {isResolved && winnerLabel && (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
                Result
              </Typography>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: winnerColor }}>
                {winnerLabel} wins
              </Typography>
            </Box>
          )}

          {/* ThreeWay Selector */}
          <ThreeWaySelector
            side={side}
            onSideChange={isResolved ? () => {} : setSide}
            totalUp={totalUp}
            totalDown={totalDown}
            totalDraw={totalDraw}
            homeTeam={isPrediction ? (pool.awayTeam ? pool.homeTeam || undefined : 'Yes') : (homeShort || undefined)}
            awayTeam={isPrediction ? (pool.awayTeam || 'No') : (awayShort || undefined)}
            disabled={isResolved || pool.status !== 'JOINING'}
            numSides={pool.numSides}
          />

          {/* Claim button for winners */}
          {isResolved && (() => {
            const claimableBet = (claimableData?.data?.bets || []).find((b: { pool: { id: string } }) => b.pool.id === pool.id);
            if (!claimableBet) return null;
            return (
              <Button
                fullWidth
                variant="contained"
                disabled={claimState.status === 'confirming'}
                onClick={async () => {
                  setShowTxModal(true);
                  try { await claim(pool.id, claimableBet.id); } catch { /* handled in state */ }
                }}
                sx={{
                  bgcolor: t.gain,
                  color: t.text.contrast,
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  py: 1.25,
                  borderRadius: '5px',
                  textTransform: 'none',
                  '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
                }}
              >
                {claimState.status === 'confirming' ? 'Claiming...' : 'Claim Winnings'}
              </Button>
            );
          })()}

          {/* Bet form - only when pool is open and accepting bets */}
          {!isResolved && !isLocked && !matchLive && !matchFinished && !awaitingResolution && (
            <>
              {/* Presets */}
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {PRESETS.map(p => (
                  <Button
                    key={p}
                    size="small"
                    onClick={() => setAmount(String(p))}
                    sx={{
                      flex: 1,
                      minWidth: 0,
                      py: 0.5,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      bgcolor: amountNum === p ? t.hover.emphasis : t.border.subtle,
                      color: amountNum === p ? t.text.primary : t.text.secondary,
                      textTransform: 'none',
                      borderRadius: '5px',
                      '&:hover': { bgcolor: t.hover.strong },
                    }}
                  >
                    ${p}
                  </Button>
                ))}
              </Box>

              {/* Input */}
              <TextField
                fullWidth
                size="small"
                placeholder="Amount (USDC)"
                type="number"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                inputProps={{ min: 1, step: 'any' }}
                sx={{
                  '& .MuiInputBase-root': { bgcolor: t.border.subtle, borderRadius: '5px' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  '& .MuiInputBase-input': {
                    color: t.text.primary,
                    fontSize: '0.9rem',
                    outline: 'none',
                    MozAppearance: 'textfield',
                    '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.strong }}>
                Balance: ${balanceNum.toFixed(2)} USDC
              </Typography>

              {/* Payout preview */}
              {side && amountNum > 0 && (
                <Box sx={{ py: 1.5, bgcolor: t.hover.light, borderRadius: '5px', px: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Estimated payout</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.gain }}>
                      ${estimatedPayout.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>Multiplier</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
                      {amountNum > 0 ? (estimatedPayout / amountNum).toFixed(2) : '0.00'}x
                    </Typography>
                  </Box>
                </Box>
              )}

              {/* Submit */}
              <Button
                fullWidth
                variant="contained"
                disabled={!canSubmit}
                onClick={handleSubmit}
                sx={{
                  bgcolor: t.up,
                  color: t.text.contrast,
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  py: 1,
                  borderRadius: '5px',
                  textTransform: 'none',
                  '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
                  '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
                }}
              >
                {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
              </Button>
            </>
          )}

          {/* Predictions closed message */}
          {!isResolved && (isLocked || matchLive || matchFinished || awaitingResolution) && (
            <Box sx={{ textAlign: 'center', py: 2, bgcolor: t.hover.subtle, borderRadius: '5px' }}>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.muted }}>
                {matchFinished || awaitingResolution ? 'Match Ended - Resolving' : matchLive ? 'Match In Progress - Predictions Closed' : 'Predictions Closed'}
              </Typography>
            </Box>
          )}
          </Box>
          )}
        </Box>
      </Box>

      <TransactionModal
        open={showTxModal}
        status={claimState.status !== 'idle' ? claimState.status : depositState.status}
        title={claimState.status !== 'idle' ? 'Claiming Winnings' : 'Placing Prediction'}
        txSignature={claimState.txSignature || depositState.txSignature}
        error={claimState.error || depositState.error}
        onClose={() => { setShowTxModal(false); resetDeposit(); resetClaim(); }}
        onRetry={() => { resetDeposit(); resetClaim(); setShowTxModal(false); }}
      />
    </AppShell>
  );
}
