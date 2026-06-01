'use client';

import { useMemo, useState } from 'react';
import {
  Box, Card, Typography, Chip, CircularProgress, Button, Tooltip,
  Table, TableBody, TableCell, TableHead, TableRow, Alert, ToggleButtonGroup, ToggleButton,
  TextField, InputAdornment,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';

type League = {
  code: string;
  label: string;
  type: 'FOOTBALL_LEAGUE' | 'SPORTSDB_SPORT';
  sport: string;
  enabled: boolean;
  comingSoon: boolean;
  externalLeagueId: string | null;
  sportQuery: string | null;
  leagueFilter: string | null;
  poolOpenDaysBefore: number | null;
  poolCount: number;
  cachedMatchCount: number;
};

type CachedMatch = {
  externalId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  kickoff: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  leagueName: string | null;
  matchday: number | null;
  pool: { id: string; status: string } | null;
};

const SPORT_COLORS: Record<string, string> = {
  FOOTBALL: t.up,
  NBA: '#FB923C',
  NHL: '#60A5FA',
  NFL: '#A78BFA',
  MMA: '#F87171',
  MLB: '#34D399',
  F1: '#EF4444',
  TENNIS: '#FBBF24',
  RUGBY: '#22D3EE',
  CRICKET: '#A3E635',
  ESPORTS: '#F472B6',
  BOXING: '#FCA5A5',
  GOLF: '#86EFAC',
};

function statusChip(status: string) {
  const s = (status || '').toUpperCase();
  if (s === 'FINISHED' || s === 'FT') return { label: 'FT', color: t.text.tertiary };
  if (s === 'LIVE') return { label: 'LIVE', color: t.gain };
  if (s === 'SCHEDULED' || s === 'NS') return { label: 'Scheduled', color: t.text.tertiary };
  if (s === 'POSTPONED' || s === 'CANCELLED') return { label: s, color: t.error };
  return { label: status, color: t.text.tertiary };
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const diff = d.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const direction = diff >= 0 ? 'in ' : '';
  const suffix = diff >= 0 ? '' : ' ago';
  if (days > 0) return `${direction}${days}d ${hours}h${suffix}`;
  if (hours > 0) return `${direction}${hours}h ${mins}m${suffix}`;
  return `${direction}${mins}m${suffix}`;
}

export function MatchExplorer() {
  const qc = useQueryClient();
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [direction, setDirection] = useState<'upcoming' | 'past'>('upcoming');
  const [filter, setFilter] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const leaguesQ = useQuery({
    queryKey: ['admin-sports-leagues'],
    queryFn: () => adminFetch<{ success: true; data: League[] }>('/sports/leagues').then(r => r.data),
  });

  const matchesQ = useQuery({
    queryKey: ['admin-sports-matches', selectedLeague, direction],
    queryFn: () => adminFetch<{ success: true; data: { matches: CachedMatch[] } }>(`/sports/matches?league=${selectedLeague}&direction=${direction}&limit=100`).then(r => r.data.matches),
    enabled: !!selectedLeague,
  });

  const refreshMutation = useMutation({
    mutationFn: () => adminPost<{ success: true; data: { fetched: number; upserted: number } }>('/sports/refresh-league', { league: selectedLeague }),
    onSuccess: (r) => {
      setFeedback({ type: 'success', message: `Refreshed ${selectedLeague}: ${r.data.fetched} fetched, ${r.data.upserted} upserted.` });
      qc.invalidateQueries({ queryKey: ['admin-sports-leagues'] });
      qc.invalidateQueries({ queryKey: ['admin-sports-matches', selectedLeague] });
    },
    onError: (err: Error) => setFeedback({ type: 'error', message: err.message }),
  });

  const createMutation = useMutation({
    mutationFn: ({ matchId, league }: { matchId: string; league: string }) =>
      adminPost<{ success: true; data: { poolId: string } }>('/sports/create-pool', { matchId, league }),
    onSuccess: (r) => {
      setFeedback({ type: 'success', message: `Pool created: ${r.data.poolId.slice(0, 8)}…` });
      qc.invalidateQueries({ queryKey: ['admin-sports-leagues'] });
      qc.invalidateQueries({ queryKey: ['admin-sports-matches', selectedLeague] });
    },
    onError: (err: Error) => setFeedback({ type: 'error', message: err.message }),
  });

  const leagues = leaguesQ.data ?? [];
  const filteredLeagues = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leagues;
    return leagues.filter(l =>
      l.code.toLowerCase().includes(q) ||
      l.label.toLowerCase().includes(q) ||
      (l.externalLeagueId || '').includes(q),
    );
  }, [leagues, filter]);

  const selected = leagues.find(l => l.code === selectedLeague);
  const matches = matchesQ.data ?? [];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 2 }}>
      {/* Left rail — leagues */}
      <Card sx={{ p: 0, border: `1px solid ${t.border.medium}`, bgcolor: t.bg.surface, height: 'fit-content', position: { md: 'sticky' }, top: { md: 16 }, maxHeight: { md: 'calc(100vh - 32px)' }, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, mb: 1 }}>Leagues ({leagues.length})</Typography>
          <TextField
            size="small"
            fullWidth
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter by code, name, ID"
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 16, color: t.text.tertiary }} /></InputAdornment>,
            }}
            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.8rem' } }}
          />
        </Box>
        <Box sx={{ overflow: 'auto', flex: 1 }}>
          {leaguesQ.isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={20} /></Box>
          ) : filteredLeagues.length === 0 ? (
            <Typography sx={{ p: 2, fontSize: '0.78rem', color: t.text.tertiary }}>No leagues match.</Typography>
          ) : (
            filteredLeagues.map(l => (
              <Box
                key={l.code}
                onClick={() => setSelectedLeague(l.code)}
                sx={{
                  px: 1.5, py: 1.25,
                  cursor: 'pointer',
                  borderLeft: '3px solid',
                  borderLeftColor: selectedLeague === l.code ? (SPORT_COLORS[l.sport] || t.up) : 'transparent',
                  bgcolor: selectedLeague === l.code ? t.hover.medium : 'transparent',
                  borderBottom: `1px solid ${t.border.subtle}`,
                  '&:hover': { bgcolor: t.hover.subtle },
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25 }}>
                  <Chip
                    label={l.code}
                    size="small"
                    sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, bgcolor: withAlpha(SPORT_COLORS[l.sport] || t.up, 0.18), color: SPORT_COLORS[l.sport] || t.up }}
                  />
                  {l.comingSoon && <Chip label="soon" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: withAlpha(t.draw, 0.15), color: t.draw }} />}
                  {!l.enabled && <Chip label="off" size="small" sx={{ height: 16, fontSize: '0.55rem', bgcolor: t.hover.medium, color: t.text.dimmed }} />}
                </Box>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 500, color: t.text.primary, lineHeight: 1.3 }}>{l.label}</Typography>
                <Box sx={{ display: 'flex', gap: 1, mt: 0.5, fontSize: '0.65rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                  <span>id={l.externalLeagueId ?? '—'}</span>
                  <span>·</span>
                  <span>{l.poolCount} pools</span>
                  <span>·</span>
                  <span>{l.cachedMatchCount} cached</span>
                </Box>
              </Box>
            ))
          )}
        </Box>
      </Card>

      {/* Right — matches table */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {feedback && (
          <Alert severity={feedback.type} onClose={() => setFeedback(null)} sx={{ fontSize: '0.8rem' }}>
            {feedback.message}
          </Alert>
        )}

        {!selected ? (
          <Card sx={{ p: 4, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, textAlign: 'center' }}>
            <Typography sx={{ fontSize: '0.85rem', color: t.text.tertiary }}>
              Select a league from the left to browse its matches.
            </Typography>
          </Card>
        ) : (
          <>
            {/* Header */}
            <Card sx={{ p: 2, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '1rem', fontWeight: 600 }}>{selected.label}</Typography>
                  <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: '0.72rem', color: t.text.tertiary }}>
                    <span>code <strong>{selected.code}</strong></span>
                    <span>sport <strong>{selected.sport}</strong></span>
                    <span>SDB id <strong>{selected.externalLeagueId ?? '—'}</strong></span>
                    {selected.poolOpenDaysBefore != null && (
                      <span>window <strong>{selected.poolOpenDaysBefore}d</strong></span>
                    )}
                  </Box>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                  <ToggleButtonGroup
                    size="small"
                    exclusive
                    value={direction}
                    onChange={(_, v) => v && setDirection(v)}
                    sx={{ '& .MuiToggleButton-root': { fontSize: '0.72rem', textTransform: 'none', px: 1.25, py: 0.5 } }}
                  >
                    <ToggleButton value="upcoming">Upcoming</ToggleButton>
                    <ToggleButton value="past">Past</ToggleButton>
                  </ToggleButtonGroup>
                  <Tooltip title="Re-fetch this league from TheSportsDB right now">
                    <Button
                      size="small"
                      startIcon={<RefreshRoundedIcon sx={{ fontSize: 16 }} />}
                      onClick={() => refreshMutation.mutate()}
                      disabled={refreshMutation.isPending}
                      sx={{ fontSize: '0.75rem', textTransform: 'none', color: t.text.primary, border: `1px solid ${t.border.medium}`, '&:hover': { bgcolor: t.hover.default } }}
                    >
                      {refreshMutation.isPending ? 'Refreshing…' : 'Refresh from SDB'}
                    </Button>
                  </Tooltip>
                </Box>
              </Box>
            </Card>

            {/* Matches table */}
            <Card sx={{ p: 0, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, overflow: 'auto' }}>
              {matchesQ.isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={20} /></Box>
              ) : matches.length === 0 ? (
                <Box sx={{ p: 4, textAlign: 'center' }}>
                  <Typography sx={{ fontSize: '0.82rem', color: t.text.tertiary }}>
                    No {direction} matches cached for this league. Try "Refresh from SDB".
                  </Typography>
                </Box>
              ) : (
                <Table size="small" sx={{ '& td, & th': { borderColor: t.border.subtle, fontSize: '0.75rem' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Kickoff</TableCell>
                      <TableCell>Match</TableCell>
                      <TableCell align="right">When</TableCell>
                      <TableCell>Match ID</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell align="right">Action</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {matches.map(m => {
                      const st = statusChip(m.status);
                      const isCreating = createMutation.isPending && createMutation.variables?.matchId === m.externalId;
                      return (
                        <TableRow key={m.externalId} hover>
                          <TableCell sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {new Date(m.kickoff).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {m.homeTeamCrest && <Box component="img" src={m.homeTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                              <Typography sx={{ fontSize: '0.78rem' }}>{m.homeTeam}</Typography>
                              <Typography sx={{ fontSize: '0.7rem', color: t.text.tertiary, mx: 0.5 }}>vs</Typography>
                              {m.awayTeamCrest && <Box component="img" src={m.awayTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                              <Typography sx={{ fontSize: '0.78rem' }}>{m.awayTeam}</Typography>
                              {m.homeScore != null && m.awayScore != null && (
                                <Typography sx={{ ml: 1, fontSize: '0.72rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                                  ({m.homeScore}-{m.awayScore})
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right" sx={{ color: t.text.tertiary, whiteSpace: 'nowrap' }}>{relTime(m.kickoff)}</TableCell>
                          <TableCell sx={{ fontFamily: 'ui-monospace, monospace', color: t.text.tertiary }}>{m.externalId}</TableCell>
                          <TableCell><Chip label={st.label} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: withAlpha(st.color, 0.15), color: st.color }} /></TableCell>
                          <TableCell align="right">
                            {m.pool ? (
                              <Box
                                component="a"
                                href={`/match/${m.pool.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: '0.7rem', color: t.gain, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                              >
                                <CheckRoundedIcon sx={{ fontSize: 14 }} />
                                Pool {m.pool.status.toLowerCase()}
                                <OpenInNewRoundedIcon sx={{ fontSize: 12 }} />
                              </Box>
                            ) : (
                              <Button
                                size="small"
                                startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                                onClick={() => createMutation.mutate({ matchId: m.externalId, league: selected.code })}
                                disabled={isCreating}
                                sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.25, px: 1.25, color: t.text.primary, bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}
                              >
                                {isCreating ? 'Creating…' : 'Create pool'}
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </>
        )}
      </Box>
    </Box>
  );
}
