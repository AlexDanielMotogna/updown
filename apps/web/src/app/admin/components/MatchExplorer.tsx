'use client';

import { useMemo, useState } from 'react';
import {
  Box, Card, Typography, Chip, CircularProgress, Button, Tooltip,
  Table, TableBody, TableCell, TableHead, TableRow, Alert, ToggleButtonGroup, ToggleButton,
  TextField, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
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

type SdbLeague = {
  id: string;
  name: string;
  sport: string;
  alternate: string;
  inUse: boolean;
  categoryCode: string | null;
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
  const [browseOpen, setBrowseOpen] = useState(false);

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
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>Leagues ({leagues.length})</Typography>
            <Tooltip title="Browse all 1,475 leagues TheSportsDB knows about and add new ones">
              <Button
                size="small"
                startIcon={<TravelExploreRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => setBrowseOpen(true)}
                sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.25, px: 1, color: t.text.primary, bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}
              >
                Browse SDB
              </Button>
            </Tooltip>
          </Box>
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

      <BrowseSdbModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        onAdded={(msg) => {
          setBrowseOpen(false);
          setFeedback({ type: 'success', message: msg });
          qc.invalidateQueries({ queryKey: ['admin-sports-leagues'] });
          qc.invalidateQueries({ queryKey: ['admin-sports-sdb-leagues'] });
        }}
      />
    </Box>
  );
}

// ─── SDB Browser Modal ────────────────────────────────────────────────────────

function BrowseSdbModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  const [sport, setSport] = useState<string>('Soccer');
  const [query, setQuery] = useState('');
  const [pendingAdd, setPendingAdd] = useState<SdbLeague | null>(null);

  const sdbQ = useQuery({
    queryKey: ['admin-sports-sdb-leagues'],
    queryFn: () => adminFetch<{ success: true; data: { leagues: SdbLeague[]; sportsCount: number } }>('/sports/sdb-leagues').then(r => r.data),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const allLeagues = sdbQ.data?.leagues ?? [];
  const allSports = useMemo(() => {
    const s = new Set<string>();
    for (const l of allLeagues) if (l.sport) s.add(l.sport);
    return [...s].sort();
  }, [allLeagues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLeagues.filter(l => {
      if (sport !== 'ALL' && l.sport !== sport) return false;
      if (!q) return true;
      return l.name.toLowerCase().includes(q)
        || l.alternate.toLowerCase().includes(q)
        || l.id.includes(q);
    });
  }, [allLeagues, sport, query]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}`, height: '80vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem', borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TravelExploreRoundedIcon sx={{ fontSize: 20 }} />
            Browse TheSportsDB Leagues
            <Chip label={`${allLeagues.length} total`} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
          </Box>
          <Button size="small" onClick={onClose} sx={{ minWidth: 0, p: 0.5, color: t.text.tertiary }}><CloseRoundedIcon /></Button>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Sport</InputLabel>
              <Select value={sport} label="Sport" onChange={e => setSport(e.target.value)}>
                <MenuItem value="ALL">All sports</MenuItem>
                {allSports.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small"
              fullWidth
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, alternate, or SDB id"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 16 }} /></InputAdornment> }}
            />
          </Box>

          <Typography sx={{ fontSize: '0.7rem', color: t.text.tertiary }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'} • cached 10 min server-side
          </Typography>

          <Box sx={{ overflow: 'auto', flex: 1, border: `1px solid ${t.border.subtle}`, borderRadius: 1 }}>
            {sdbQ.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={20} /></Box>
            ) : (
              <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: t.border.subtle, fontSize: '0.75rem' }, '& th': { bgcolor: t.bg.surface } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>SDB id</TableCell>
                    <TableCell>League</TableCell>
                    <TableCell>Sport</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(l => (
                    <TableRow key={l.id} hover>
                      <TableCell sx={{ fontFamily: 'ui-monospace, monospace', color: t.text.tertiary }}>{l.id}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.78rem' }}>{l.name}</Typography>
                        {l.alternate && <Typography sx={{ fontSize: '0.65rem', color: t.text.tertiary }}>{l.alternate}</Typography>}
                      </TableCell>
                      <TableCell><Chip label={l.sport || '—'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: withAlpha(SPORT_COLORS[l.sport.toUpperCase()] || t.text.tertiary, 0.15) }} /></TableCell>
                      <TableCell align="right">
                        {l.inUse ? (
                          <Chip label={`in use as ${l.categoryCode}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: withAlpha(t.gain, 0.15), color: t.gain }} />
                        ) : (
                          <Button
                            size="small"
                            startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                            onClick={() => setPendingAdd(l)}
                            sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.25, px: 1.25, color: t.text.primary, bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}
                          >
                            Add
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {pendingAdd && (
        <AddCategoryDialog
          league={pendingAdd}
          existingCodes={new Set(allLeagues.filter(l => l.inUse && l.categoryCode).map(l => l.categoryCode!))}
          onClose={() => setPendingAdd(null)}
          onSuccess={(code) => {
            setPendingAdd(null);
            onAdded(`Added category ${code}`);
          }}
        />
      )}
    </>
  );
}

