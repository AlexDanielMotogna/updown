'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Button, TextField, Alert, Dialog,
  DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPost } from '../lib/adminApi';

function ActionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card sx={{ p: 2, border: '1px solid rgba(248,113,113,0.2)' }}>
      <Typography variant="subtitle2">{title}</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{description}</Typography>
      {children}
    </Card>
  );
}

export function ManualActions() {
  const qc = useQueryClient();
  const [confirmAction, setConfirmAction] = useState<{ label: string; fn: () => Promise<unknown> } | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Pool ID inputs
  const [resolveId, setResolveId] = useState('');
  const [refundId, setRefundId] = useState('');
  const [closeId, setCloseId] = useState('');

  // Create pool inputs
  const [asset, setAsset] = useState('BTC');
  const [intervalKey, setIntervalKey] = useState('5m');

  const execMutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: (data) => {
      setResult({ type: 'success', message: JSON.stringify(data, null, 2) });
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-health'] });
    },
    onError: (err: Error) => {
      setResult({ type: 'error', message: err.message });
      setConfirmAction(null);
    },
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Alert severity="warning" variant="outlined">
        Danger Zone — These actions are irreversible. A confirmation dialog is shown before each action.
      </Alert>

      {result && (
        <Alert severity={result.type} onClose={() => setResult(null)} sx={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}>
          {result.message}
        </Alert>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <ActionCard title="Force Resolve Pool" description="Resolve a stuck JOINING/ACTIVE pool using current market price">
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" placeholder="Pool UUID" value={resolveId} onChange={e => setResolveId(e.target.value)} fullWidth />
            <Button variant="contained" color="warning" disabled={!resolveId}
              onClick={() => setConfirmAction({ label: `Resolve pool ${resolveId.slice(0, 8)}...`, fn: () => adminPost('/actions/resolve-pool', { poolId: resolveId }) })}>
              Resolve
            </Button>
          </Box>
        </ActionCard>

        <ActionCard title="Force Refund Pool" description="Resolve with synthetic prices and auto-refund all bets">
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" placeholder="Pool UUID" value={refundId} onChange={e => setRefundId(e.target.value)} fullWidth />
            <Button variant="contained" color="error" disabled={!refundId}
              onClick={() => setConfirmAction({ label: `Refund pool ${refundId.slice(0, 8)}...`, fn: () => adminPost('/actions/refund-pool', { poolId: refundId }) })}>
              Refund
            </Button>
          </Box>
        </ActionCard>

        <ActionCard title="Force Close Pool" description="Close a CLAIMABLE pool and reclaim rent (all bets must be claimed)">
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField size="small" placeholder="Pool UUID" value={closeId} onChange={e => setCloseId(e.target.value)} fullWidth />
            <Button variant="contained" color="error" disabled={!closeId}
              onClick={() => setConfirmAction({ label: `Close pool ${closeId.slice(0, 8)}...`, fn: () => adminPost('/actions/close-pool', { poolId: closeId }) })}>
              Close
            </Button>
          </Box>
        </ActionCard>

        <ActionCard title="Restart Scheduler" description="Stop and restart all scheduler cron jobs">
          <Button variant="contained" color="warning"
            onClick={() => setConfirmAction({ label: 'Restart scheduler', fn: () => adminPost('/actions/restart-scheduler') })}>
            Restart Scheduler
          </Button>
        </ActionCard>

        <ActionCard title="Create Pool" description="Manually create a new pool (admin-only, replaces /api/pools/test)">
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Asset</InputLabel>
              <Select value={asset} onChange={e => setAsset(e.target.value)} label="Asset">
                <MenuItem value="BTC">BTC</MenuItem>
                <MenuItem value="ETH">ETH</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Interval</InputLabel>
              <Select value={intervalKey} onChange={e => setIntervalKey(e.target.value)} label="Interval">
                <MenuItem value="1m">1m</MenuItem>
                <MenuItem value="5m">5m</MenuItem>
                <MenuItem value="15m">15m</MenuItem>
                <MenuItem value="1h">1h</MenuItem>
              </Select>
            </FormControl>
            <Button variant="contained"
              onClick={() => setConfirmAction({ label: `Create ${asset} ${intervalKey} pool`, fn: () => adminPost('/actions/create-pool', { asset, intervalKey }) })}>
              Create
            </Button>
          </Box>
        </ActionCard>
      </Box>

      <Dialog open={!!confirmAction} onClose={() => setConfirmAction(null)}>
        <DialogTitle>Confirm Action</DialogTitle>
        <DialogContent>
          <Typography>Are you sure you want to: <strong>{confirmAction?.label}</strong>?</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmAction(null)}>Cancel</Button>
          <Button variant="contained" color="error" disabled={execMutation.isPending}
            onClick={() => confirmAction && execMutation.mutate(confirmAction.fn)}>
            {execMutation.isPending ? 'Executing...' : 'Confirm'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
