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
  status: string;
  currentRound: number;
  totalRounds: number;
  prizePool: string;
  winnerWallet: string | null;
  scheduledAt: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  _count: { participants: number };
}

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

  // Create form
  const [name, setName] = useState('');
  const [asset, setAsset] = useState('BTC');
  const [entryFee, setEntryFee] = useState('');
  const [size, setSize] = useState(8);
  const [matchDuration, setMatchDuration] = useState(300);
  const [predictionWindow, setPredictionWindow] = useState(300);
  const [scheduledAt, setScheduledAt] = useState('');

  // Edit schedule
  const [editScheduleId, setEditScheduleId] = useState<string | null>(null);
  const [editScheduleValue, setEditScheduleValue] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tournaments'],
    queryFn: () => adminFetch<{ data: Tournament[] }>('/tournaments'),
    refetchInterval: 10_000,
  });

  const tournaments = (data as { data: Tournament[] })?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => adminPost('/tournaments/create', {
      name,
      asset,
      entryFee: Math.round(parseFloat(entryFee) * USDC_DIVISOR),
      size,
      matchDuration,
      predictionWindow,
      scheduledAt: scheduledAt || undefined,
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

  const scheduleMutation = useMutation({
    mutationFn: ({ id, scheduledAt: val }: { id: string; scheduledAt: string | null }) =>
      adminPost(`/tournaments/${id}/update-schedule`, { scheduledAt: val }),
    onSuccess: () => {
      setResult({ type: 'success', message: 'Schedule updated' });
      setEditScheduleId(null);
      qc.invalidateQueries({ queryKey: ['admin-tournaments'] });
    },
    onError: (err) => {
      setResult({ type: 'error', message: err instanceof Error ? err.message : 'Failed' });
    },
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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr 1fr' }, gap: 2, mb: 2 }}>
          <TextField
            label="Name"
            size="small"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="BTC Showdown #1"
          />
          <FormControl size="small">
            <InputLabel>Asset</InputLabel>
            <Select value={asset} onChange={(e) => setAsset(e.target.value)} label="Asset">
              <MenuItem value="BTC">BTC</MenuItem>
              <MenuItem value="ETH">ETH</MenuItem>
              <MenuItem value="SOL">SOL</MenuItem>
            </Select>
          </FormControl>
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
                  {t.asset} · ${(Number(t.entryFee) / USDC_DIVISOR).toFixed(2)} entry · {t._count.participants}/{t.size} players · Round {t.currentRound}/{t.totalRounds}
                </Typography>
                {editScheduleId === t.id ? (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                    <TextField
                      size="small"
                      type="datetime-local"
                      value={editScheduleValue}
                      onChange={(e) => setEditScheduleValue(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      sx={{ '& .MuiInputBase-root': { height: 28, fontSize: '0.7rem' } }}
                    />
                    <Button size="small" sx={{ fontSize: '0.65rem', minWidth: 0 }} onClick={() => scheduleMutation.mutate({ id: t.id, scheduledAt: editScheduleValue || null })}>
                      Save
                    </Button>
                    <Button size="small" sx={{ fontSize: '0.65rem', minWidth: 0 }} onClick={() => setEditScheduleId(null)}>
                      X
                    </Button>
                  </Box>
                ) : (
                  <Typography
                    variant="caption"
                    sx={{ color: 'text.secondary', cursor: 'pointer', '&:hover': { color: '#fff' }, display: 'block', mt: 0.25 }}
                    onClick={() => { setEditScheduleId(t.id); setEditScheduleValue(t.scheduledAt ? new Date(t.scheduledAt).toISOString().slice(0, 16) : ''); }}
                  >
                    {t.scheduledAt ? `Starts: ${new Date(t.scheduledAt).toLocaleString()}` : '+ Set start time'}
                  </Typography>
                )}
              </Box>

              <Typography variant="body2" fontWeight={600} sx={{ color: '#4ADE80' }}>
                ${(Number(t.prizePool) / USDC_DIVISOR).toFixed(2)}
              </Typography>

              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {t.status === 'REGISTERING' && (
                  <>
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
    </Box>
  );
}
