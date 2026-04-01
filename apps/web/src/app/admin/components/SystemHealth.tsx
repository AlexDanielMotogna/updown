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

interface MissingEvent {
  eventId: string;
  homeTeam: string;
  awayTeam: string;
  sport: string;
  missingSince: number;
  reason: string;
  chatgptAttempted: boolean;
}

interface LivescoreIncident {
  timestamp: number;
  type: string;
  eventId?: string;
  details: string;
}

interface LivescoreMetricsData {
  data: {
    lastPollAt: number | null;
    lastPollDurationMs: number;
    lastPollEventCount: number;
    consecutivePollFailures: number;
    lastPollError: string | null;
    sportsDbSuccessCount: number;
    sportsDbFailureCount: number;
    sportsDbAvgLatencyMs: number;
    sportsDb429Count: number;
    lookupCallsTotal: number;
    chatgptCallsTotal: number;
    chatgptRejectionsTotal: number;
    chatgptCircuitBreakerOpen: boolean;
    oddsApiCallsTotal: number;
    oddsApiSuccessTotal: number;
    oddsApiCreditsRemaining: number | null;
    oddsApiDisabled: boolean;
    missingEvents: MissingEvent[];
    incidents: LivescoreIncident[];
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

function LivescoreHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-livescore-health'],
    queryFn: () => adminFetch<LivescoreMetricsData>('/health/livescore'),
    refetchInterval: 15000,
  });

  if (isLoading || !data) return null;

  const m = data.data;
  const pollAge = m.lastPollAt ? Math.round((Date.now() - m.lastPollAt) / 1000) : null;

  // Determine TheSportsDB status
  const sportsDbStatus = m.consecutivePollFailures >= 3
    ? { label: 'Down', ok: false }
    : m.consecutivePollFailures >= 1 || m.sportsDb429Count > 0
    ? { label: 'Degraded', ok: false }
    : { label: 'Healthy', ok: true };

  // Determine ChatGPT status
  const chatgptStatus = m.chatgptCircuitBreakerOpen
    ? { label: 'Circuit Open', ok: false }
    : m.chatgptCallsTotal > 0
    ? { label: 'Active', ok: true }
    : { label: 'Standby', ok: true };

  // Determine Odds API status
  const oddsApiStatus = m.oddsApiDisabled
    ? { label: 'Disabled', ok: false }
    : m.oddsApiCallsTotal > 0
    ? { label: 'Active', ok: true }
    : { label: 'Standby', ok: true };

  const creditsRemaining = m.oddsApiCreditsRemaining;
  const creditsPct = creditsRemaining != null ? Math.round((creditsRemaining / 1000) * 100) : null;
  const creditsLow = creditsRemaining != null && creditsRemaining < 200;

  return (
    <Card sx={{ p: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>Livescore Health</Typography>

      {/* Status row */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr', gap: 2, mb: 2 }}>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">TheSportsDB</Typography>
          <StatusChip ok={sportsDbStatus.ok} label={sportsDbStatus.label} />
          {pollAge != null && (
            <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
              Last poll: {pollAge}s ago ({m.lastPollDurationMs}ms)
            </Typography>
          )}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">The Odds API</Typography>
          <StatusChip ok={oddsApiStatus.ok} label={oddsApiStatus.label} />
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Calls: {m.oddsApiCallsTotal} / Matched: {m.oddsApiSuccessTotal}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Odds API Credits</Typography>
          <Typography variant="h6" sx={{ color: creditsLow ? '#F87171' : creditsRemaining != null ? '#22C55E' : 'text.secondary' }}>
            {creditsRemaining != null ? creditsRemaining.toLocaleString() : '—'}
          </Typography>
          {creditsLow && <Typography variant="caption" color="error.main">Low credits!</Typography>}
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">ChatGPT</Typography>
          <StatusChip ok={chatgptStatus.ok} label={chatgptStatus.label} />
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Calls: {m.chatgptCallsTotal}
          </Typography>
        </Box>
        <Box>
          <Typography variant="caption" color="text.secondary" display="block">Events / Lookups</Typography>
          <Typography variant="h6">{m.lastPollEventCount}</Typography>
          <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
            Lookups: {m.lookupCallsTotal}
          </Typography>
        </Box>
      </Box>

      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Typography variant="caption">
          SportsDB: {m.sportsDbSuccessCount} ok / {m.sportsDbFailureCount} fail / {m.sportsDb429Count} 429
        </Typography>
        <Typography variant="caption">
          Odds API: {m.oddsApiCallsTotal} calls / {m.oddsApiSuccessTotal} matched
        </Typography>
        <Typography variant="caption">
          ChatGPT: {m.chatgptCallsTotal} calls / {m.chatgptRejectionsTotal} rejected
        </Typography>
        {m.lastPollError && (
          <Typography variant="caption" color="error.main">
            Last error: {m.lastPollError.slice(0, 80)}
          </Typography>
        )}
      </Box>

      {/* Missing events */}
      {m.missingEvents.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
            Missing Events ({m.missingEvents.length}):
          </Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontSize: 11 }}>Match</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>Sport</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>Missing</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>Reason</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>GPT</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {m.missingEvents.map(ev => (
                  <TableRow key={ev.eventId}>
                    <TableCell sx={{ fontSize: 11 }}>{ev.homeTeam} vs {ev.awayTeam}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{ev.sport}</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{Math.round((Date.now() - ev.missingSince) / 60000)}m</TableCell>
                    <TableCell sx={{ fontSize: 11 }}>
                      <Chip label={ev.reason} size="small" sx={{ fontSize: 10, height: 20, bgcolor: 'rgba(245,158,11,0.15)', color: '#F59E0B' }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: 11 }}>{ev.chatgptAttempted ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {/* Recent incidents */}
      {m.incidents.length > 0 && (
        <Box>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
            Recent Incidents ({m.incidents.length}):
          </Typography>
          <Box sx={{ maxHeight: 200, overflow: 'auto', mt: 0.5, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1, p: 1 }}>
            {[...m.incidents].reverse().slice(0, 50).map((inc, i) => {
              const time = new Date(inc.timestamp).toLocaleTimeString();
              const typeColor: Record<string, string> = {
                SPORTSDB_POLL_FAIL: '#F87171',
                SPORTSDB_429: '#F87171',
                EVENT_DISAPPEARED: '#F59E0B',
                STUCK_NS: '#F59E0B',
                SCORE_FROZEN: '#F59E0B',
                CHATGPT_TRIGGERED: '#60A5FA',
                CHATGPT_SUCCESS: '#22C55E',
                CHATGPT_REJECTED: '#F59E0B',
                CHATGPT_ERROR: '#F87171',
                ODDS_API_TRIGGERED: '#818CF8',
                ODDS_API_SUCCESS: '#22C55E',
                ODDS_API_REJECTED: '#F59E0B',
                ODDS_API_ERROR: '#F87171',
                MIDNIGHT_BOUNDARY: '#A78BFA',
              };
              return (
                <Typography key={i} variant="caption" display="block" sx={{ fontFamily: 'monospace', fontSize: 10, lineHeight: 1.6 }}>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{time}</span>{' '}
                  <span style={{ color: typeColor[inc.type] || '#fff' }}>{inc.type}</span>{' '}
                  {inc.details}
                </Typography>
              );
            })}
          </Box>
        </Box>
      )}
    </Card>
  );
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

      {/* Livescore health */}
      <LivescoreHealth />

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
                  <TableCell sx={{ fontSize: 11 }}>{job.schedule}</TableCell>
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
                  <TableCell sx={{ maxWidth: 200, fontSize: 10 }}>
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
