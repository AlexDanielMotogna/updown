'use client';

import {
  Box, Card, Typography, Chip, CircularProgress, Alert,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Tooltip,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';

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
    displaySource: { sdb: number; oddsApi: number };
    ftSource: { sdb: number; oddsApiFallback: number; chatgpt: number };
    ftStuckKnockoutCount: number;
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
        bgcolor: ok ? withAlpha(t.gain, 0.15) : withAlpha(t.error, 0.15),
        color: ok ? t.gain : t.error,
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

/**
 * Visualises who's actually doing the work in the SDB-primary / Odds API-
 * fallback split (Phase B of PLAN-LIVESCORE-SOURCE-SPLIT). Drives the
 * decision-3 review at the 2-week mark: if Odds API contributes < 5% of
 * FT signals, we can downgrade the $60/mo plan.
 */
function SourceSplitPanel({
  displaySource, ftSource, ftStuckKnockoutCount,
}: {
  displaySource: { sdb: number; oddsApi: number };
  ftSource: { sdb: number; oddsApiFallback: number; chatgpt: number };
  ftStuckKnockoutCount: number;
}) {
  const displayTotal = displaySource.sdb + displaySource.oddsApi;
  const ftTotal = ftSource.sdb + ftSource.oddsApiFallback + ftSource.chatgpt;
  const pct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  return (
    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'rgba(0,0,0,0.15)', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: t.text.secondary }}>
          Source Split
        </Typography>
        <Tooltip title="Per-row counters since the API started. SDB primary means it should dominate both columns; Odds API fallback should be a small share. If the Odds API column stays under ~5% for 2 weeks, the $60/mo plan can be downgraded.">
          <Chip label="?" size="small" sx={{ height: 16, fontSize: 10, cursor: 'help' }} />
        </Tooltip>
        {ftStuckKnockoutCount > 0 && (
          <Chip
            label={`${ftStuckKnockoutCount} knockout(s) waiting on SDB`}
            size="small"
            sx={{ ml: 'auto', height: 18, fontSize: 10, bgcolor: withAlpha(t.warning, 0.15), color: t.warning }}
          />
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        {/* Display source */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>Display rows (per cycle)</Typography>
            <Typography variant="caption" sx={{ color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{displayTotal.toLocaleString()} total</Typography>
          </Box>
          <Box sx={{ display: 'flex', height: 16, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.05)' }}>
            <Box sx={{ width: `${pct(displaySource.sdb, displayTotal)}%`, bgcolor: t.gain, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(displaySource.oddsApi, displayTotal)}%`, bgcolor: t.predict, transition: 'width 0.4s' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: 11, color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: t.gain, borderRadius: '50%', mr: 0.5 }} />SDB {pct(displaySource.sdb, displayTotal)}% ({displaySource.sdb.toLocaleString()})</span>
            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: t.predict, borderRadius: '50%', mr: 0.5 }} />Odds API gap-fill {pct(displaySource.oddsApi, displayTotal)}% ({displaySource.oddsApi.toLocaleString()})</span>
          </Box>
        </Box>

        {/* FT source */}
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontWeight: 600 }}>FT signals (per match)</Typography>
            <Typography variant="caption" sx={{ color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>{ftTotal.toLocaleString()} total</Typography>
          </Box>
          <Box sx={{ display: 'flex', height: 16, borderRadius: 1, overflow: 'hidden', bgcolor: 'rgba(255,255,255,0.05)' }}>
            <Box sx={{ width: `${pct(ftSource.sdb, ftTotal)}%`, bgcolor: t.gain, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(ftSource.oddsApiFallback, ftTotal)}%`, bgcolor: t.predict, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(ftSource.chatgpt, ftTotal)}%`, bgcolor: t.warning, transition: 'width 0.4s' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: 11, color: t.text.secondary, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: t.gain, borderRadius: '50%', mr: 0.5 }} />SDB {pct(ftSource.sdb, ftTotal)}% ({ftSource.sdb})</span>
            <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: t.predict, borderRadius: '50%', mr: 0.5 }} />Odds API fallback {pct(ftSource.oddsApiFallback, ftTotal)}% ({ftSource.oddsApiFallback})</span>
            {ftSource.chatgpt > 0 && (
              <span><Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: t.warning, borderRadius: '50%', mr: 0.5 }} />ChatGPT {pct(ftSource.chatgpt, ftTotal)}% ({ftSource.chatgpt})</span>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
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
          <Typography variant="h6" sx={{ color: creditsLow ? t.error : creditsRemaining != null ? t.gain : 'text.secondary' }}>
            {creditsRemaining != null ? creditsRemaining.toLocaleString() : '-'}
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

      {/* Source split (Phase C) — who's actually doing the work */}
      <SourceSplitPanel
        displaySource={m.displaySource}
        ftSource={m.ftSource}
        ftStuckKnockoutCount={m.ftStuckKnockoutCount}
      />

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
                      <Chip label={ev.reason} size="small" sx={{ fontSize: 10, height: 20, bgcolor: withAlpha(t.warning, 0.15), color: t.warning }} />
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
                SPORTSDB_POLL_FAIL: t.error,
                SPORTSDB_429: t.error,
                EVENT_DISAPPEARED: t.warning,
                STUCK_NS: t.warning,
                SCORE_FROZEN: t.warning,
                CHATGPT_TRIGGERED: t.info,
                CHATGPT_SUCCESS: t.gain,
                CHATGPT_REJECTED: t.warning,
                CHATGPT_ERROR: t.error,
                ODDS_API_TRIGGERED: t.predict,
                ODDS_API_SUCCESS: t.gain,
                ODDS_API_REJECTED: t.warning,
                ODDS_API_ERROR: t.error,
                MIDNIGHT_BOUNDARY: t.prediction,
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
          {h.stuckPools} stuck pool(s) - check Pools tab
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
                <TableRow key={job.name} sx={{ bgcolor: !job.healthy ? withAlpha(t.error, 0.05) : undefined }}>
                  <TableCell sx={{ fontSize: 12, fontWeight: 500 }}>{job.name}</TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{job.schedule}</TableCell>
                  <TableCell>
                    <Chip
                      label={job.healthy ? 'OK' : job.lastRunAt ? 'Error' : 'Pending'}
                      size="small"
                      sx={{
                        bgcolor: job.healthy ? withAlpha(t.gain, 0.15) : !job.lastRunAt ? withAlpha(t.warning, 0.15) : withAlpha(t.error, 0.15),
                        color: job.healthy ? t.gain : !job.lastRunAt ? t.warning : t.error,
                        fontSize: 11,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontSize: 11 }}>{timeAgo(job.lastRunAt)}</TableCell>
                  <TableCell>{job.runCount}</TableCell>
                  <TableCell sx={{ color: job.errorCount > 0 ? t.error : undefined }}>{job.errorCount}</TableCell>
                  <TableCell sx={{ maxWidth: 200, fontSize: 10 }}>
                    {job.lastError ? (
                      <Tooltip title={job.lastError} arrow>
                        <Typography noWrap sx={{ fontSize: 'inherit', fontFamily: 'inherit', maxWidth: 200 }}>
                          {job.lastError}
                        </Typography>
                      </Tooltip>
                    ) : '-'}
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
