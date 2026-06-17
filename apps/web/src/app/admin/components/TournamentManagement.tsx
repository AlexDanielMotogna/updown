'use client';

import { useMemo, useState } from 'react';
import {
  Box, TextField, Select, MenuItem, FormControl, InputLabel, Chip,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as dt, withAlpha } from '@/lib/theme';
import {
  SectionCard, StatusChip, AdminDialog, ConfirmDialog,
  ActionButton, LoadingState, EmptyState, FilterBar,
  useMutationFeedback, useToast,
  H1, Meta, Body,
  POLL_FAST_MS,
  type FilterChip,
} from '../ui';
import {
  type Tournament, type ActionKey,
  SPORT_OPTIONS, SINGLE_LEAGUE_SPORTS, getLeaguesForSport, getEffectiveLeague,
  VALID_SIZES, USDC_DIVISOR, ACTION_META,
} from './tournament-config';
import { TournamentRow } from './TournamentRow';

export function TournamentManagement() {
  const qc = useQueryClient();
  const toast = useToast();
  const feedback = useMutationFeedback();

  const [confirmAction, setConfirmAction] = useState<{ id: string; name: string; action: ActionKey; round?: number } | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ id: string; totalRounds: number; league: string | null; sport: string | null; fixturesByRound?: Tournament['fixturesByRound'] } | null>(null);
  const [assignRound, setAssignRound] = useState(1);
  const [assignSelectedIds, setAssignSelectedIds] = useState<Set<string>>(new Set());
  const [assignHome, setAssignHome] = useState('');
  const [assignAway, setAssignAway] = useState('');
  const [resolveDialog, setResolveDialog] = useState<{ id: string; round: number } | null>(null);
  const [resolveScores, setResolveScores] = useState<Array<{ home: string; away: string }>>([]);
  const [filterQuery, setFilterQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  // Create form
  const [tournamentType, setTournamentType] = useState<'CRYPTO' | 'SPORTS'>('CRYPTO');
  const [name, setName] = useState('');
  const [asset, setAsset] = useState('BTC');
  const [sport, setSport] = useState('FOOTBALL');
  const [league, setLeague] = useState('CL');
  const [entryFee, setEntryFee] = useState('');
  const [size, setSize] = useState(8);
  const [matchDuration, setMatchDuration] = useState(300);
  const [predictionWindow, setPredictionWindow] = useState(300);
  const [scheduledAt, setScheduledAt] = useState('');

  // Edit tournament
  const [editTournament, setEditTournament] = useState<Tournament | null>(null);
  const [editName, setEditName] = useState('');
  const [editAsset, setEditAsset] = useState('BTC');
  const [editEntryFee, setEditEntryFee] = useState('');
  const [editSize, setEditSize] = useState(8);
  const [editMatchDuration, setEditMatchDuration] = useState(300);
  const [editPredictionWindow, setEditPredictionWindow] = useState(300);
  const [editScheduledAt, setEditScheduledAt] = useState('');
  const [editType, setEditType] = useState<'CRYPTO' | 'SPORTS'>('CRYPTO');
  const [editSport, setEditSport] = useState('FOOTBALL');
  const [editLeague, setEditLeague] = useState('CL');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => adminFetch<{ data: Tournament[] }>('/tournaments'),
    // Plan §11: tournaments page is live-flow (admins react to "Needs
    // Resolution" within seconds), so FAST cadence not MEDIUM.
    refetchInterval: POLL_FAST_MS,
  });
  const tournaments = (data as { data: Tournament[] })?.data ?? [];

  // Filter pipeline: free-text on name/asset, status chip filter.
  const filteredTournaments = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    return tournaments.filter(t => {
      if (statusFilter && t.status !== statusFilter) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || t.asset.toLowerCase().includes(q);
    });
  }, [tournaments, filterQuery, statusFilter]);

  const filterChips: FilterChip[] = statusFilter
    ? [{ key: 'status', label: `Status: ${statusFilter}`, onRemove: () => setStatusFilter(null) }]
    : [];

  const createMutation = useMutation({
    mutationFn: () => {
      const effectiveLeague = getEffectiveLeague(sport, league);
      return adminPost('/tournaments/create', {
        name,
        asset: tournamentType === 'SPORTS' ? `${sport}:${effectiveLeague}` : asset,
        entryFee: Math.round(parseFloat(entryFee) * USDC_DIVISOR),
        size,
        matchDuration: tournamentType === 'SPORTS' ? 0 : matchDuration,
        predictionWindow,
        scheduledAt: scheduledAt || undefined,
        tournamentType,
        sport: tournamentType === 'SPORTS' ? sport : undefined,
        league: tournamentType === 'SPORTS' ? effectiveLeague : undefined,
      });
    },
    onSuccess: () => {
      setName(''); setEntryFee(''); setScheduledAt('');
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      const effectiveLeague = getEffectiveLeague(editSport, editLeague);
      return adminPost(`/tournaments/${editTournament!.id}/update`, {
        name: editName,
        asset: editType === 'CRYPTO' ? editAsset : editSport,
        sport: editType === 'SPORTS' ? editSport : null,
        league: editType === 'SPORTS' ? effectiveLeague : null,
        // PR 1 (Phase 1 #3) fixed this - 'SPORTS' not 'PREDICT_MATCHDAY'.
        // Keep the explicit map so the value is impossible to typo.
        tournamentType: editType === 'SPORTS' ? 'SPORTS' : 'CRYPTO',
        entryFee: Math.round(parseFloat(editEntryFee) * USDC_DIVISOR),
        size: editSize,
        matchDuration: editMatchDuration,
        predictionWindow: editPredictionWindow,
        scheduledAt: editScheduledAt || null,
      });
    },
    onSuccess: () => {
      setEditTournament(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
  });

  // Upcoming matches for the assign dialog. Switched from raw fetch (which
  // bypassed adminFetch's 401 handling) to adminFetch - see PLAN-ADMIN-
  // REFACTOR.md §3.1.
  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['admin-upcoming-matches', assignDialog?.league, assignDialog?.sport],
    queryFn: () => adminFetch<{ data: Array<{ id: string; homeTeam: string; awayTeam: string; homeTeamCrest: string | null; awayTeamCrest: string | null; kickoff: string }> }>(`/tournaments/upcoming-matches?league=${assignDialog?.league || 'CL'}&sport=${assignDialog?.sport || 'FOOTBALL'}`),
    enabled: !!assignDialog,
  });
  const upcomingMatches = (upcomingData as { data?: Array<{ id: string; homeTeam: string; awayTeam: string; homeTeamCrest: string | null; awayTeamCrest: string | null; kickoff: string }> } | undefined)?.data ?? [];

  const assignMutation = useMutation({
    mutationFn: (data: { id: string; round: number; fixtures: Array<{ footballMatchId: string; homeTeam: string; awayTeam: string; homeTeamCrest?: string | null; awayTeamCrest?: string | null; kickoff?: string | null }> }) =>
      adminPost(`/tournaments/${data.id}/assign-matchday`, { round: data.round, fixtures: data.fixtures }),
    onSuccess: () => {
      setAssignDialog(null); setAssignSelectedIds(new Set()); setAssignHome(''); setAssignAway('');
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
  });

  // Bracket query for the resolve dialog. Public endpoint (no admin auth),
  // so it's fine to use raw fetch here - but going through adminFetch
  // gives consistent error handling.
  const { data: bracketData } = useQuery({
    queryKey: ['admin-bracket', resolveDialog?.id],
    queryFn: () => adminFetch<{ data: { fixtures: Record<number, Array<{ fixtureIndex: number; homeTeam: string; awayTeam: string; status: string }>> } }>(`/tournaments/${resolveDialog!.id}/bracket-admin`)
      .catch(async () => {
        // Fallback to the public bracket endpoint if the admin one isn't
        // available (preserves behaviour from the previous raw-fetch path).
        const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
        const res = await fetch(`${API_BASE}/api/tournaments/${resolveDialog!.id}/bracket`);
        return res.json();
      }),
    enabled: !!resolveDialog,
  });
  const resolveFixtures: Array<{ fixtureIndex: number; homeTeam: string; awayTeam: string; status: string }> =
    resolveDialog
      ? ((bracketData as { data?: { fixtures?: Record<number, Array<{ fixtureIndex: number; homeTeam: string; awayTeam: string; status: string }>> } } | undefined)?.data?.fixtures?.[resolveDialog.round] ?? [])
      : [];

  const resolveMutation = useMutation({
    mutationFn: ({ id, results }: { id: string; results: Array<{ fixtureIndex: number; resultHome: number; resultAway: number }> }) =>
      adminPost(`/tournaments/${id}/resolve-matchday`, { results }),
    onSuccess: () => {
      setResolveDialog(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: ActionKey }) =>
      adminPost(`/tournaments/${id}/${action}`),
    onSuccess: () => {
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: () => setConfirmAction(null),
  });

  // Submit helpers - funnel everything through useMutationFeedback so the
  // toast queue handles success/error consistently. No more setResult
  // Alert in the page.
  const submitCreate = () => {
    if (!VALID_SIZES.includes(size)) {
      toast.show({ kind: 'error', message: `Tournament size must be one of ${VALID_SIZES.join(', ')}.` });
      return;
    }
    void feedback.run(createMutation, undefined, { success: 'Tournament created' });
  };
  const submitUpdate = () => {
    if (!VALID_SIZES.includes(editSize)) {
      toast.show({ kind: 'error', message: `Tournament size must be one of ${VALID_SIZES.join(', ')}.` });
      return;
    }
    void feedback.run(updateMutation, undefined, { success: 'Tournament updated' });
  };
  const submitAction = () => {
    if (!confirmAction) return;
    void feedback.run(actionMutation, { id: confirmAction.id, action: confirmAction.action }, {
      success: `${ACTION_META[confirmAction.action].verb} succeeded`,
    });
  };
  const submitAssign = () => {
    if (!assignDialog) return;
    if (assignSelectedIds.size > 0) {
      const selected = upcomingMatches.filter(m => assignSelectedIds.has(m.id));
      void feedback.run(assignMutation, {
        id: assignDialog.id,
        round: assignRound,
        fixtures: selected.map(m => ({
          footballMatchId: m.id,
          homeTeam: m.homeTeam,
          awayTeam: m.awayTeam,
          homeTeamCrest: m.homeTeamCrest,
          awayTeamCrest: m.awayTeamCrest,
          kickoff: m.kickoff,
        })),
      }, { success: `Round ${assignRound} matches assigned` });
    } else {
      const home = assignHome.trim();
      const away = assignAway.trim();
      if (!home || !away) {
        toast.show({ kind: 'error', message: 'Enter both home and away team names, or pick at least one match from the list.' });
        return;
      }
      void feedback.run(assignMutation, {
        id: assignDialog.id,
        round: assignRound,
        fixtures: [{ footballMatchId: `manual-${Date.now()}`, homeTeam: home, awayTeam: away }],
      }, { success: `Round ${assignRound} match assigned` });
    }
  };
  const submitResolve = () => {
    if (!resolveDialog) return;
    // Reject blank inputs - previously parseInt('', 10) → NaN, then we
    // coerced via || '0' which silently turned every empty field into a
    // 0-0 DRAW. The admin must enter real numbers per fixture.
    // See PLAN-ADMIN-REFACTOR.md §3.1.
    const missing: number[] = [];
    for (let i = 0; i < resolveFixtures.length; i++) {
      const score = resolveScores[i];
      const homeBlank = !score || score.home.trim() === '';
      const awayBlank = !score || score.away.trim() === '';
      if (homeBlank || awayBlank) missing.push(i + 1);
    }
    if (missing.length > 0) {
      toast.show({
        kind: 'error',
        message: `Enter both scores for fixture${missing.length === 1 ? '' : 's'} ${missing.join(', ')} before resolving.`,
      });
      return;
    }
    const results = resolveFixtures.map((f, i) => ({
      fixtureIndex: f.fixtureIndex,
      resultHome: parseInt(resolveScores[i]!.home, 10),
      resultAway: parseInt(resolveScores[i]!.away, 10),
    }));
    void feedback.run(resolveMutation, { id: resolveDialog.id, results }, { success: 'Matchday resolved' });
  };

  const openEdit = (t: Tournament) => {
    setEditTournament(t);
    setEditName(t.name);
    setEditAsset(t.asset);
    setEditEntryFee((Number(t.entryFee) / USDC_DIVISOR).toString());
    setEditSize(t.size);
    setEditMatchDuration(t.matchDuration);
    setEditPredictionWindow(t.predictionWindow ?? 300);
    setEditScheduledAt(t.scheduledAt ? new Date(t.scheduledAt).toISOString().slice(0, 16) : '');
    setEditType(t.sport ? 'SPORTS' : 'CRYPTO');
    setEditSport(t.sport || 'FOOTBALL');
    setEditLeague(t.league || 'CL');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Create Tournament ─────────────────────────────────────── */}
      <SectionCard
        title="Create Tournament"
        actions={
          <ActionButton
            kind="primary"
            label="Create"
            onClick={submitCreate}
            disabled={!name || !entryFee}
            loading={createMutation.isPending}
          />
        }
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
          <FormControl size="small">
            <InputLabel>Type</InputLabel>
            <Select value={tournamentType} onChange={(e) => setTournamentType(e.target.value as 'CRYPTO' | 'SPORTS')} label="Type">
              <MenuItem value="CRYPTO">Crypto</MenuItem>
              <MenuItem value="SPORTS">Sports</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={tournamentType === 'SPORTS' ? 'UCL Bracket Challenge' : 'BTC Showdown #1'}
          />
          {tournamentType === 'CRYPTO' ? (
            <FormControl size="small">
              <InputLabel>Asset</InputLabel>
              <Select value={asset} onChange={(e) => setAsset(e.target.value)} label="Asset">
                <MenuItem value="BTC">BTC</MenuItem>
                <MenuItem value="ETH">ETH</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
              </Select>
            </FormControl>
          ) : (
            <>
              <FormControl size="small">
                <InputLabel>Sport</InputLabel>
                <Select value={sport} onChange={(e) => {
                  const s = e.target.value;
                  setSport(s);
                  if (SINGLE_LEAGUE_SPORTS.has(s)) setLeague(s);
                  else if (s === 'FOOTBALL' && SINGLE_LEAGUE_SPORTS.has(league)) setLeague('CL');
                }} label="Sport">
                  {SPORT_OPTIONS.map(s => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {!SINGLE_LEAGUE_SPORTS.has(sport) && (
                <FormControl size="small">
                  <InputLabel>League</InputLabel>
                  <Select value={league} onChange={(e) => setLeague(e.target.value)} label="League">
                    {getLeaguesForSport(sport).map(l => (
                      <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </>
          )}
          <TextField
            label="Entry Fee (USDC)"
            size="small"
            type="number"
            value={entryFee}
            onChange={(e) => setEntryFee(e.target.value)}
            placeholder="10"
          />
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
          <FormControl size="small">
            <InputLabel>Size</InputLabel>
            <Select value={size} onChange={(e) => setSize(Number(e.target.value))} label="Size">
              {VALID_SIZES.map(s => <MenuItem key={s} value={s}>{s} players</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Prediction Window</InputLabel>
            <Select value={predictionWindow} onChange={(e) => setPredictionWindow(Number(e.target.value))} label="Prediction Window">
              <MenuItem value={60}>1 min</MenuItem>
              <MenuItem value={120}>2 min</MenuItem>
              <MenuItem value={300}>5 min</MenuItem>
              <MenuItem value={600}>10 min</MenuItem>
            </Select>
          </FormControl>
          {tournamentType === 'CRYPTO' && (
            <FormControl size="small">
              <InputLabel>Match Duration</InputLabel>
              <Select value={matchDuration} onChange={(e) => setMatchDuration(Number(e.target.value))} label="Match Duration">
                <MenuItem value={60}>1 min</MenuItem>
                <MenuItem value={180}>3 min</MenuItem>
                <MenuItem value={300}>5 min</MenuItem>
                <MenuItem value={900}>15 min</MenuItem>
                <MenuItem value={3600}>1 hour</MenuItem>
              </Select>
            </FormControl>
          )}
          <TextField
            label="Estimated Start"
            size="small"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
        {entryFee && (
          <Meta sx={{ mt: 1.5 }}>
            Prize pool: ${(parseFloat(entryFee) * size * 0.95).toFixed(2)} USDC (after 5% fee) for {size} players
          </Meta>
        )}
      </SectionCard>

      {/* ─── Tournament List ───────────────────────────────────────── */}
      <SectionCard
        title={`Tournaments (${filteredTournaments.length}${filteredTournaments.length !== tournaments.length ? ` of ${tournaments.length}` : ''})`}
      >
        <Box sx={{ mb: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <FilterBar
            value={filterQuery}
            onChange={setFilterQuery}
            placeholder="Search by name or asset…"
            activeChips={filterChips}
          />
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            {(['REGISTERING', 'ACTIVE', 'COMPLETED', 'CANCELLED'] as const).map(s => {
              const active = statusFilter === s;
              return (
                <Chip
                  key={s}
                  label={s}
                  size="small"
                  onClick={() => setStatusFilter(active ? null : s)}
                  sx={{
                    height: 22, fontSize: '0.7rem', fontWeight: 600, borderRadius: 1,
                    bgcolor: active ? withAlpha(dt.predict, 0.18) : dt.hover.subtle,
                    color: active ? dt.predict : dt.text.tertiary,
                    cursor: 'pointer',
                    '&:hover': { bgcolor: active ? withAlpha(dt.predict, 0.24) : dt.hover.default },
                  }}
                />
              );
            })}
          </Box>
        </Box>

        {isLoading ? (
          <LoadingState variant="block" />
        ) : filteredTournaments.length === 0 ? (
          <EmptyState
            title={tournaments.length === 0 ? 'No tournaments yet' : 'No tournaments match the current filter'}
            hint={tournaments.length === 0
              ? 'Use the form above to create one. Sports tournaments need fixtures assigned per round before they start.'
              : 'Clear the search or status filter to see all tournaments.'}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {filteredTournaments.map((t) => (
              <TournamentRow
                key={t.id}
                tournament={t}
                onEdit={() => openEdit(t)}
                onAction={(action, round) => setConfirmAction({ id: t.id, name: t.name, action, round })}
                onAssign={(round) => {
                  setAssignDialog({ id: t.id, totalRounds: t.totalRounds, league: t.league, sport: t.sport || null, fixturesByRound: t.fixturesByRound });
                  setAssignRound(round);
                  setAssignSelectedIds(new Set()); setAssignHome(''); setAssignAway('');
                }}
                onResolve={() => { setResolveDialog({ id: t.id, round: t.currentRound }); setResolveScores([]); }}
              />
            ))}
          </Box>
        )}
      </SectionCard>

      {/* ─── Confirm Action ────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={submitAction}
        title={confirmAction ? `${ACTION_META[confirmAction.action].verb} tournament?` : ''}
        consequences={confirmAction ? ACTION_META[confirmAction.action].consequences(confirmAction.name, confirmAction.round) : ''}
        actionLabel={confirmAction ? ACTION_META[confirmAction.action].verb : ''}
        severity={confirmAction ? ACTION_META[confirmAction.action].severity : 'warning'}
        loading={actionMutation.isPending}
      />

      {/* ─── Edit Tournament ──────────────────────────────────────── */}
      <AdminDialog
        open={!!editTournament}
        onClose={() => setEditTournament(null)}
        title="Edit Tournament"
        maxWidth="sm"
        loading={updateMutation.isPending}
        footer={
          <>
            <ActionButton kind="tertiary" label="Cancel" onClick={() => setEditTournament(null)} disabled={updateMutation.isPending} />
            <ActionButton kind="primary" label="Save changes" onClick={submitUpdate} disabled={!editName || !editEntryFee} loading={updateMutation.isPending} />
          </>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <TextField label="Name" size="small" value={editName} onChange={(e) => setEditName(e.target.value)} />
          <FormControl size="small">
            <InputLabel>Type</InputLabel>
            <Select value={editType} onChange={(e) => setEditType(e.target.value as 'CRYPTO' | 'SPORTS')} label="Type">
              <MenuItem value="CRYPTO">Crypto</MenuItem>
              <MenuItem value="SPORTS">Sports</MenuItem>
            </Select>
          </FormControl>
          {editType === 'CRYPTO' ? (
            <FormControl size="small">
              <InputLabel>Asset</InputLabel>
              <Select value={editAsset} onChange={(e) => setEditAsset(e.target.value)} label="Asset">
                <MenuItem value="BTC">BTC</MenuItem>
                <MenuItem value="ETH">ETH</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
              </Select>
            </FormControl>
          ) : (
            <>
              <FormControl size="small">
                <InputLabel>Sport</InputLabel>
                <Select value={editSport} onChange={(e) => {
                  const s = e.target.value;
                  setEditSport(s);
                  if (SINGLE_LEAGUE_SPORTS.has(s)) setEditLeague(s);
                  else if (s === 'FOOTBALL' && SINGLE_LEAGUE_SPORTS.has(editLeague)) setEditLeague('CL');
                }} label="Sport">
                  {SPORT_OPTIONS.map(s => <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>)}
                </Select>
              </FormControl>
              {!SINGLE_LEAGUE_SPORTS.has(editSport) && (
                <FormControl size="small">
                  <InputLabel>League</InputLabel>
                  <Select value={editLeague} onChange={(e) => setEditLeague(e.target.value)} label="League">
                    {getLeaguesForSport(editSport).map(l => <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>)}
                  </Select>
                </FormControl>
              )}
            </>
          )}
          <TextField label="Entry Fee (USDC)" size="small" type="number" value={editEntryFee} onChange={(e) => setEditEntryFee(e.target.value)} />
          <FormControl size="small">
            <InputLabel>Size</InputLabel>
            <Select value={editSize} onChange={(e) => setEditSize(Number(e.target.value))} label="Size">
              {VALID_SIZES.map(s => <MenuItem key={s} value={s}>{s} players</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Prediction Window</InputLabel>
            <Select value={editPredictionWindow} onChange={(e) => setEditPredictionWindow(Number(e.target.value))} label="Prediction Window">
              <MenuItem value={60}>1 min</MenuItem>
              <MenuItem value={120}>2 min</MenuItem>
              <MenuItem value={300}>5 min</MenuItem>
              <MenuItem value={600}>10 min</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small">
            <InputLabel>Match Duration</InputLabel>
            <Select value={editMatchDuration} onChange={(e) => setEditMatchDuration(Number(e.target.value))} label="Match Duration">
              <MenuItem value={60}>1 min</MenuItem>
              <MenuItem value={180}>3 min</MenuItem>
              <MenuItem value={300}>5 min</MenuItem>
              <MenuItem value={900}>15 min</MenuItem>
              <MenuItem value={3600}>1 hour</MenuItem>
            </Select>
          </FormControl>
          <TextField
            label="Estimated Start"
            size="small"
            type="datetime-local"
            value={editScheduledAt}
            onChange={(e) => setEditScheduledAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
        </Box>
      </AdminDialog>

      {/* ─── Assign Matchday ──────────────────────────────────────── */}
      <AdminDialog
        open={!!assignDialog}
        onClose={() => setAssignDialog(null)}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
            <Box>Assign matchday</Box>
            <FormControl size="small" sx={{ minWidth: 110 }}>
              <Select value={assignRound} onChange={(e) => { setAssignRound(Number(e.target.value)); setAssignSelectedIds(new Set()); }}>
                {Array.from({ length: assignDialog?.totalRounds || 1 }, (_, i) => i + 1).map(r => (
                  <MenuItem key={r} value={r}>Round {r}</MenuItem>
                ))}
              </Select>
            </FormControl>
            {assignSelectedIds.size > 0 && (
              <StatusChip status="info" label={`${assignSelectedIds.size} selected`} />
            )}
          </Box>
        }
        maxWidth="sm"
        loading={assignMutation.isPending}
        footer={
          <>
            <ActionButton kind="tertiary" label="Cancel" onClick={() => setAssignDialog(null)} disabled={assignMutation.isPending} />
            <ActionButton
              kind="primary"
              label={`Assign ${assignSelectedIds.size || 1} match${assignSelectedIds.size !== 1 ? 'es' : ''}`}
              loading={assignMutation.isPending}
              disabled={assignSelectedIds.size === 0 && (!assignHome.trim() || !assignAway.trim())}
              onClick={submitAssign}
            />
          </>
        }
      >
        {upcomingLoading ? (
          <LoadingState variant="block" />
        ) : upcomingMatches.length > 0 ? (
          <Box>
            <Body sx={{ mb: 1 }}>Select matches for this round (click to toggle):</Body>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {upcomingMatches.map(m => {
                const selected = assignSelectedIds.has(m.id);
                const kickoff = new Date(m.kickoff).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                let assignedRound: number | null = null;
                if (assignDialog?.fixturesByRound) {
                  for (const [round, fixtures] of Object.entries(assignDialog.fixturesByRound)) {
                    const r = Number(round);
                    if (r === assignRound) continue;
                    if (fixtures.some(f => f.footballMatchId === m.id)) { assignedRound = r; break; }
                  }
                }
                return (
                  <Box
                    key={m.id}
                    onClick={() => setAssignSelectedIds(prev => {
                      const next = new Set(prev);
                      if (next.has(m.id)) next.delete(m.id); else next.add(m.id);
                      return next;
                    })}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 1, cursor: 'pointer',
                      bgcolor: selected ? withAlpha(dt.predict, 0.12) : assignedRound ? withAlpha(dt.error, 0.06) : dt.hover.subtle,
                      border: selected ? `1px solid ${withAlpha(dt.predict, 0.4)}` : assignedRound ? `1px solid ${withAlpha(dt.error, 0.2)}` : '1px solid transparent',
                      '&:hover': { bgcolor: selected ? withAlpha(dt.predict, 0.15) : dt.hover.default },
                    }}
                  >
                    <Box sx={{ width: 20, height: 20, borderRadius: '4px', border: selected ? `2px solid ${dt.predict}` : `2px solid ${dt.text.muted}`, bgcolor: selected ? dt.predict : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {selected && <Box sx={{ fontSize: '0.65rem', color: '#fff', fontWeight: 700 }}>✓</Box>}
                    </Box>
                    {m.homeTeamCrest && <Box component="img" src={m.homeTeamCrest} alt="" sx={{ width: 22, height: 22, objectFit: 'contain' }} />}
                    <Box sx={{ fontSize: '0.82rem', fontWeight: 600, flex: 1 }}>{m.homeTeam} vs {m.awayTeam}</Box>
                    {assignedRound && <StatusChip status="error" label={`R${assignedRound}`} />}
                    {m.awayTeamCrest && <Box component="img" src={m.awayTeamCrest} alt="" sx={{ width: 22, height: 22, objectFit: 'contain' }} />}
                    <Meta>{kickoff}</Meta>
                  </Box>
                );
              })}
            </Box>
            <ActionButton
              kind="tertiary"
              label="Select all"
              onClick={() => setAssignSelectedIds(new Set(upcomingMatches.map(m => m.id)))}
              sx={{ mt: 1, color: dt.predict }}
            />
          </Box>
        ) : (
          <Box>
            <Body sx={{ mb: 2 }}>No upcoming matches found. Enter manually:</Body>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <TextField label="Home Team" size="small" value={assignHome} onChange={(e) => setAssignHome(e.target.value)} placeholder="Real Madrid" />
              <TextField label="Away Team" size="small" value={assignAway} onChange={(e) => setAssignAway(e.target.value)} placeholder="Bayern Munich" />
            </Box>
          </Box>
        )}
      </AdminDialog>

      {/* ─── Resolve Matchday ──────────────────────────────────────── */}
      <AdminDialog
        open={!!resolveDialog}
        onClose={() => setResolveDialog(null)}
        title={`Resolve Round ${resolveDialog?.round ?? ''} - enter scores`}
        maxWidth="sm"
        loading={resolveMutation.isPending}
        footer={
          <>
            <ActionButton kind="tertiary" label="Cancel" onClick={() => setResolveDialog(null)} disabled={resolveMutation.isPending} />
            <ActionButton
              kind="primary"
              label="Resolve matchday"
              loading={resolveMutation.isPending}
              disabled={resolveFixtures.length === 0}
              onClick={submitResolve}
            />
          </>
        }
      >
        {resolveFixtures.length > 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {resolveFixtures.map((f, i) => {
              const scores = resolveScores[i] || { home: '', away: '' };
              return (
                <Box key={f.fixtureIndex} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Box sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, textAlign: 'right' }}>{f.homeTeam}</Box>
                  <TextField
                    size="small" type="number" placeholder="0" value={scores.home}
                    onChange={(e) => { const s = [...resolveScores]; s[i] = { ...scores, home: e.target.value }; setResolveScores(s); }}
                    sx={{ width: 50, '& .MuiInputBase-root': { height: 32 }, '& .MuiInputBase-input': { textAlign: 'center', fontSize: '0.85rem' } }}
                  />
                  <Box sx={{ fontSize: '0.7rem', color: dt.text.dimmed }}>-</Box>
                  <TextField
                    size="small" type="number" placeholder="0" value={scores.away}
                    onChange={(e) => { const s = [...resolveScores]; s[i] = { ...scores, away: e.target.value }; setResolveScores(s); }}
                    sx={{ width: 50, '& .MuiInputBase-root': { height: 32 }, '& .MuiInputBase-input': { textAlign: 'center', fontSize: '0.85rem' } }}
                  />
                  <Box sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1 }}>{f.awayTeam}</Box>
                </Box>
              );
            })}
          </Box>
        ) : (
          <EmptyState
            title="No fixtures for this round"
            hint="Assign matches to this round first via the Setup Matches / Assign Match button."
          />
        )}
      </AdminDialog>
    </Box>
  );
}

// ─── Row sub-component ────────────────────────────────────────────────
