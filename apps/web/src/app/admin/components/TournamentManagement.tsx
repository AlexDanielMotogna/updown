'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Button, TextField, Alert, Dialog,
  DialogTitle, DialogContent, DialogActions, Select, MenuItem,
  FormControl, InputLabel, Chip, CircularProgress,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';

interface Tournament {
  id: string;
  name: string;
  asset: string;
  entryFee: string;
  size: number;
  matchDuration: number;
  predictionWindow: number;
  status: string;
  currentRound: number;
  totalRounds: number;
  prizePool: string;
  winnerWallet: string | null;
  scheduledAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  tournamentType: string;
  sport: string | null;
  league: string | null;
  _count: { participants: number };
}

const SPORT_OPTIONS = [
  { value: 'FOOTBALL', label: 'Soccer' },
];

const LEAGUE_OPTIONS = [
  { value: 'CL', label: 'Champions League' },
  { value: 'PL', label: 'Premier League' },
  { value: 'PD', label: 'La Liga' },
  { value: 'SA', label: 'Serie A' },
  { value: 'BL1', label: 'Bundesliga' },
  { value: 'FL1', label: 'Ligue 1' },
];

const STATUS_COLORS: Record<string, string> = {
  REGISTERING: '#4ADE80',
  ACTIVE: '#F59E0B',
  COMPLETED: '#6B7280',
  CANCELLED: '#F87171',
};

const USDC_DIVISOR = 1_000_000;

