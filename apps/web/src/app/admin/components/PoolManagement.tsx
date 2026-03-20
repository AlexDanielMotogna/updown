'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Chip, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';

interface PoolRow {
  id: string;
  asset: string;
  interval: string;
  status: string;
  endTime: string;
  totalUp: string;
  totalDown: string;
  betCount: number;
  stuckMinutes?: number;
}

interface PoolDetail extends PoolRow {
  poolId: string;
  strikePrice: string | null;
  finalPrice: string | null;
  winner: string | null;
  bets: Array<{ id: string; walletAddress: string; side: string; amount: string; claimed: boolean }>;
}

const statusColors: Record<string, string> = {
  JOINING: '#F59E0B',
  ACTIVE: '#3B82F6',
  RESOLVED: '#8B5CF6',
  CLAIMABLE: '#22C55E',
};

export function PoolManagement() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);

  const { data: stuckData, isLoading: stuckLoading } = useQuery({
    queryKey: ['admin-stuck-pools'],
    queryFn: () => adminFetch<{ data: PoolRow[] }>('/pools/stuck'),
    refetchInterval: 15000,
  });

  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ['admin-pools', statusFilter],
    queryFn: () => adminFetch<{ data: PoolRow[]; meta: { total: number } }>(`/pools?limit=100${statusFilter ? `&status=${statusFilter}` : ''}`),
    refetchInterval: 15000,
  });

  const { data: detailData } = useQuery({
    queryKey: ['admin-pool-detail', selectedPoolId],
    queryFn: () => adminFetch<{ data: PoolDetail }>(`/pools/${selectedPoolId}`),
    enabled: !!selectedPoolId,
  });

  const resolveMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/resolve-pool', { poolId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pools'] }); qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] }); },
  });

  const refundMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/refund-pool', { poolId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-pools'] }); qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] }); },
  });

  const stuckPools = stuckData?.data ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {stuckLoading ? <CircularProgress size={20} /> : stuckPools.length > 0 ? (
        <Alert severity="error" variant="filled">
          {stuckPools.length} stuck pool(s) detected — past endTime but still JOINING/ACTIVE
        </Alert>
      ) : (
        <Alert severity="success" variant="outlined">No stuck pools</Alert>
      )}

      {stuckPools.length > 0 && (
        <Card sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Stuck Pools</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Asset</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Stuck For</TableCell>
                  <TableCell>Bets</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stuckPools.map(p => (
                  <TableRow key={p.id}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id.slice(0, 8)}...</TableCell>
                    <TableCell>{p.asset}</TableCell>
                    <TableCell><Chip label={p.status} size="small" sx={{ bgcolor: statusColors[p.status] + '22', color: statusColors[p.status] }} /></TableCell>
                    <TableCell>{p.stuckMinutes}m</TableCell>
                    <TableCell>{p.betCount}</TableCell>
                    <TableCell>
                      <Button size="small" color="warning" onClick={() => resolveMut.mutate(p.id)} disabled={resolveMut.isPending}>Resolve</Button>
                      <Button size="small" color="error" onClick={() => refundMut.mutate(p.id)} disabled={refundMut.isPending} sx={{ ml: 1 }}>Refund</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography variant="subtitle2">All Pools</Typography>
        <FormControl size="small" sx={{ minWidth: 140 }}>
          <InputLabel>Status</InputLabel>
          <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
            <MenuItem value="">All</MenuItem>
            <MenuItem value="JOINING">JOINING</MenuItem>
            <MenuItem value="ACTIVE">ACTIVE</MenuItem>
            <MenuItem value="RESOLVED">RESOLVED</MenuItem>
            <MenuItem value="CLAIMABLE">CLAIMABLE</MenuItem>
          </Select>
        </FormControl>
      </Box>

      {poolsLoading ? <CircularProgress /> : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Asset</TableCell>
                <TableCell>Interval</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>End Time</TableCell>
                <TableCell>Up / Down</TableCell>
                <TableCell>Bets</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(poolsData?.data ?? []).map(p => (
                <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => setSelectedPoolId(p.id)}>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>{p.id.slice(0, 8)}...</TableCell>
                  <TableCell>{p.asset}</TableCell>
                  <TableCell>{p.interval}</TableCell>
                  <TableCell><Chip label={p.status} size="small" sx={{ bgcolor: (statusColors[p.status] || '#666') + '22', color: statusColors[p.status] || '#666' }} /></TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{new Date(p.endTime).toLocaleString()}</TableCell>
                  <TableCell>{p.totalUp} / {p.totalDown}</TableCell>
                  <TableCell>{p.betCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <Dialog open={!!selectedPoolId} onClose={() => setSelectedPoolId(null)} maxWidth="md" fullWidth>
        <DialogTitle>Pool Detail</DialogTitle>
        <DialogContent>
          {detailData?.data && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body2"><strong>ID:</strong> {detailData.data.id}</Typography>
              <Typography variant="body2"><strong>Pool ID:</strong> {detailData.data.poolId}</Typography>
              <Typography variant="body2"><strong>Asset:</strong> {detailData.data.asset} | <strong>Interval:</strong> {detailData.data.interval}</Typography>
              <Typography variant="body2"><strong>Status:</strong> {detailData.data.status} | <strong>Winner:</strong> {detailData.data.winner ?? 'N/A'}</Typography>
              <Typography variant="body2"><strong>Strike:</strong> {detailData.data.strikePrice ?? 'N/A'} | <strong>Final:</strong> {detailData.data.finalPrice ?? 'N/A'}</Typography>
              {detailData.data.bets.length > 0 && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 1 }}>Bets ({detailData.data.bets.length})</Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Wallet</TableCell>
                        <TableCell>Side</TableCell>
                        <TableCell>Amount</TableCell>
                        <TableCell>Claimed</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {detailData.data.bets.map(b => (
                        <TableRow key={b.id}>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{b.walletAddress.slice(0, 8)}...{b.walletAddress.slice(-4)}</TableCell>
                          <TableCell><Chip label={b.side} size="small" sx={{ bgcolor: b.side === 'UP' ? '#22C55E22' : '#F8717122', color: b.side === 'UP' ? '#22C55E' : '#F87171' }} /></TableCell>
                          <TableCell>{b.amount}</TableCell>
                          <TableCell>{b.claimed ? 'Yes' : 'No'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedPoolId(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
