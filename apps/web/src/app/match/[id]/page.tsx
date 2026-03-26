'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, Chip, Button, TextField, CircularProgress } from '@mui/material';
import { ArrowBack, Gavel, Public, TheaterComedy, AccountBalance, TrendingUp } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { usePool } from '@/hooks/usePools';
import { useDeposit } from '@/hooks/useTransactions';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { AppShell, TransactionModal } from '@/components';
import { ThreeWaySelector } from '@/components/sports/ThreeWaySelector';
import { MatchAnalysis } from '@/components/sports/MatchAnalysis';
import { OddsChart } from '@/components/pool/OddsChart';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR, GAIN_COLOR } from '@/lib/constants';
import { formatUSDC, USDC_DIVISOR, statusStyles } from '@/lib/format';

const PRESETS = [10, 50, 100, 500];

const PM_LABELS: Record<string, string> = {
  PM_POLITICS: 'Politics', PM_GEO: 'Geopolitics', PM_CULTURE: 'Culture & Entertainment', PM_FINANCE: 'Finance & Economy',
};
const PM_COLORS: Record<string, string> = {
  PM_POLITICS: '#A78BFA', PM_GEO: '#60A5FA', PM_CULTURE: '#F472B6', PM_FINANCE: '#34D399',
};
const PM_ICONS: Record<string, React.ReactNode> = {
  PM_POLITICS: <Gavel sx={{ fontSize: 20 }} />, PM_GEO: <Public sx={{ fontSize: 20 }} />,
  PM_CULTURE: <TheaterComedy sx={{ fontSize: 20 }} />, PM_FINANCE: <AccountBalance sx={{ fontSize: 20 }} />,
};

function leagueName(code: string): string {
  if (PM_LABELS[code]) return PM_LABELS[code];
  switch (code) {
    case 'CL': return 'Champions League';
    case 'PL': return 'Premier League';
    case 'PD': return 'La Liga';
    case 'SA': return 'Serie A';
    case 'BL1': return 'Bundesliga';
    case 'FL1': return 'Ligue 1';
    case 'BSA': return 'Brasileirão';
    default: return code;
  }
}

interface PoolBet {
  wallet: string;
  side: string;
  amount: string;
  createdAt: string;
}

function MarketInfo({ description }: { description: string }) {
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
        {(['rules', 'context'] as const).map(t => (
          <Box
            key={t}
            onClick={() => setTab(t)}
            sx={{
              px: 1.5, py: 0.5, borderRadius: '4px', cursor: 'pointer',
              fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
              bgcolor: tab === t ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.05)' },
            }}
          >
            {t === 'rules' ? 'Rules' : 'Market Context'}
          </Box>
        ))}
      </Box>

      {/* Content */}
      {tab === 'rules' && (
        <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.2, whiteSpace: 'pre-wrap' }}>
          {rulesText}
        </Typography>
      )}
      {tab === 'context' && (
        <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.8)', lineHeight: 1.2, whiteSpace: 'pre-wrap' }}>
          {contextText || 'No additional context available for this market.'}
        </Typography>
      )}
    </Box>
  );
}

