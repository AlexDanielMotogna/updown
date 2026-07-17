'use client';

import { useState } from 'react';
import {
  Box, TextField, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import ReplayIcon from '@mui/icons-material/Replay';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost, adminPostSSE } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, AdminDialog, ActionButton, RefreshButton,
  LoadingState, EmptyState, ErrorAlert,
  WalletCell, TimeCell, Body, Meta, Label,
  useMutationFeedback, useToast,
  POLL_MEDIUM_MS, POLL_SLOW_MS,
} from '../ui';

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

export function PayoutManagement() {
  const qc = useQueryClient();
  const toast = useToast();
  const feedback = useMutationFeedback();

  const [migrationOpen, setMigrationOpen] = useState(false);
  const [migrationDays, setMigrationDays] = useState<number>(30);
  const [migrationLogs, setMigrationLogs] = useState<MigrationEvent[]>([]);
  const [migrationRunning, setMigrationRunning] = useState(false);
  // Track which row is currently being retried so we can show a per-row
  // spinner instead of disabling the entire table on the global
  // `retryMut.isPending` (Plan §3.4).
  const [retryingBetId, setRetryingBetId] = useState<string | null>(null);

  const { data: balanceData, isLoading: balanceLoading, refetch: refetchBalance, isFetching: balanceFetching } = useQuery({
    queryKey: ['admin-wallet-balance'],
    queryFn: () => adminFetch<{ data: WalletBalance }>('/wallet/balance'),
    refetchInterval: POLL_SLOW_MS,
  });

  const { data: statsData } = useQuery({
    queryKey: ['admin-payout-stats'],
    queryFn: () => adminFetch<{ data: PayoutStats }>('/payouts/stats'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const { data: queueData, isLoading: queueLoading } = useQuery({
    queryKey: ['admin-payout-queue'],
    queryFn: () => adminFetch<{ data: QueueRow[] }>('/payouts/queue'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const { data: failedData, isLoading: failedLoading } = useQuery({
    queryKey: ['admin-payout-failed'],
    queryFn: () => adminFetch<{ data: FailedRow[] }>('/payouts/failed'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const retryMut = useMutation({
    mutationFn: (betId: string) => adminPost(`/payouts/${betId}/retry`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payout-failed'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-stats'] });
    },
    onSettled: () => setRetryingBetId(null),
  });

  const retryAllMut = useMutation({
    mutationFn: () => adminPost('/payouts/retry-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-payout-failed'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-stats'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-queue'] });
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
      toast.show({ kind: 'success', message: 'Migration finished' });
    } catch (e) {
      setMigrationLogs(prev => [...prev, { type: 'error', error: (e as Error).message }]);
      toast.show({ kind: 'error', message: (e as Error).message, details: e });
    } finally {
      setMigrationRunning(false);
      qc.invalidateQueries({ queryKey: ['admin-payout-queue'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-failed'] });
      qc.invalidateQueries({ queryKey: ['admin-payout-stats'] });
    }
  };

  // Wallet health colouring - same thresholds as the strategy doc.
  const sol = balanceData ? parseFloat(balanceData.data.solBalance) : 0;
  const walletAccent = sol < 0.1 ? t.error : sol < 0.5 ? t.warning : t.gain;
  const balance = balanceData?.data;

  const stats = statsData?.data;
  const queue = queueData?.data ?? [];
  const failed = failedData?.data ?? [];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── 1. Authority wallet monitor ───────────────────────────── */}
      <SectionCard
        accentColor={walletAccent}
        title="Payout authority wallet"
        actions={<RefreshButton onRefresh={() => refetchBalance()} isFetching={balanceFetching} />}
      >
        {balanceLoading ? <LoadingState variant="inline" /> : balance ? (
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
            <Box>
              <Label>SOL (gas + ATA rent)</Label>
              <Box sx={{ fontSize: '1.4rem', fontWeight: 700, color: walletAccent, mt: 0.25 }}>
                {balance.solBalance}
                <Box component="span" sx={{ ml: 1, color: t.text.tertiary, fontSize: '0.75rem', fontWeight: 400 }}>SOL</Box>
              </Box>
            </Box>
            <Box>
              <Label>USDC (fee wallet)</Label>
              <Box sx={{ fontSize: '1.4rem', fontWeight: 700, color: t.text.primary, mt: 0.25 }}>
                ${balance.usdcBalance}
              </Box>
            </Box>
            {sol < 0.5 && (
              <Box sx={{ flex: 1 }}>
                <ErrorAlert
                  title={sol < 0.1 ? 'Authority almost empty' : 'Authority running low'}
                  message={sol < 0.1
                    ? 'Cannot afford gas. Auto-payout will fail until the wallet is topped up.'
                    : 'Top up to avoid disruption before the next batch.'}
                />
              </Box>
            )}
          </Stack>
        ) : null}
      </SectionCard>

      {/* ─── 2. Stats row ──────────────────────────────────────────── */}
      {stats && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2 }}>
          <StatCard label="Paid (24h)" value={stats.last24h.paid} color={t.gain} />
          <StatCard label="Failed (24h)" value={stats.last24h.failed} color={stats.last24h.failed > 0 ? t.error : t.text.primary} />
          <StatCard label="Success rate (24h)" value={stats.last24h.successRate ?? '-'} unit={stats.last24h.successRate !== null ? '%' : undefined} />
          <StatCard label="Pending (now)" value={stats.pending} />
          <StatCard label="Failed outstanding" value={stats.failedOutstanding} color={stats.failedOutstanding > 0 ? t.error : t.text.primary} />
        </Box>
      )}

      {/* ─── 3. Failed payouts ─────────────────────────────────────── */}
      <SectionCard
        title={
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            Failed payouts
            {failed.length > 0 && <StatusChip status="error" label={String(failed.length)} />}
          </Box>
        }
        actions={
          (stats?.failedOutstanding ?? failed.length) > 0 ? (
            <ActionButton
              kind="secondary"
              label="Retry all"
              icon={<ReplayIcon sx={{ fontSize: 14 }} />}
              loading={retryAllMut.isPending}
              onClick={() => {
                const n = stats?.failedOutstanding ?? failed.length;
                if (!window.confirm(`Reset and retry all ${n} failed payout(s)? This clears their failed flag and re-runs auto-claim for every affected pool.`)) return;
                void feedback.run(retryAllMut, undefined, { success: 'Retry queued for all failed payouts' });
              }}
            />
          ) : undefined
        }
      >
        {failedLoading ? (
          <LoadingState variant="block" />
        ) : failed.length === 0 ? (
          <EmptyState variant="success" title="All winners paid cleanly" hint="No failed payouts in the queue. Retries fire automatically on each scheduler tick." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Market</Label></TableCell>
                  <TableCell><Label>Wallet</Label></TableCell>
                  <TableCell><Label>Side</Label></TableCell>
                  <TableCell align="right"><Label>Amount</Label></TableCell>
                  <TableCell align="right"><Label>Attempts</Label></TableCell>
                  <TableCell><Label>Last try</Label></TableCell>
                  <TableCell align="right"><Label>Action</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {failed.map(bet => {
                  const rowBusy = retryingBetId === bet.id && retryMut.isPending;
                  return (
                    <TableRow key={bet.id} hover>
                      <TableCell>{matchLabel(bet.pool)}</TableCell>
                      <TableCell><WalletCell address={bet.walletAddress} /></TableCell>
                      <TableCell>
                        <StatusChip status={bet.side === 'UP' ? 'ok' : bet.side === 'DOWN' ? 'error' : 'warning'} label={bet.side} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>${fmtUsdc(bet.amount)}</TableCell>
                      <TableCell align="right">{bet.attempts}</TableCell>
                      <TableCell><TimeCell value={bet.lastAttemptedAt} mode="relative" /></TableCell>
                      <TableCell align="right">
                        <ActionButton
                          kind="secondary"
                          label="Retry"
                          icon={<ReplayIcon sx={{ fontSize: 14 }} />}
                          loading={rowBusy}
                          onClick={() => {
                            setRetryingBetId(bet.id);
                            void feedback.run(retryMut, bet.id, { success: `Retry queued for ${bet.walletAddress.slice(0, 4)}…${bet.walletAddress.slice(-4)}` });
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* ─── 4. Pending queue ──────────────────────────────────────── */}
      <SectionCard
        title={
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            Pending queue
            {queue.length > 0 && <StatusChip status="warning" label={`${queue.length} pool${queue.length === 1 ? '' : 's'}`} />}
          </Box>
        }
      >
        {queueLoading ? (
          <LoadingState variant="block" />
        ) : queue.length === 0 ? (
          <EmptyState variant="success" title="Queue empty" hint="No pools waiting on auto-payout." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Market</Label></TableCell>
                  <TableCell><Label>Winner</Label></TableCell>
                  <TableCell align="right"><Label>Pending bets</Label></TableCell>
                  <TableCell><Label>Resolved</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {queue.map(pool => (
                  <TableRow key={pool.id} hover>
                    <TableCell>{matchLabel(pool)}</TableCell>
                    <TableCell>
                      <StatusChip
                        status={pool.winner === 'UP' ? 'ok' : pool.winner === 'DOWN' ? 'error' : 'neutral'}
                        label={pool.winner ?? '-'}
                      />
                    </TableCell>
                    <TableCell align="right">{pool.pendingCount}</TableCell>
                    <TableCell><TimeCell value={pool.updatedAt} mode="datetime" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* ─── 5. Migration runner ───────────────────────────────────── */}
      <SectionCard
        accentColor={t.warning}
        title="Historical migration"
        subtitle="One-shot job that scans CLAIMABLE pools with a winner from the last N days and pays any remaining winning-side bets. Idempotent - safe to re-run."
        actions={
          <ActionButton
            kind="secondary"
            label="Open migration runner"
            onClick={() => { setMigrationOpen(true); previewMut.mutate(migrationDays); }}
          />
        }
      >{null}</SectionCard>

      <AdminDialog
        open={migrationOpen}
        onClose={() => setMigrationOpen(false)}
        title="Run payout migration"
        maxWidth="md"
        loading={migrationRunning}
        footer={
          <>
            <ActionButton kind="tertiary" label="Close" onClick={() => setMigrationOpen(false)} disabled={migrationRunning} />
            <ActionButton
              kind="primary"
              label={migrationRunning ? 'Running' : 'Execute migration'}
              loading={migrationRunning}
              disabled={!previewMut.data || previewMut.data.data.totalBets === 0}
              onClick={runMigration}
            />
          </>
        }
      >
        <Stack spacing={2}>
          <TextField
            label="Within last N days"
            type="number"
            size="small"
            value={migrationDays}
            onChange={(e) => setMigrationDays(Math.max(1, Math.min(365, parseInt(e.target.value, 10) || 30)))}
            disabled={migrationRunning}
          />
          <ActionButton
            kind="secondary"
            label="Refresh dry-run"
            onClick={() => previewMut.mutate(migrationDays)}
            loading={previewMut.isPending}
            disabled={migrationRunning}
          />
          {previewMut.data && (
            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
              <Body>
                Would pay <Box component="strong" sx={{ fontWeight: 700, color: t.text.primary }}>{previewMut.data.data.totalBets}</Box> bet(s)
                across <Box component="strong" sx={{ fontWeight: 700, color: t.text.primary }}>{previewMut.data.data.totalPools}</Box> pool(s) -
                total <Box component="strong" sx={{ fontWeight: 700, color: t.text.primary }}>${fmtUsdc(previewMut.data.data.totalAmountUsdcRaw)}</Box>.
              </Body>
            </Box>
          )}
          {migrationLogs.length > 0 && (
            <Box sx={{ maxHeight: 260, overflow: 'auto', bgcolor: t.bg.surfaceAlt, p: 1.5, borderRadius: 1.5, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.72rem' }}>
              {migrationLogs.map((ev, i) => (
                <Box key={i} sx={{ color: ev.type === 'error' || ev.type === 'pool_error' ? t.error : ev.type === 'done' ? t.gain : t.text.secondary }}>
                  [{ev.type}] {JSON.stringify(ev)}
                </Box>
              ))}
            </Box>
          )}
          <Meta>The job is idempotent - if it stops mid-run, just retry from the same N.</Meta>
        </Stack>
      </AdminDialog>
    </Box>
  );
}
