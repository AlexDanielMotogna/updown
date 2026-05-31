'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Button, Chip, Alert, Table, TableBody, TableCell,
  TableHead, TableRow, CircularProgress, Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';

type StuckPool = {
  id: string;
  matchId: string | null;
  homeTeam: string | null;
  league: string | null;
  subcategory: string | null;
  startTime: string;
  status: string;
  betCount: number;
  gammaDelisted: boolean | null;
  hoursOverdue: number;
};

type StuckResponse = {
  success: true;
  data: { pools: StuckPool[]; totalCount: number; truncated: boolean };
};

export function StuckPmPools() {
  const qc = useQueryClient();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Default minHoursOverdue=0 to show everything that's past kickoff.
  // Admin can use the sweep button (cron also runs every 15m) to auto-cancel
  // 0-bet pools past PM_SWEEP_GRACE_HOURS (default 48h).
  const { data, isLoading, refetch, isFetching } = useQuery<StuckResponse>({
    queryKey: ['admin-stuck-pm-pools'],
    queryFn: () => adminFetch<StuckResponse>('/actions/stuck-pm-pools?minHoursOverdue=0'),
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ poolId, reason }: { poolId: string; reason: string }) =>
      adminPost('/actions/cancel-pm-pool', { poolId, reason }),
    onSettled: () => {
      setCancellingId(null);
      qc.invalidateQueries({ queryKey: ['admin-stuck-pm-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
    },
  });

  const sweepMutation = useMutation({
    mutationFn: () => adminPost('/actions/sweep-pm-pools'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-stuck-pm-pools'] }),
  });

  const pools = data?.data.pools ?? [];
  const totalCount = data?.data.totalCount ?? 0;
  const truncated = data?.data.truncated ?? false;

  return (
    <Card sx={{ p: 2, border: `1px solid ${t.border.medium}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box>
          <Typography variant="subtitle2">Stuck Polymarket Pools</Typography>
          <Typography variant="body2" color="text.secondary">
            PM pools past kickoff still in JOINING/ACTIVE. UMA can stall 24–72h after market end; markets can also be delisted from Gamma. The sweep auto-cancels 0-bet pools past the grace window — pools with bets need a manual call here.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            startIcon={<RefreshIcon />}
            onClick={() => refetch()}
            disabled={isFetching}
          >
            Refresh
          </Button>
          <Button
            size="small"
            variant="outlined"
            color="warning"
            startIcon={<CleaningServicesIcon />}
            onClick={() => sweepMutation.mutate()}
            disabled={sweepMutation.isPending}
          >
            {sweepMutation.isPending ? 'Sweeping…' : 'Run sweep now'}
          </Button>
        </Box>
      </Box>

      {sweepMutation.isError && (
        <Alert severity="error" sx={{ mb: 1 }}>{(sweepMutation.error as Error).message}</Alert>
      )}
      {cancelMutation.isError && (
        <Alert severity="error" sx={{ mb: 1 }}>{(cancelMutation.error as Error).message}</Alert>
      )}

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={20} /></Box>
      ) : pools.length === 0 ? (
        <Alert severity="success" variant="outlined">No stuck PM pools — all caught up.</Alert>
      ) : (
        <>
          <Table size="small" sx={{ '& td, & th': { borderColor: t.border.subtle } }}>
            <TableHead>
              <TableRow>
                <TableCell>Question</TableCell>
                <TableCell>League</TableCell>
                <TableCell align="right">Bets</TableCell>
                <TableCell align="right">Hours overdue</TableCell>
                <TableCell>Gamma</TableCell>
                <TableCell align="right">Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pools.map(p => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ maxWidth: 380 }}>
                    <Tooltip title={`${p.id} · matchId=${p.matchId ?? '—'}`}>
                      <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.homeTeam || '(no question)'}
                      </Typography>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={p.league || '—'} />
                    {p.subcategory && (
                      <Chip size="small" label={p.subcategory} variant="outlined" sx={{ ml: 0.5 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {p.betCount === 0
                      ? <Typography variant="body2" color="text.secondary">0</Typography>
                      : <Chip size="small" color="warning" label={`${p.betCount} bets`} />}
                  </TableCell>
                  <TableCell align="right">{p.hoursOverdue}h</TableCell>
                  <TableCell>
                    {p.gammaDelisted === true
                      ? <Chip size="small" color="error" label="DELISTED" />
                      : p.gammaDelisted === false
                        ? <Chip size="small" color="default" label="exists" variant="outlined" />
                        : <Chip size="small" label="—" variant="outlined" />}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      color={p.betCount > 0 ? 'error' : 'warning'}
                      disabled={cancellingId === p.id}
                      onClick={() => {
                        const reason = p.gammaDelisted ? 'gamma-delisted' : `admin-${p.hoursOverdue}h-overdue`;
                        setCancellingId(p.id);
                        cancelMutation.mutate({ poolId: p.id, reason });
                      }}
                    >
                      {cancellingId === p.id ? 'Cancelling…' : (p.betCount > 0 ? 'Cancel + refund' : 'Cancel')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {truncated && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
              Showing 20 of {totalCount} — run sweep to bulk-cancel 0-bet pools, then refresh.
            </Typography>
          )}
        </>
      )}
    </Card>
  );
}
