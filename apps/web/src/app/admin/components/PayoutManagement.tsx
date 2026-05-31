'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Chip, Alert, CircularProgress, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField, Stack,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import ReplayIcon from '@mui/icons-material/Replay';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost, adminPostSSE } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';

interface WalletBalance {
  solLamports: string;
  solBalance: string;
  usdcRaw: string;
  usdcBalance: string;
}

interface PayoutStats {
  last24h: { paid: number; failed: number; successRate: number | null };
  pending: number;
  failedOutstanding: number;
}

interface QueueRow {
  id: string;
  asset: string;
  poolType: string;
  winner: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  pendingCount: number;
  updatedAt: string;
}

interface FailedRow {
  id: string;
  poolId: string;
  walletAddress: string;
  side: string;
  amount: string;
  attempts: number;
  lastAttemptedAt: string | null;
  pool: { asset: string; poolType: string; winner: string | null; homeTeam?: string | null; awayTeam?: string | null };
}

interface MigrationPreview {
  withinDays: number;
  totalBets: number;
  totalPools: number;
  totalAmountUsdcRaw: string;
  cutoff: string;
}

interface MigrationEvent {
  type: 'start' | 'pool' | 'pool_error' | 'done' | 'error';
  poolId?: string;
  asset?: string;
  attempted?: number;
  succeeded?: number;
  failed?: number;
  skipped?: number;
  totalPools?: number;
  withinDays?: number;
  error?: string;
}

const fmtUsdc = (raw: string | bigint) => (Number(raw) / 1_000_000).toFixed(2);
const matchLabel = (pool: { homeTeam?: string | null; awayTeam?: string | null; asset: string }) =>
  pool.homeTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.asset;

