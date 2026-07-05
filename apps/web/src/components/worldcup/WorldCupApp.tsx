'use client';

import { useState, useEffect, useMemo } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { Tune, FiberManualRecord } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePrivy } from '@privy-io/react-auth';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WORLD_CUP, WORLD_CUP_PROMO, WC_NEON_GREEN } from '@/lib/worldcup';
import {
  fetchWorldCupMatches, fetchMyWorldCupPredictions, saveWorldCupPrediction,
  type WorldCupMatch, type WorldCupPredictionDto, type WorldCupPhase, type WorldCupIdentity,
} from '@/lib/api';
import { MatchRow } from './MatchRow';
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

function CountdownUnit({ value, label }: { value: number; label: string }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ textAlign: 'center', minWidth: 46 }}>
      <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {String(value).padStart(2, '0')}
      </Typography>
      <Typography sx={{ fontSize: '0.6rem', fontWeight: 700, color: t.text.quaternary, letterSpacing: '0.08em' }}>{label}</Typography>
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
      <Box sx={{ display: 'flex', gap: 1.5 }}>
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
  const { authenticated, user, getAccessToken, login } = usePrivy();
  const [filter, setFilter] = useState<Filter>('All matches');

  const { data: matches, isLoading } = useQuery({
    queryKey: ['worldcup-matches'], queryFn: fetchWorldCupMatches, refetchInterval: 30_000, select: (r) => r.data ?? [],
  });
  const { data: myPredictions } = useQuery({
    queryKey: ['worldcup-my-predictions'], enabled: authenticated,
    queryFn: async () => { const token = await getAccessToken(); if (!token) return [] as WorldCupPredictionDto[]; return (await fetchMyWorldCupPredictions(token)).data ?? []; },
  });
  const predByMatch = useMemo(() => new Map((myPredictions ?? []).map((p) => [p.matchId, p])), [myPredictions]);

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
  const nextMatch = list.find((m) => m.status === 'SCHEDULED') ?? null;
  const nextKickoff = nextMatch?.kickoff ?? null;
  const nextLabel = nextMatch ? `${nextMatch.homeTeam} v ${nextMatch.awayTeam}` : null;

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

  const rowProps = (m: WorldCupMatch) => ({
    m,
    prediction: predByMatch.get(m.matchId),
    authed: authenticated,
    saving: saveMut.isPending && saveMut.variables?.matchId === m.matchId,
    onSave: (id: string, home: number, away: number, phase: WorldCupPhase) => saveMut.mutate({ matchId: id, home, away, phase }),
    onLogin: login,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, gap: 3, alignItems: 'flex-start' }}>
      {/* Main */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        {/* Hero */}
        <Box sx={{
          position: 'relative', overflow: 'hidden', borderRadius: 2.5, p: { xs: 2.5, md: 3 },
          bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`,
          backgroundImage: `linear-gradient(100deg, ${t.bg.surface} 45%, ${withAlpha(t.bg.surface, 0.4)} 70%), url(${WORLD_CUP.fanart})`,
          backgroundSize: 'cover', backgroundPosition: 'right center',
        }}>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 2, md: 3 } }}>
            <Box component="img" src={WORLD_CUP.badge} alt={WORLD_CUP.name} sx={{ height: { xs: 66, md: 92 }, width: 'auto', flexShrink: 0 }} />
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontSize: { xs: '1.5rem', md: '2rem' }, fontWeight: 900, letterSpacing: '-0.02em', color: t.text.primary, lineHeight: 1.1 }}>
                World Cup Predictions
              </Typography>
              <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.92rem' }, color: t.text.secondary, mt: 0.5 }}>
                Call the score before kickoff. No money, just bragging rights and a prize.
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 3, md: 6 }, mt: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.08em' }}>PRIZE POOL</Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                    <Typography sx={{ fontSize: { xs: '1.8rem', md: '2.4rem' }, fontWeight: 900, color: t.gold, lineHeight: 1 }}>$100</Typography>
                    <Typography sx={{ fontSize: '0.72rem', color: t.text.secondary, lineHeight: 1.2 }}>to 2 winners<br />per correct score</Typography>
                  </Box>
                </Box>
                <Countdown targetIso={nextKickoff} matchLabel={nextLabel} />
              </Box>
            </Box>
          </Box>
        </Box>

        {/* Toolbar */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {FILTERS.map((f) => {
              const active = filter === f;
              return (
                <Box key={f} onClick={() => setFilter(f)} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: 1.5, py: 0.7, borderRadius: '999px', cursor: 'pointer', bgcolor: active ? withAlpha('#ffffff', 0.12) : 'transparent', '&:hover': { bgcolor: active ? withAlpha('#ffffff', 0.12) : t.hover.light } }}>
                  {f === 'Live' && <FiberManualRecord sx={{ fontSize: 9, color: WC_NEON_GREEN }} />}
                  <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500, color: active ? t.text.primary : t.text.tertiary }}>{f}</Typography>
                </Box>
              );
            })}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5, px: 1.5, py: 0.7, borderRadius: '6px', bgcolor: t.hover.light }}>
              <Typography sx={{ fontSize: '0.78rem', color: t.text.tertiary }}>Group by: <Box component="span" sx={{ color: t.text.primary, fontWeight: 600 }}>Round</Box></Typography>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '6px', bgcolor: t.hover.light, cursor: 'pointer' }}><Tune sx={{ fontSize: 18, color: t.text.tertiary }} /></Box>
          </Box>
        </Box>

        {/* Rows */}
        {isLoading ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} variant="rounded" height={78} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />)}
          </Box>
        ) : filtered.length === 0 ? (
          <Typography sx={{ fontSize: '0.9rem', color: t.text.tertiary, textAlign: 'center', py: 5 }}>No matches in this view.</Typography>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {filtered.map((m) => <MatchRow key={m.matchId} {...rowProps(m)} />)}
          </Box>
        )}
      </Box>

      {/* Sidebar */}
      <Box sx={{ width: { xs: '100%', lg: 360 }, flexShrink: 0, position: { lg: 'sticky' }, top: { lg: 84 } }}>
        {!isLoading && list.length > 0 && <MyPicksSidebar matches={list} predByMatch={predByMatch} />}
      </Box>
    </Box>
  );
}
