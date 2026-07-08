'use client';

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { FiberManualRecord } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WORLD_CUP, WORLD_CUP_PROMO, WC_NEON_GREEN } from '@/lib/worldcup';
import {
  fetchWorldCupMatches, fetchMyWorldCupPredictions, saveWorldCupPrediction,
  type WorldCupMatch, type WorldCupPredictionDto, type WorldCupPhase, type WorldCupIdentity,
} from '@/lib/api';
import { MatchRow, roundDisplay } from './MatchRow';
import { MyPicksSidebar } from './MyPicksSidebar';

function buildIdentity(user: ReturnType<typeof usePrivy>['user']): WorldCupIdentity {
  if (!user) return {};
  const twitter = user.twitter?.username;
  return {
    provider: twitter ? 'twitter' : user.google?.email ? 'google' : user.email?.address ? 'email' : undefined,
    xHandle: twitter ?? undefined,
    email: user.google?.email ?? user.email?.address ?? undefined,
    displayName: user.twitter?.name ?? twitter ?? undefined,
  };
}

const FILTERS = ['All matches', 'Today', 'Live', 'Upcoming', 'Completed', 'My picks'] as const;
type Filter = typeof FILTERS[number];

// Hero carousel: slide 0 is the World Cup game; the rest explain what UpDown is (placeholder copy).
const HERO_LOGO = '/updown-logos/Logo_512px_White.png';
const HERO_TEASERS = [
  { title: 'This is just the start', body: 'UpDown is being built. Your home to predict real world events and trade live markets. The parimutuel prediction market where knowledge pays.', tag: 'Under development' },
  { title: 'Predict. Trade. Win.', body: 'Sports, crypto and prediction markets, all in one place. Sign in now and you are on the list for launch.', tag: 'Towards mainnet' },
] as const;
const HERO_SLIDE_COUNT = 1 + HERO_TEASERS.length;

// Group matches by round for the round-header layout. Higher rank = further in the tournament;
// we sort descending so the newest (most advanced) round shows on top and Round of 32 sits last.
const ROUND_ORDER: Record<string, number> = {
  'Round of 32': 30, 'Round of 16': 40, 'Quarter-final': 50, 'Semi-final': 60, 'Third place': 65, 'Final': 70,
};
function roundRank(r: string | null): number {
  if (!r) return 0;
  if (ROUND_ORDER[r] != null) return ROUND_ORDER[r];
  const md = r.match(/Matchday (\d+)/);
  if (md) return Number(md[1]); // group-stage matchdays sit below the knockouts
  return 0;
}
function groupByRound(matches: WorldCupMatch[]): { round: string; matches: WorldCupMatch[] }[] {
  const by = new Map<string, WorldCupMatch[]>();
  for (const m of matches) {
    const key = m.round ?? 'Other';
    const arr = by.get(key);
    if (arr) arr.push(m);
    else by.set(key, [m]);
  }
  return [...by.entries()].map(([round, ms]) => ({ round, matches: ms })).sort((a, b) => roundRank(b.round) - roundRank(a.round));
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ textAlign: 'center', minWidth: { xs: 38, md: 46 } }}>
      <Typography sx={{ fontSize: { xs: '1.25rem', md: '1.5rem' }, fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </Typography>
      <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: t.text.quaternary, letterSpacing: '0.06em' }}>{label}</Typography>
    </Box>
  );
}