function StatCard({ label, value, color, unit }: { label: string; value: string | number; color?: string; unit?: string }) {
  return (
    <Card sx={{ p: 2, flex: 1, minWidth: 160, bgcolor: t.bg.surface }}>
      <Typography variant="caption" sx={{ color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.65rem' }}>
        {label}
      </Typography>
      <Typography variant="h4" sx={{ color: color ?? t.text.primary, fontWeight: 700, mt: 0.5 }}>
        {value}
        {unit && <Typography component="span" variant="body2" sx={{ color: t.text.tertiary, ml: 0.5, fontWeight: 400 }}>{unit}</Typography>}
      </Typography>
    </Card>
  );
}

export function PayoutManagement() {
  const qc = useQueryClient();
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationDays, setMigrationDays] = useState<number>(30);
  const [migrationLogs, setMigrationLogs] = useState<MigrationEvent[]>([]);
  const [migrationRunning, setMigrationRunning] = useState(false);

  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance } = useQuery({
    queryKey: ['admin-wallet-balance'],
    queryFn: () => adminFetch<{ data: WalletBalance }>('/wallet/balance'),
    refetchInterval: 60_000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin-payout-stats'],
    queryFn: () => adminFetch<{ data: PayoutStats }>('/payouts/stats'),
    refetchInterval: 30_000,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['admin-payout-queue'],
    queryFn: () => adminFetch<{ data: QueueRow[] }>('/payouts/queue'),
    refetchInterval: 30_000,
  });

  const { data: failedData, isLoading: failedLoading } = useQuery({
    queryKey: ['admin-payout-failed'],
    queryFn: () => adminFetch<{ data: FailedRow[] }>('/payouts/failed'),
    refetchInterval: 30_000,
  });

  const retryMut = useMutation({
    mutationFn: (betId: string) => adminPost(`/payouts/${betId}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payout-failed'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-stats'] });
    },
  });

  const previewMut = useMutation({
    mutationFn: (days: number) =>
      adminFetch<{ data: MigrationPreview }>(`/payouts/migration/preview?withinDays=${days}`),
  });

  const runMigration = async () => {
    setMigrationRunning(true);
    setMigrationLogs([]);
    try {
      await adminPostSSE(
        '/payouts/migration',
        { withinDays: migrationDays, confirm: 'CONFIRM_MIGRATION' },
        (event) => setMigrationLogs(prev => [...prev, event as unknown as MigrationEvent]),
      );
    } catch (e) {
      setMigrationLogs(prev => [...prev, { type: 'error', error: (e as Error).message }]);
    } finally {
      setMigrationRunning(false);
      qc.invalidateQueries({ queryKey: ['admin-payout-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-failed'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-stats'] });
    }
  };

  // Wallet health colouring - same thresholds as the strategy doc.
  const sol = balanceData ? parseFloat(balanceData.data.solBalance) : 0;
  const walletColor = sol < 0.1 ? t.error : sol < 0.5 ? t.warning : t.gain;
  const balance = balanceData?.data;

  const stats = statsData?.data;
  const queue = queueData?.data ?? [];
  const failed = failedData?.data ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* 1. Authority wallet monitor */}
      <Card sx={{ p: 2.5, bgcolor: t.bg.surface, borderLeft: `4px solid ${walletColor}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>Payout Authority Wallet</Typography>
          <Button size="small" startIcon={<RefreshIcon />} onClick={() => refetchBalance()} sx={{ color: t.text.tertiary }}>
            Refresh
          </Button>
        </Box>
        {balanceLoading ? <CircularProgress size={20} /> : balance ? (
          <Stack direction="row" spacing={4}>
            <Box>
              <Typography variant="caption" sx={{ color: t.text.tertiary }}>SOL (gas + ATA rent)</Typography>
              <Typography variant="h5" fontWeight={700} sx={{ color: walletColor }}>
                {balance.solBalance}
                <Typography component="span" variant="body2" sx={{ color: t.text.tertiary, ml: 1 }}>SOL</Typography>
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" sx={{ color: t.text.tertiary }}>USDC (fee wallet)</Typography>
              <Typography variant="h5" fontWeight={700}>
                ${balance.usdcBalance}
              </Typography>
            </Box>
            {sol < 0.5 && (
              <Alert severity={sol < 0.1 ? 'error' : 'warning'} sx={{ flex: 1 }}>
                {sol < 0.1
                  ? 'Critical: payout authority cannot afford gas. Auto-payout will fail until refunded.'
                  : 'Warning: payout authority running low. Top up to avoid disruption.'}
              </Alert>
            )}
          </Stack>
        ) : null}
      </Card>

      {/* 2. Stats row */}
      {stats && (
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          <StatCard label="Paid (last 24h)" value={stats.last24h.paid} color={t.gain} />
          <StatCard label="Failed (last 24h)" value={stats.last24h.failed} color={stats.last24h.failed > 0 ? t.error : t.text.primary} />
          <StatCard label="Success rate (24h)" value={stats.last24h.successRate ?? '-'} unit={stats.last24h.successRate !== null ? '%' : undefined} />
          <StatCard label="Pending (now)" value={stats.pending} />
          <StatCard label="Failed outstanding" value={stats.failedOutstanding} color={stats.failedOutstanding > 0 ? t.error : t.text.primary} />
        </Box>
      )}

      {/* 3. Failed payouts */}
      <Card sx={{ p: 2.5, bgcolor: t.bg.surface }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Failed payouts {failed.length > 0 && <Chip label={failed.length} size="small" sx={{ ml: 1, bgcolor: t.error, color: 'white' }} />}
          </Typography>
        </Box>
        {failedLoading ? <CircularProgress size={20} /> : failed.length === 0 ? (
          <Typography variant="body2" sx={{ color: t.text.tertiary, py: 1 }}>No failed payouts - all winners paid cleanly.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>Wallet</TableCell>
                  <TableCell>Side</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell align="right">Attempts</TableCell>
                  <TableCell>Last try</TableCell>
                  <TableCell align="right">Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failed.map(bet => (
                  <TableRow key={bet.id}>
                    <TableCell>{matchLabel(bet.pool)}</TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                      {bet.walletAddress.slice(0, 4)}…{bet.walletAddress.slice(-4)}
                    </TableCell>
                    <TableCell>{bet.side}</TableCell>
                    <TableCell align="right">${fmtUsdc(bet.amount)}</TableCell>
                    <TableCell align="right">{bet.attempts}</TableCell>
                    <TableCell>{bet.lastAttemptedAt ? new Date(bet.lastAttemptedAt).toLocaleString() : '-'}</TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        startIcon={<ReplayIcon />}
                        disabled={retryMut.isPending}
                        onClick={() => retryMut.mutate(bet.id)}
                      >
                        Retry
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* 4. Pending queue */}
      <Card sx={{ p: 2.5, bgcolor: t.bg.surface }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1.5 }}>
          Pending queue {queue.length > 0 && <Chip label={`${queue.length} pool(s)`} size="small" sx={{ ml: 1, bgcolor: t.warning, color: 'white' }} />}
        </Typography>
        {queueLoading ? <CircularProgress size={20} /> : queue.length === 0 ? (
          <Typography variant="body2" sx={{ color: t.text.tertiary, py: 1 }}>Queue empty - no pools waiting on auto-payout.</Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Market</TableCell>
                  <TableCell>Winner</TableCell>
                  <TableCell align="right">Pending bets</TableCell>
                  <TableCell>Resolved</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {queue.map(pool => (
                  <TableRow key={pool.id}>
                    <TableCell>{matchLabel(pool)}</TableCell>
                    <TableCell><Chip label={pool.winner ?? '-'} size="small" /></TableCell>
                    <TableCell align="right">{pool.pendingCount}</TableCell>
                    <TableCell>{new Date(pool.updatedAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Card>

      {/* 5. Migration runner */}
      <Card sx={{ p: 2.5, bgcolor: t.bg.surface, borderLeft: `4px solid ${t.warning}` }}>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Historical migration</Typography>
        <Typography variant="body2" sx={{ color: t.text.tertiary, mb: 2 }}>
          One-shot job that scans CLAIMABLE pools with a winner from the last N days and pays any
          remaining winning-side bets. Idempotent - safe to re-run.
        </Typography>
        <Button variant="outlined" onClick={() => { setMigrationOpen(true); previewMut.mutate(migrationDays); }}>
          Open migration runner
        </Button>
      </Card>

      <Dialog open={migrationOpen} onClose={() => !migrationRunning && setMigrationOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Run payout migration</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Within last N days"
              type="number"
              size="small"
              value={migrationDays}
              onChange={(e) => setMigrationDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30)))}
              disabled={migrationRunning}
            />
            <Button
              variant="outlined"
              onClick={() => previewMut.mutate(migrationDays)}
              disabled={previewMut.isPending || migrationRunning}
            >
              Refresh dry-run
            </Button>
            {previewMut.data && (
              <Alert severity="info">
                Would pay <strong>{previewMut.data.data.totalBets}</strong> bet(s)
                across <strong>{previewMut.data.data.totalPools}</strong> pool(s) -
                total <strong>${fmtUsdc(previewMut.data.data.totalAmountUsdcRaw)}</strong>.
              </Alert>
            )}
            {migrationLogs.length > 0 && (
              <Box sx={{ maxHeight: 260, overflow: 'auto', bgcolor: t.bg.app, p: 1.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.75rem' }}>
                {migrationLogs.map((ev, i) => (
                  <Box key={i} sx={{ color: ev.type === 'error' || ev.type === 'pool_error' ? t.error : ev.type === 'done' ? t.gain : t.text.secondary }}>
                    [{ev.type}] {JSON.stringify(ev)}
                  </Box>
                ))}
              </Box>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMigrationOpen(false)} disabled={migrationRunning}>Close</Button>
          <Button
            variant="contained"
            color="warning"
            onClick={runMigration}
            disabled={migrationRunning || !previewMut.data || previewMut.data.data.totalBets === 0}
          >
            {migrationRunning ? 'Running…' : 'Execute migration'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
