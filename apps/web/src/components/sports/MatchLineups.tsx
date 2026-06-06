'use client';

import { Box, Typography, Avatar } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { fetchLineup, type SideLineup, type LineupPlayer, type EventLineup } from '@/lib/api';

function PlayerRow({ p, t }: { p: LineupPlayer; t: ReturnType<typeof useThemeTokens> }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
      <Avatar
        src={p.cutout ?? undefined}
        sx={{ width: 26, height: 26, flexShrink: 0, bgcolor: t.bg.surfaceAlt, fontSize: '0.7rem', fontWeight: 700, color: t.text.secondary }}
      >
        {p.number || p.name.charAt(0)}
      </Avatar>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {p.name}
        </Typography>
        {p.position && (
          <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.position}
          </Typography>
        )}
      </Box>
      {p.number && (
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.quaternary, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {p.number}
        </Typography>
      )}
    </Box>
  );
}

function Side({ side, t }: { side: SideLineup | null; t: ReturnType<typeof useThemeTokens> }) {
  if (!side) return <Box />;
  return (
    <Box sx={{ minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, mb: 1 }}>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {side.team ?? 'Team'}
        </Typography>
        {side.formation && (
          <Box component="span" sx={{ flexShrink: 0, px: 0.8, py: 0.2, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color: t.draw, bgcolor: withAlpha(t.draw, 0.14), fontVariantNumeric: 'tabular-nums' }}>
            {side.formation}
          </Box>
        )}
      </Box>
      {side.starters.map((p, i) => <PlayerRow key={p.id ?? `s${i}`} p={p} t={t} />)}
      {side.subs.length > 0 && (
        <>
          <Typography sx={{ fontSize: '0.66rem', fontWeight: 800, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, mt: 1.5, mb: 0.5 }}>
            Substitutes
          </Typography>
          <Box sx={{ opacity: 0.75 }}>
            {side.subs.map((p, i) => <PlayerRow key={p.id ?? `b${i}`} p={p} t={t} />)}
          </Box>
        </>
      )}
    </Box>
  );
}

/** Bare two-column Home/Away lineup grid (no card wrapper) — used inside the
 *  MatchInsights tab. */
export function LineupGrid({ lineup }: { lineup: EventLineup }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: { xs: 3, sm: 4 }, px: { xs: 0.5, md: 1 }, py: 1 }}>
      <Side side={lineup.home} t={t} />
      <Side side={lineup.away} t={t} />
    </Box>
  );
}

/** Standalone lineups card (self-fetching). Kept for non-tabbed surfaces;
 *  the /match page renders the Lineups tab via MatchInsights instead. */
export function MatchLineups({ matchId }: { matchId: string | null | undefined }) {
  const t = useThemeTokens();
  const { data } = useQuery({
    queryKey: ['lineup', matchId],
    queryFn: () => fetchLineup(matchId!),
    enabled: !!matchId,
    staleTime: 5 * 60_000,
  });
  const lineup = data?.data;
  if (!lineup?.hasData) return null;

  return (
    <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 2, p: { xs: 2, md: 2.5 }, mt: 3 }}>
      <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.text.primary, mb: 2 }}>Lineups</Typography>
      <LineupGrid lineup={lineup} />
    </Box>
  );
}