export default function MatchDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { data: poolData, isLoading } = usePool(id);
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { deposit, state: depositState, reset: resetDeposit } = useDeposit();

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

  if (isLoading) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: UP_COLOR }} />
        </Box>
      </AppShell>
    );
  }

  if (!pool) {
    return (
      <AppShell>
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography sx={{ fontSize: '1.1rem', fontWeight: 600, color: '#fff', mb: 1 }}>
            Match not found
          </Typography>
          <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.45)', mb: 3 }}>
            This market may have ended or is no longer available.
          </Typography>
          <Link href="/?type=SPORTS" style={{ textDecoration: 'none' }}>
            <Box
              component="span"
              sx={{
                display: 'inline-block',
                px: 4,
                py: 1,
                bgcolor: 'rgba(255,255,255,0.06)',
                color: '#fff',
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
  const catColor = PM_COLORS[league] || '#A78BFA';
  const statusStyle = statusStyles[pool.status] || statusStyles.UPCOMING;
  const homeShort = isPrediction ? '' : (pool.homeTeam || 'Home').slice(0, 3).toUpperCase();
  const awayShort = isPrediction ? '' : (pool.awayTeam || 'Away').slice(0, 3).toUpperCase();
  const isResolved = pool.status === 'CLAIMABLE' || pool.status === 'RESOLVED';
  const winnerLabel = isResolved ? (pool.winner === 'UP' ? (isPrediction && !pool.awayTeam ? 'Yes' : pool.homeTeam) : pool.winner === 'DOWN' ? (isPrediction && !pool.awayTeam ? 'No' : pool.awayTeam) : pool.winner === 'DRAW' ? 'Draw' : null) : null;
  const winnerColor = pool.winner === 'UP' ? UP_COLOR : pool.winner === 'DOWN' ? DOWN_COLOR : DRAW_COLOR;

  const kickoff = new Date(pool.startTime).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });

  return (
    <AppShell>
      {/* ── Header bar ── */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Link href={isPrediction ? '/?type=PREDICTIONS' : '/?type=SPORTS'} style={{ textDecoration: 'none', color: 'inherit', display: 'flex' }}>
              <ArrowBack sx={{ fontSize: 18, color: 'rgba(255,255,255,0.4)', '&:hover': { color: '#fff' }, cursor: 'pointer' }} />
            </Link>
            {isPrediction ? (
              <Box sx={{ color: catColor, display: 'flex', alignItems: 'center' }}>
                {PM_ICONS[league] || <TrendingUp sx={{ fontSize: 20 }} />}
              </Box>
            ) : league ? (
              <Box
                component="img"
                src={`https://crests.football-data.org/${league}.png`}
                alt={league}
                sx={{ width: 22, height: 22, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }}
              />
            ) : null}
            <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.9rem', md: '1rem' }, color: isPrediction ? catColor : '#fff' }}>
              {leagueName(league)}
            </Typography>
            {!isPrediction && (
              <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                {homeShort} vs {awayShort}
              </Typography>
            )}
          </Box>
          <Chip
            label={pool.status === 'JOINING' ? 'OPEN' : pool.status === 'ACTIVE' ? 'LIVE' : pool.status}
            size="small"
            sx={{
              ...statusStyle,
              fontWeight: 700,
              fontSize: { xs: '0.6rem', md: '0.7rem' },
              letterSpacing: '0.08em',
              px: 1,
              borderRadius: '5px',
              height: { xs: 22, md: 24 },
            }}
          />
        </Box>
      </Box>

      {/* ── Stats strip ── */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1, md: 1.25 }, display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
          {[
            { icon: '/assets/players-icon-500.png', value: betCount, label: 'PREDICTIONS', color: '#fff' },
            { icon: '/assets/pool-icon-500.png', value: formatUSDC(totalPoolStr), label: 'POOL', color: GAIN_COLOR },
            { icon: null, value: kickoff, label: isPrediction ? 'RESOLVES' : 'KICKOFF', color: 'rgba(255,255,255,0.7)' },
          ].map((s, i) => (
            <Box key={s.label} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', pl: i > 0 ? { xs: 1.5, md: 2.5 } : 0 }}>
              {s.icon && <Box component="img" src={s.icon} alt="" sx={{ width: { xs: 14, md: 20 }, height: { xs: 14, md: 20 } }} />}
              <Box>
                <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>
                  {s.value}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.6rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.3)', lineHeight: 1 }}>
                  {s.label}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      {/* ── Winner banner ── */}
      {isResolved && winnerLabel && (
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2, textAlign: 'center' }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', mb: 0.5 }}>
            {isPrediction ? 'Resolved' : 'Full Time'}
          </Typography>
          {!isPrediction && pool.homeScore != null && pool.awayScore != null && (
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', mb: 0.5 }}>
              {pool.homeTeam} {pool.homeScore} - {pool.awayScore} {pool.awayTeam}
            </Typography>
          )}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: winnerColor }}>
            {winnerLabel} wins
          </Typography>
        </Box>
      )}

      {/* ── Two-column grid (desktop) ── */}
      <Box sx={{
        display: { xs: 'flex', md: 'grid' },
        flexDirection: 'column',
        gridTemplateColumns: { md: '1fr 340px' },
        gap: { xs: 8, md: 4 },
        px: { xs: 2, md: 3 },
        pt: { xs: 3, md: 3 },
        pb: { xs: 4, md: 4 },
        alignItems: 'start',
      }}>
        {/* ── Left column: Chart + H2H Analysis + Activity ── */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%', minHeight: { md: 400 } }}>
          {/* Odds chart with Polymarket / UpDown toggle */}
          {isPrediction && (
            <OddsChart poolId={pool.id} question={pool.homeTeam} currentOdds={pool.marketOdds} totalUp={pool.totalUp} totalDown={pool.totalDown} />
          )}

          {/* Market Rules / Context tabs (Polymarket) */}
          {isPrediction && pool.matchAnalysis && (
            <MarketInfo description={pool.matchAnalysis} />
          )}

          {/* Head to Head Analysis (football only) */}
          {!isPrediction && pool.matchAnalysis && (
            <MatchAnalysis
              matchAnalysis={pool.matchAnalysis}
              homeTeam={pool.homeTeam || 'Home'}
              awayTeam={pool.awayTeam || 'Away'}
            />
          )}

          {/* Activity log */}
          <Box>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
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
                <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)', py: 2, textAlign: 'center' }}>
                  No predictions yet
                </Typography>
              )}
              <AnimatePresence>
                {bets.map((b) => {
                  const key = `${b.wallet}-${b.createdAt}`;
                  const isNew = newBetKeys.has(key);
                  const sideColor = b.side === 'UP' ? UP_COLOR : b.side === 'DOWN' ? DOWN_COLOR : DRAW_COLOR;
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
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.45)', width: 75, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {b.wallet}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: sideColor, width: 55, flexShrink: 0 }}>
                          {sideLabel}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: '#fff', flex: 1, textAlign: 'right' }}>
                          ${amt}
                        </Typography>
                        <Typography sx={{ fontSize: 'inherit', fontWeight: 'inherit', color: 'rgba(255,255,255,0.25)', width: 25, textAlign: 'right', flexShrink: 0 }}>
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

        {/* ── Right column: Selector + Bet form ── */}
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          width: '100%',
          bgcolor: { md: 'rgba(255,255,255,0.02)' },
          borderRadius: '5px',
          p: { md: 2 },
          mt: { xs: 2, md: 0 },
        }}>
          {/* Teams / Question */}
          {isPrediction ? (
            <Box sx={{ py: 2, px: 1, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
                {pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam}
              </Typography>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, py: 1.5 }}>
              <Box sx={{ textAlign: 'center' }}>
                {pool.homeTeamCrest && (
                  <Box component="img" src={pool.homeTeamCrest} alt="" sx={{ width: 36, height: 36, objectFit: 'contain', mb: 0.5 }} />
                )}
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: isResolved && pool.winner === 'UP' ? UP_COLOR : '#fff' }}>{pool.homeTeam || 'Home'}</Typography>
              </Box>
              {isResolved && pool.homeScore != null && pool.awayScore != null ? (
                <Typography sx={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
                  {pool.homeScore} - {pool.awayScore}
                </Typography>
              ) : (
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>vs</Typography>
              )}
              <Box sx={{ textAlign: 'center' }}>
                {pool.awayTeamCrest && (
                  <Box component="img" src={pool.awayTeamCrest} alt="" sx={{ width: 36, height: 36, objectFit: 'contain', mb: 0.5 }} />
                )}
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: isResolved && pool.winner === 'DOWN' ? DOWN_COLOR : '#fff' }}>{pool.awayTeam || 'Away'}</Typography>
              </Box>
            </Box>
          )}

          {/* Winner badge in right column */}
          {isResolved && winnerLabel && (
            <Box sx={{ textAlign: 'center', py: 1 }}>
              <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 0.25 }}>
                Result
              </Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: winnerColor }}>
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
            homeTeam={isPrediction ? (pool.awayTeam ? pool.homeTeam || undefined : 'Yes') : (pool.homeTeam || undefined)}
            awayTeam={isPrediction ? (pool.awayTeam || 'No') : (pool.awayTeam || undefined)}
            disabled={isResolved || pool.status !== 'JOINING'}
            numSides={pool.numSides}
          />

          {/* Bet form - only when pool is open */}
          {!isResolved && (
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
                      bgcolor: amountNum === p ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                      color: amountNum === p ? '#fff' : 'rgba(255,255,255,0.5)',
                      textTransform: 'none',
                      borderRadius: '5px',
                      '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
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
                  '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '5px' },
                  '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
                  '& .MuiInputBase-input': {
                    color: '#fff',
                    fontSize: '0.9rem',
                    outline: 'none',
                    MozAppearance: 'textfield',
                    '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': { WebkitAppearance: 'none', margin: 0 },
                  },
                }}
              />
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>
                Balance: ${balanceNum.toFixed(2)} USDC
              </Typography>

              {/* Payout preview */}
              {side && amountNum > 0 && (
                <Box sx={{ py: 1.5, bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '5px', px: 1.5 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Estimated payout</Typography>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: GAIN_COLOR }}>
                      ${estimatedPayout.toFixed(2)}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Multiplier</Typography>
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
                  bgcolor: UP_COLOR,
                  color: '#000',
                  fontWeight: 700,
                  fontSize: '0.8rem',
                  py: 1,
                  borderRadius: '5px',
                  textTransform: 'none',
                  '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                  '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                }}
              >
                {!connected ? 'Connect Wallet' : !side ? 'Select Side' : amountNum <= 0 ? 'Enter Amount' : 'Place Prediction'}
              </Button>
            </>
          )}
        </Box>
      </Box>

      <TransactionModal
        open={showTxModal}
        status={depositState.status}
        title="Placing Prediction"
        txSignature={depositState.txSignature}
        error={depositState.error}
        onClose={handleCloseTxModal}
        onRetry={() => { resetDeposit(); setShowTxModal(false); }}
      />
    </AppShell>
  );
}
