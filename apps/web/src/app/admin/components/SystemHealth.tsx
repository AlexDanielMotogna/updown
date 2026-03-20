'use client';

import {
  Box, Card, Typography, Chip, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';

interface JobInfo {
  name: string;
  schedule: string;
  lastRunAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
  healthy: boolean;
}

interface HealthData {
  data: {
    scheduler: { isRunning: boolean; jobCount: number; authority: string };
    jobs: JobInfo[];
    rpc: { ms: number; ok: boolean };
    priceProvider: { healthy: boolean };
    authorityBalance: number | null;
    stuckPools: number;
    db: { pools: Record<string, number>; totalBets: number; totalUsers: number };
  };
}

function StatusChip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Chip
      label={label}
      size="small"
      sx={{
        bgcolor: ok ? 'rgba(34,197,94,0.15)' : 'rgba(248,113,113,0.15)',
        color: ok ? '#22C55E' : '#F87171',
        fontWeight: 600,
      }}
    />
  );
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function SystemHealth() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => adminFetch<HealthData>('/health/overview'),
    refetchInterval: 15000,
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Typography color="error">{(error as Error).message}</Typography>;

  const h = data!.data;
  const allJobsHealthy = h.jobs.length > 0 && h.jobs.every(j => j.healthy);
  const failingJobs = h.jobs.filter(j => !j.healthy);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Alerts */}
      {h.stuckPools > 0 && (
        <Alert severity="error" variant="filled">
          {h.stuckPools} stuck pool(s) — check Pools tab
        </Alert>
      )}
      {failingJobs.length > 0 && (
        <Alert severity="warning" variant="filled">
          {failingJobs.length} job(s) with errors: {failingJobs.map(j => j.name).join(', ')}
        </Alert>
      )}

      {/* Status cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 2 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">SCHEDULER</Typography>
          <StatusChip ok={h.scheduler.isRunning} label={h.scheduler.isRunning ? 'Running' : 'Stopped'} />
          <Typography variant="body2" sx={{ mt: 1 }}>{h.scheduler.jobCount} jobs registered</Typography>
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">RPC</Typography>
          <StatusChip ok={h.rpc.ok} label={h.rpc.ok ? `${h.rpc.ms}ms` : 'Down'} />
          {h.rpc.ok && h.rpc.ms > 2000 && (
            <Typography variant="caption" color="warning.main" display="block" sx={{ mt: 0.5 }}>Slow response</Typography>
          )}
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">PRICE PROVIDER</Typography>
          <StatusChip ok={h.priceProvider.healthy} label={h.priceProvider.healthy ? 'Healthy' : 'Down'} />
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">AUTHORITY SOL</Typography>
          <Typography variant="h6">{h.authorityBalance != null ? `${h.authorityBalance.toFixed(4)}` : 'N/A'}</Typography>
          {h.authorityBalance != null && h.authorityBalance < 0.1 && (
            <Typography variant="caption" color="error.main">Low balance!</Typography>
          )}
        </Card>
      </Box>

      {/* Jobs health table */}
      <Card sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
          <Typography variant="subtitle2">Cron Jobs</Typography>
          <StatusChip ok={allJobsHealthy} label={allJobsHealthy ? 'All healthy' : `${failingJobs.length} failing`} />
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Job</TableCell>
                <TableCell>Schedule</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Last Run</TableCell>
                <TableCell>Runs</TableCell>
                <TableCell>Errors</TableCell>
                <TableCell>Last Error</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {h.jobs.map(job => (
                <TableRow key={job.name} sx={{ bgcolor: !job.healthy ? 'rgba(248,113,113,0.05)' : undefined }}>
                  <TableCell sx={{ fontSize: 12, fontWeight: 500 }}>{job.name}</TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', fontSize: 11 }}>{job.schedule}</TableCell>
                  <TableCell>
                    <Chip
                      label={job.healthy ? 'OK' : job.lastRunAt ? 'Error' : 'Pending'}
                      size="small"
                      sx={{
                        bgcolor: job.healthy ? 'rgba(34,197,94,0.15)' : !job.lastRunAt ? 'rgba(245,158,11,0.15)' : 'rgba(248,113,113,0.15)',
                        color: job.healthy ? '#22C55E' : !job.lastRunAt ? '#F59E0B' : '#F87171',
                        fontSize: 11,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{timeAgo(job.lastRunAt)}</TableCell>
                  <TableCell>{job.runCount}</TableCell>
                  <TableCell sx={{ color: job.errorCount > 0 ? '#F87171' : undefined }}>{job.errorCount}</TableCell>
                  <TableCell sx={{ maxWidth: 200, fontSize: 10, fontFamily: 'monospace' }}>
                    {job.lastError ? (
                      <Tooltip title={job.lastError} arrow>
                        <Typography noWrap sx={{ fontSize: 'inherit', fontFamily: 'inherit', maxWidth: 200 }}>
                          {job.lastError}
                        </Typography>
                      </Tooltip>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* DB overview */}
      <Card sx={{ p: 2.5 }}>
        <Typography variant="caption" color="text.secondary" gutterBottom display="block">DATABASE</Typography>
        <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {Object.entries(h.db.pools).map(([status, count]) => (
            <Box key={status}>
              <Typography variant="body2" color="text.secondary">{status}</Typography>
              <Typography variant="h6">{count}</Typography>
            </Box>
          ))}
          <Box>
            <Typography variant="body2" color="text.secondary">Total Bets</Typography>
            <Typography variant="h6">{h.db.totalBets}</Typography>
          </Box>
          <Box>
            <Typography variant="body2" color="text.secondary">Total Users</Typography>
            <Typography variant="h6">{h.db.totalUsers}</Typography>
          </Box>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, wordBreak: 'break-all', display: 'block' }}>
          Authority: {h.scheduler.authority}
        </Typography>
      </Card>
    </Box>
  );
}