// ─── Add Category confirm dialog ──────────────────────────────────────────────

function suggestCode(name: string, sport: string): string {
  // First, try a sport-aware abbreviation for soccer (most common case):
  // "English Premier League" → EPL, "Brazilian Serie A" → BSA.
  const words = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map(w => w[0].toUpperCase()).join('');
    if (initials.length >= 2 && initials.length <= 5) return initials;
  }
  // Fallback: first 4-5 letters of the name uppercased.
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || sport.slice(0, 4).toUpperCase();
}

const SPORT_TO_QUERY: Record<string, string> = {
  // SDB sport names sometimes don't match the v1 livescore sport names — map
  // them here so the new category's `sportQuery` is one of the strings
  // /livescore/{sport} actually accepts.
  Soccer: 'Soccer',
  Basketball: 'Basketball',
  'Ice Hockey': 'Ice Hockey',
  'American Football': 'American Football',
  Baseball: 'Baseball',
  Fighting: 'Fighting',
  Motorsport: 'Motorsport',
  Tennis: 'Tennis',
  Rugby: 'Rugby',
  Cricket: 'Cricket',
  Golf: 'Golf',
  ESports: 'ESports',
};

function AddCategoryDialog({ league, existingCodes, onClose, onSuccess }: {
  league: SdbLeague;
  existingCodes: Set<string>;
  onClose: () => void;
  onSuccess: (code: string) => void;
}) {
  const isSoccer = league.sport === 'Soccer';
  const [code, setCode] = useState(() => {
    let c = suggestCode(league.name, league.sport);
    let i = 1;
    while (existingCodes.has(c)) c = `${suggestCode(league.name, league.sport)}${i++}`;
    return c;
  });
  const [label, setLabel] = useState(league.name);
  const [sortOrder, setSortOrder] = useState<number>(99);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const codeUpper = code.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const codeValid = codeUpper.length >= 2 && !existingCodes.has(codeUpper);

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const type = isSoccer ? 'FOOTBALL_LEAGUE' : 'SPORTSDB_SPORT';
      const config: Record<string, unknown> = { externalLeagueId: league.id };
      if (!isSoccer) {
        config.sportQuery = SPORT_TO_QUERY[league.sport] || league.sport;
        config.leagueFilter = league.name;
      }
      const body = {
        code: codeUpper,
        type,
        label,
        shortLabel: codeUpper,
        sortOrder,
        numSides: isSoccer ? 3 : 2,
        sideLabels: isSoccer ? ['Home', 'Draw', 'Away'] : ['Home', 'Away'],
        enabled: true,
        comingSoon: true, // hide from public feed until operator promotes it
        apiSource: 'sports',
        adapterKey: isSoccer ? 'FOOTBALL' : codeUpper,
        config,
      };
      const res = await adminPost<{ success: true; data: { code: string } }>('/categories', body);
      onSuccess(res.data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}` } }}>
      <DialogTitle sx={{ fontSize: '0.95rem' }}>Add as category</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Box sx={{ p: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, fontSize: '0.75rem' }}>
          <Box sx={{ display: 'flex', gap: 1.5 }}>
            <Box>SDB id <strong>{league.id}</strong></Box>
            <Box>sport <strong>{league.sport || '—'}</strong></Box>
          </Box>
          <Typography sx={{ fontSize: '0.78rem', mt: 0.5, color: t.text.primary }}>{league.name}</Typography>
          {league.alternate && <Typography sx={{ fontSize: '0.65rem', color: t.text.tertiary }}>{league.alternate}</Typography>}
        </Box>

        <TextField
          size="small"
          label="Code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          error={!codeValid}
          helperText={!codeValid ? (codeUpper.length < 2 ? 'Too short' : `Code "${codeUpper}" already exists`) : 'Permanent identifier (e.g. EPL, BSA). Pools reference this.'}
        />
        <TextField size="small" label="Display label" value={label} onChange={e => setLabel(e.target.value)} />
        <TextField size="small" type="number" label="Sort order" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} helperText="Lower = shows earlier in tabs" />

        <Alert severity="info" sx={{ fontSize: '0.72rem' }}>
          Will be created with type <strong>{isSoccer ? 'FOOTBALL_LEAGUE' : 'SPORTSDB_SPORT'}</strong>,
          {' '}sides <strong>{isSoccer ? '3-way (H/D/A)' : '2-way (H/A)'}</strong>, and{' '}
          <strong>coming-soon</strong> (hidden from feed until you toggle it on Categories tab).
        </Alert>

        {error && <Alert severity="error" sx={{ fontSize: '0.72rem' }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', color: t.text.tertiary }}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !codeValid || !label} variant="contained" sx={{ textTransform: 'none', bgcolor: t.gain, '&:hover': { bgcolor: t.successDark } }}>
          {busy ? 'Adding…' : 'Add category'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