function Countdown({ targetIso, matchLabel }: { targetIso: string | null; matchLabel: string | null }) {
  const t = useThemeTokens();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  if (!targetIso) return null;
  const ms = Math.max(0, new Date(targetIso).getTime() - now);
  const s = Math.floor(ms / 1000);
  const days = Math.floor(s / 86400);
  const hrs = Math.floor((s % 86400) / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return (
    <Box>
      {matchLabel && (
        <Typography sx={{ fontSize: { xs: '1rem', md: '1.15rem' }, fontWeight: 800, color: t.text.primary, mb: 0.75, lineHeight: 1.2 }}>
          {matchLabel}
        </Typography>
      )}
      <Box sx={{ display: 'flex', gap: { xs: 0.75, md: 1.5 } }}>
        <CountdownUnit value={days} label="DAYS" />
        <CountdownUnit value={hrs} label="HRS" />
        <CountdownUnit value={min} label="MIN" />
        <CountdownUnit value={sec} label="SEC" />
      </Box>
    </Box>
  );
}

export function WorldCupApp() {
  const t = useThemeTokens();
  const queryClient = useQueryClient();
  const { ready, authenticated, user, getAccessToken, login } = usePrivy();
  const [filter, setFilter] = useState<Filter>('All matches');
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setSlide((s) => (s + 1) % HERO_SLIDE_COUNT), 10_000);
    return () => clearTimeout(id);
  }, [slide]);

  const { data: matches, isLoading: matchesLoading } = useQuery({
    queryKey: ['worldcup-matches'], queryFn: fetchWorldCupMatches, refetchInterval: 30_000, select: (r) => r.data ?? [],
  });
  const { data: myPredictions, isLoading: predsLoading } = useQuery({
    queryKey: ['worldcup-my-predictions'], enabled: authenticated,
    queryFn: async () => { const token = await getAccessToken(); if (!token) return [] as WorldCupPredictionDto[]; return (await fetchMyWorldCupPredictions(token)).data ?? []; },
  });
  const predByMatch = useMemo(() => new Map((myPredictions ?? []).map((p) => [p.matchId, p])), [myPredictions]);
  // Keep the row skeletons up until we know the user's picks too (and Privy is ready), so rows
  // don't render in a default state and then visibly flip to "Pick saved"/selected scores.
  const isLoading = !ready || matchesLoading || predsLoading;

  const saveMut = useMutation({
    mutationFn: async (v: { matchId: string; home: number; away: number; phase: WorldCupPhase }) => {
      const token = await getAccessToken();
      if (!token) throw new Error('Please sign in again');
      const res = await saveWorldCupPrediction(token, { matchId: v.matchId, homeScore: v.home, awayScore: v.away, phase: v.phase, identity: buildIdentity(user) });
      if (!res.success) throw new Error(res.error?.message ?? 'Could not save');
      return res.data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['worldcup-my-predictions'] }),
  });

  const list = matches ?? [];
  // Countdown to the next match whose kickoff is still in the future — skip any SCHEDULED match
  // whose (possibly early) SDB kickoff time has already passed, so the timer never sits at zero.
  const nowMs = Date.now();
  const nextMatch =
    list.find((m) => m.status === 'SCHEDULED' && m.kickoff != null && Date.parse(m.kickoff) > nowMs) ?? null;
  const nextKickoff = nextMatch?.kickoff ?? null;
  const nextLabel = nextMatch ? `${nextMatch.homeTeam} vs ${nextMatch.awayTeam}` : null;

  const isToday = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso); const n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  };
  const filtered = list.filter((m) => {
    switch (filter) {
      case 'Today': return isToday(m.kickoff);
      case 'Live': return m.status === 'LIVE';
      case 'Upcoming': return m.status === 'SCHEDULED';
      case 'Completed': return m.status === 'FINISHED';
      case 'My picks': return predByMatch.has(m.matchId);
      default: return true;
    }
  });
  const groups = groupByRound(filtered);

  const rowProps = (m: WorldCupMatch) => ({
    m,
    prediction: predByMatch.get(m.matchId),
    authed: authenticated,
    saving: saveMut.isPending && saveMut.variables?.matchId === m.matchId,
    onSave: (id: string, home: number, away: number, phase: WorldCupPhase) => saveMut.mutate({ matchId: id, home, away, phase }),
    onLogin: login,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3, alignItems: { xs: 'stretch', lg: 'flex-start' } }}>
      {/* Main */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Hero slider */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', borderRadius: 2.5,
          bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`,
          backgroundImage: `linear-gradient(100deg, ${t.bg.surface} 38%, ${withAlpha(t.bg.surface, 0.85)} 72%, ${withAlpha(t.bg.surface, 0.55)} 100%), url(${WORLD_CUP.fanart})`,
          backgroundSize: 'cover', backgroundPosition: 'right center',
        }}>
          <Box sx={{ display: 'flex', transform: `translateX(-${slide * 100}%)`, transition: 'transform 0.5s ease' }}>
            {/* Slide 0 — World Cup game */}
            <Box sx={{ flex: '0 0 100%', minWidth: 0, p: { xs: 2.5, md: 3 }, pb: { xs: 4, md: 4 } }}>
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start', gap: { xs: 1.75, md: 3 }, minHeight: { md: 148 } }}>
                <Box component="img" src={WORLD_CUP.badge} alt={WORLD_CUP.name} sx={{ height: { xs: 54, md: 92 }, width: 'auto', flexShrink: 0 }} />
                <Box sx={{ minWidth: 0, width: '100%' }}>
                  <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 900, letterSpacing: '-0.02em', color: t.text.primary, lineHeight: 1.15 }}>
                    World Cup Predictions
                  </Typography>
                  <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.92rem' }, color: t.text.primary, mt: 1, lineHeight: 1.5 }}>
                    Call the score before kickoff. No money, just bragging rights and a prize.
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 3, md: 6 }, mt: { xs: 2.75, md: 2 }, flexWrap: 'wrap' }}>
                    <Box>
                      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.08em' }}>PRIZE POOL</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography sx={{ fontSize: { xs: '1.55rem', md: '2.4rem' }, fontWeight: 900, color: t.gold, lineHeight: 1 }}>$100</Typography>
                        <Typography sx={{ fontSize: { xs: '0.68rem', md: '0.72rem' }, color: t.text.primary, lineHeight: 1.2 }}>to 2 winners<br />per correct score</Typography>
                      </Box>
                    </Box>
                    {isLoading ? <Skeleton variant="rounded" width={210} height={58} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} /> : <Countdown targetIso={nextKickoff} matchLabel={nextLabel} />}
                  </Box>
                </Box>
              </Box>
            </Box>

            {/* Teaser slides — what UpDown is / what's coming */}
            {HERO_TEASERS.map((s) => (
              <Box key={s.title} sx={{ flex: '0 0 100%', minWidth: 0, p: { xs: 2.5, md: 3 }, pb: { xs: 4, md: 4 } }}>
                <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start', gap: { xs: 1.75, md: 3 }, minHeight: { md: 148 } }}>
                  <Box component="img" src={HERO_LOGO} alt="UpDown" sx={{ height: { xs: 50, md: 84 }, width: 'auto', flexShrink: 0, opacity: 0.92 }} />
                  <Box sx={{ minWidth: 0, width: '100%', maxWidth: { md: 560 } }}>
                    <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 900, letterSpacing: '-0.02em', color: t.text.primary, lineHeight: 1.15 }}>{s.title}</Typography>
                    <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.95rem' }, color: t.text.primary, mt: 1, lineHeight: 1.5 }}>{s.body}</Typography>
                    <Box sx={{ display: 'inline-flex', mt: 2, px: 1.25, py: 0.5, borderRadius: '999px', bgcolor: withAlpha('#ffffff', 0.08), border: `1px solid ${t.border.subtle}` }}>
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.05em' }}>{s.tag}</Typography>
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>

          {/* Slide dots */}
          <Box sx={{ position: 'absolute', bottom: 12, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 0.75 }}>
            {Array.from({ length: HERO_SLIDE_COUNT }).map((_, i) => (
              <Box key={i} onClick={() => setSlide(i)} sx={{ width: i === slide ? 20 : 7, height: 7, borderRadius: '999px', cursor: 'pointer', transition: 'all 0.25s ease', bgcolor: i === slide ? t.text.primary : withAlpha('#ffffff', 0.3), '&:hover': { bgcolor: i === slide ? t.text.primary : withAlpha('#ffffff', 0.5) } }} />
            ))}
          </Box>
        </Box>

        {/* Toolbar: filters scroll horizontally on mobile instead of wrapping */}
        <Box
          sx={{
            display: 'flex', gap: 0.5, width: '100%',
            flexWrap: { xs: 'nowrap', md: 'wrap' },
            overflowX: { xs: 'auto', md: 'visible' }, pb: { xs: 0.5, md: 0 },
            scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {FILTERS.map((f) => {
            const active = filter === f;
            return (
              <Box key={f} onClick={() => setFilter(f)} sx={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.7, borderRadius: '999px', cursor: 'pointer', bgcolor: active ? withAlpha('#ffffff', 0.12) : 'transparent', '&:hover': { bgcolor: active ? withAlpha('#ffffff', 0.12) : t.hover.light } }}>
                {f === 'Live' && <FiberManualRecord sx={{ fontSize: 9, color: WC_NEON_GREEN }} />}
                <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500, color: active ? t.text.primary : t.text.tertiary }}>{f}</Typography>
              </Box>
            );
          })}
        </Box>

        {/* Rows */}
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} variant="rounded" height={108} sx={{ borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.05)' }} />)}
          </Box>
        ) : filtered.length === 0 ? (
          <Typography sx={{ fontSize: '0.9rem', color: t.text.tertiary, textAlign: 'center', py: 5 }}>No matches in this view.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {groups.map((g) => (
              <Box key={g.round} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: '0.06em', px: 0.5 }}>
                  {roundDisplay(g.round)}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {g.matches.map((m) => <MatchRow key={m.matchId} {...rowProps(m)} />)}
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Sidebar */}
      <Box sx={{ width: { xs: '100%', lg: 360 }, flexShrink: 0, position: { lg: 'sticky' }, top: { lg: 84 } }}>
        {isLoading ? (
          <Skeleton variant="rounded" height={440} sx={{ borderRadius: 2, bgcolor: 'rgba(255,255,255,0.05)' }} />
        ) : list.length > 0 ? (
          <MyPicksSidebar matches={list} predByMatch={predByMatch} />
        ) : null}
      </Box>
    </Box>
  );
}