export function TournamentManagement() {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ label: string; id: string; action: string } | null>(null);
  const [assignDialog, setAssignDialog] = useState<{ id: string; totalRounds: number; league: string | null } | null>(null);
  const [assignRound, setAssignRound] = useState(1);
  const [assignSelected, setAssignSelected] = useState<string | null>(null);
  const [assignHome, setAssignHome] = useState('');
  const [assignAway, setAssignAway] = useState('');
  const [resolveDialog, setResolveDialog] = useState<{ id: string; round: number } | null>(null);

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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => adminFetch<{ data: Tournament[] }>('/tournaments'),
    refetchInterval: 10_000,
  });

  const tournaments = (data as { data: Tournament[] })?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => adminPost('/tournaments/create', {
      name,
      asset: tournamentType === 'SPORTS' ? `${sport}:${league}` : asset,
      entryFee: Math.round(parseFloat(entryFee) * USDC_DIVISOR),
      size,
      matchDuration: tournamentType === 'SPORTS' ? 0 : matchDuration,
      predictionWindow,
      scheduledAt: scheduledAt || undefined,
      tournamentType,
      sport: tournamentType === 'SPORTS' ? sport : undefined,
      league: tournamentType === 'SPORTS' ? league : undefined,
    }),
    onSuccess: () => {
      setResult({ type: 'success', message: 'Tournament created' });
      setName('');
      setEntryFee('');
      setScheduledAt('');
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    },
  });

  const openEdit = (t: Tournament) => {
    setEditTournament(t);
    setEditName(t.name);
    setEditAsset(t.asset);
    setEditEntryFee((Number(t.entryFee) / USDC_DIVISOR).toString());
    setEditSize(t.size);
    setEditMatchDuration(t.matchDuration);
    setEditPredictionWindow(t.predictionWindow ?? 300);
    setEditScheduledAt(t.scheduledAt ? new Date(t.scheduledAt).toISOString().slice(0, 16) : '');
  };

  const updateMutation = useMutation({
    mutationFn: () => adminPost(`/tournaments/${editTournament!.id}/update`, {
      name: editName,
      asset: editAsset,
      entryFee: Math.round(parseFloat(editEntryFee) * USDC_DIVISOR),
      size: editSize,
      matchDuration: editMatchDuration,
      predictionWindow: editPredictionWindow,
      scheduledAt: editScheduledAt || null,
    }),
    onSuccess: () => {
      setResult({ type: 'success', message: 'Tournament updated' });
      setEditTournament(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    },
  });

  const { data: upcomingData, isLoading: upcomingLoading } = useQuery({
    queryKey: ['admin-upcoming-matches', assignDialog?.league],
    queryFn: () => adminFetch<{ data: Array<{ id: string; homeTeam: string; awayTeam: string; homeTeamCrest: string | null; awayTeamCrest: string | null; kickoff: string }> }>(`/tournaments/upcoming-matches?league=${assignDialog?.league || 'CL'}`),
    enabled: !!assignDialog,
  });
  const upcomingMatches = (upcomingData as any)?.data ?? [];

  const assignMutation = useMutation({
    mutationFn: (data: { id: string; homeTeam: string; awayTeam: string; homeTeamCrest?: string | null; awayTeamCrest?: string | null; footballMatchId?: string; round?: number }) =>
      adminPost(`/tournaments/${data.id}/assign-match`, data),
    onSuccess: () => {
      setResult({ type: 'success', message: 'Match assigned to round' });
      setAssignDialog(null); setAssignSelected(null); setAssignHome(''); setAssignAway('');
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' }),
  });

  const resolveMutation = useMutation({
    mutationFn: ({ id, result }: { id: string; result: string }) =>
      adminPost(`/tournaments/${id}/resolve-match`, { result }),
    onSuccess: () => {
      setResult({ type: 'success', message: 'Round resolved' });
      setResolveDialog(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' }),
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: string }) =>
      adminPost(`/tournaments/${id}/${action}`),
    onSuccess: (_, { action }) => {
      setResult({ type: 'success', message: `Tournament ${action} successful` });
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
      setConfirmAction(null);
    },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {result && (
        <Alert severity={result.type} onClose={() => setResult(null)} sx={{ mb: 1 }}>
          {result.message}
        </Alert>
      )}

      {/* Create Tournament */}
      <Card sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Create Tournament</Typography>
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
                <Select value={sport} onChange={(e) => setSport(e.target.value)} label="Sport">
                  {SPORT_OPTIONS.map(s => (
                    <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small">
                <InputLabel>League</InputLabel>
                <Select value={league} onChange={(e) => setLeague(e.target.value)} label="League">
                  {LEAGUE_OPTIONS.map(l => (
                    <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
          <FormControl size="small">
            <InputLabel>Size</InputLabel>
            <Select value={size} onChange={(e) => setSize(Number(e.target.value))} label="Size">
              <MenuItem value={8}>8 players</MenuItem>
              <MenuItem value={16}>16 players</MenuItem>
              <MenuItem value={32}>32 players</MenuItem>
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
          <Button
            variant="contained"
            onClick={() => createMutation.mutate()}
            disabled={!name || !entryFee || createMutation.isPending}
            sx={{ bgcolor: '#4ADE80', color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#22C55E' } }}
          >
            {createMutation.isPending ? <CircularProgress size={20} /> : 'Create Tournament'}
          </Button>
        </Box>
        {entryFee && (
          <Typography variant="caption" color="text.secondary">
            Prize pool: ${(parseFloat(entryFee) * size * 0.95).toFixed(2)} USDC (after 5% fee) for {size} players
          </Typography>
        )}
      </Card>

      {/* Tournament List */}
      <Card sx={{ p: 2.5 }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
          Tournaments ({tournaments.length})
        </Typography>

        {isLoading && <CircularProgress size={24} />}

        {tournaments.length === 0 && !isLoading && (
          <Typography color="text.secondary">No tournaments yet</Typography>
        )}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tournaments.map((t) => (
            <Box
              key={t.id}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 2,
                p: 1.5,
                bgcolor: 'rgba(255,255,255,0.03)',
                borderRadius: 1,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ flex: 1, minWidth: 200 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                  <Typography variant="body2" fontWeight={600}>{t.name}</Typography>
                  <Chip
                    label={t.status}
                    size="small"
                    sx={{
                      height: 20,
                      fontSize: '0.65rem',
                      fontWeight: 600,
                      bgcolor: `${STATUS_COLORS[t.status] || '#6B7280'}20`,
                      color: STATUS_COLORS[t.status] || '#6B7280',
                    }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {t.tournamentType === 'SPORTS' ? `${t.sport === 'FOOTBALL' ? 'Soccer' : t.sport} · ${t.league}` : t.asset} · ${(Number(t.entryFee) / USDC_DIVISOR).toFixed(2)} entry · {t._count.participants}/{t.size} players · Round {t.currentRound}/{t.totalRounds}
                </Typography>
                {t.scheduledAt && (
                  <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25 }}>
                    Starts: {new Date(t.scheduledAt).toLocaleString()}
                  </Typography>
                )}
              </Box>

              <Typography variant="body2" fontWeight={600} sx={{ color: '#4ADE80' }}>
                ${(Number(t.prizePool) / USDC_DIVISOR).toFixed(2)}
              </Typography>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {t.status === 'REGISTERING' && (
                  <>
                    {t.tournamentType === 'SPORTS' && (
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => { setAssignDialog({ id: t.id, totalRounds: t.totalRounds, league: t.league }); setAssignRound(1); setAssignSelected(null); setAssignHome(''); setAssignAway(''); }}
                        sx={{ fontSize: '0.7rem', bgcolor: '#818CF8', color: '#fff', '&:hover': { bgcolor: '#6366F1' } }}
                      >
                        Setup Matches
                      </Button>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => openEdit(t)}
                      sx={{ fontSize: '0.7rem', borderColor: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', '&:hover': { borderColor: 'rgba(255,255,255,0.3)', bgcolor: 'rgba(255,255,255,0.04)' } }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={() => setConfirmAction({ label: `Start "${t.name}"`, id: t.id, action: 'start' })}
                      disabled={t._count.participants < 2}
                      sx={{ fontSize: '0.7rem', bgcolor: '#F59E0B', color: '#000', '&:hover': { bgcolor: '#D97706' } }}
                    >
                      Start
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setConfirmAction({ label: `Cancel "${t.name}"`, id: t.id, action: 'cancel' })}
                      sx={{ fontSize: '0.7rem' }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {t.status === 'ACTIVE' && (
                  <>
                    {t.tournamentType === 'SPORTS' && (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => { setAssignDialog({ id: t.id, totalRounds: t.totalRounds, league: t.league }); setAssignRound(Math.max(t.currentRound, 1)); setAssignSelected(null); setAssignHome(''); setAssignAway(''); }}
                          sx={{ fontSize: '0.7rem', bgcolor: '#818CF8', color: '#fff', '&:hover': { bgcolor: '#6366F1' } }}
                        >
                          Assign Match
                        </Button>
                        <Button
                          size="small"
                          variant="contained"
                          onClick={() => setResolveDialog({ id: t.id, round: t.currentRound })}
                          sx={{ fontSize: '0.7rem', bgcolor: '#4ADE80', color: '#000', '&:hover': { bgcolor: '#22C55E' } }}
                        >
                          Resolve
                        </Button>
                      </>
                    )}
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => setConfirmAction({ label: `Reset Round ${t.currentRound} of "${t.name}"`, id: t.id, action: 'reset-round' })}
                      sx={{ fontSize: '0.7rem', borderColor: '#F59E0B', color: '#F59E0B', '&:hover': { borderColor: '#D97706', bgcolor: 'rgba(245,158,11,0.08)' } }}
                    >
                      Reset Round
                    </Button>
                    <Button
                      size="small"
                      color="error"
                      onClick={() => setConfirmAction({ label: `Cancel "${t.name}"`, id: t.id, action: 'cancel' })}
                      sx={{ fontSize: '0.7rem' }}
                    >
                      Cancel
                    </Button>
                  </>
                )}
                {t.winnerWallet && (
                  <Typography variant="caption" color="text.secondary">
                    Winner: {t.winnerWallet.slice(0, 4)}...{t.winnerWallet.slice(-4)}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Card>

      {/* Confirm Dialog */}
      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>{confirmAction?.label}?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => confirmAction && actionMutation.mutate({ id: confirmAction.id, action: confirmAction.action })}
            disabled={actionMutation.isPending}
          >
            {actionMutation.isPending ? <CircularProgress size={18} /> : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Tournament Dialog */}
      <Dialog open={!!editTournament} onClose={() => setEditTournament(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Tournament</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField label="Name" size="small" value={editName} onChange={(e) => setEditName(e.target.value)} />
            <FormControl size="small">
              <InputLabel>Asset</InputLabel>
              <Select value={editAsset} onChange={(e) => setEditAsset(e.target.value)} label="Asset">
                <MenuItem value="BTC">BTC</MenuItem>
                <MenuItem value="ETH">ETH</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Entry Fee (USDC)" size="small" type="number" value={editEntryFee} onChange={(e) => setEditEntryFee(e.target.value)} />
            <FormControl size="small">
              <InputLabel>Size</InputLabel>
              <Select value={editSize} onChange={(e) => setEditSize(Number(e.target.value))} label="Size">
                <MenuItem value={8}>8 players</MenuItem>
                <MenuItem value={16}>16 players</MenuItem>
                <MenuItem value={32}>32 players</MenuItem>
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
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditTournament(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => updateMutation.mutate()}
            disabled={!editName || !editEntryFee || updateMutation.isPending}
            sx={{ bgcolor: '#4ADE80', color: '#000', fontWeight: 700, '&:hover': { bgcolor: '#22C55E' } }}
          >
            {updateMutation.isPending ? <CircularProgress size={18} /> : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Assign Match Dialog */}
      <Dialog open={!!assignDialog} onClose={() => setAssignDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          Assign Match —
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <Select value={assignRound} onChange={(e) => { setAssignRound(Number(e.target.value)); setAssignSelected(null); }}>
              {Array.from({ length: assignDialog?.totalRounds || 1 }, (_, i) => i + 1).map(r => (
                <MenuItem key={r} value={r}>Round {r}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogTitle>
        <DialogContent>
          {upcomingLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}><CircularProgress size={24} /></Box>
          ) : upcomingMatches.length > 0 ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, pt: 1 }}>
              {upcomingMatches.map((m: any) => {
                const selected = assignSelected === m.id;
                const kickoff = new Date(m.kickoff).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
                return (
                  <Box
                    key={m.id}
                    onClick={() => setAssignSelected(m.id)}
                    sx={{
                      display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: 1, cursor: 'pointer',
                      bgcolor: selected ? 'rgba(129,140,248,0.12)' : 'rgba(255,255,255,0.03)',
                      border: selected ? '1px solid rgba(129,140,248,0.4)' : '1px solid transparent',
                      '&:hover': { bgcolor: selected ? 'rgba(129,140,248,0.15)' : 'rgba(255,255,255,0.06)' },
                    }}
                  >
                    {m.homeTeamCrest && <Box component="img" src={m.homeTeamCrest} alt="" sx={{ width: 24, height: 24, objectFit: 'contain' }} />}
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>{m.homeTeam} vs {m.awayTeam}</Typography>
                    {m.awayTeamCrest && <Box component="img" src={m.awayTeamCrest} alt="" sx={{ width: 24, height: 24, objectFit: 'contain' }} />}
                    <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>{kickoff}</Typography>
                  </Box>
                );
              })}
            </Box>
          ) : (
            <Box sx={{ py: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>No upcoming matches found. Enter manually:</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Home Team" size="small" value={assignHome} onChange={(e) => setAssignHome(e.target.value)} placeholder="Real Madrid" />
                <TextField label="Away Team" size="small" value={assignAway} onChange={(e) => setAssignAway(e.target.value)} placeholder="Bayern Munich" />
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssignDialog(null)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={(!assignSelected && (!assignHome || !assignAway)) || assignMutation.isPending}
            onClick={() => {
              if (!assignDialog) return;
              if (assignSelected) {
                const m = upcomingMatches.find((x: any) => x.id === assignSelected);
                if (m) assignMutation.mutate({ id: assignDialog.id, homeTeam: m.homeTeam, awayTeam: m.awayTeam, homeTeamCrest: m.homeTeamCrest, awayTeamCrest: m.awayTeamCrest, footballMatchId: m.id, round: assignRound } as any);
              } else {
                assignMutation.mutate({ id: assignDialog.id, homeTeam: assignHome, awayTeam: assignAway, round: assignRound } as any);
              }
            }}
            sx={{ bgcolor: '#818CF8', '&:hover': { bgcolor: '#6366F1' } }}
          >
            {assignMutation.isPending ? <CircularProgress size={18} /> : 'Assign'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Resolve Match Dialog */}
      <Dialog open={!!resolveDialog} onClose={() => setResolveDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Resolve Round {resolveDialog?.round}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>Select the match result:</Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {['HOME', 'DRAW', 'AWAY'].map((r) => (
              <Button
                key={r}
                fullWidth
                variant="contained"
                disabled={resolveMutation.isPending}
                onClick={() => resolveDialog && resolveMutation.mutate({ id: resolveDialog.id, result: r })}
                sx={{
                  bgcolor: r === 'HOME' ? '#4ADE80' : r === 'AWAY' ? '#F87171' : '#FBBF24',
                  color: '#000', fontWeight: 700, fontSize: '0.85rem',
                  '&:hover': { filter: 'brightness(0.9)' },
                }}
              >
                {r}
              </Button>
            ))}
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
}
