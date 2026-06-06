'use client';

import {
  Box, Chip, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, ActionButton, RefreshButton,
  LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label, Meta,
  POLL_FAST_MS,
  type StatusKind,
} from '../ui';

interface JobInfo {
  name: string;
  schedule: string;
  lastRunAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  runCount: number;
  errorCount: number;
  // PR 3 (Phase 1 #9) added the tri-state field. Keep `healthy` as a
  // backward-compat boolean; the UI now reads `status` for filtering.
  status?: 'ok' | 'error' | 'pending';
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

// Map a job's tri-state into a StatusChip kind. Pending (cold-start) is
// neutral rather than warning so a fresh deploy doesn't paint the table
// yellow.
function jobStatusKind(job: JobInfo): StatusKind {
  if (job.status) {
    return job.status === 'ok' ? 'ok' : job.status === 'error' ? 'error' : 'pending';
  }
  // Pre-PR-3 backend fallback.
  if (job.healthy) return 'ok';
  return job.lastRunAt ? 'error' : 'pending';
}

// Plan §3.9 §3 - drop the hardcoded credits-low threshold (was `< 200`).
// Below ~10% of a daily 1000-credit budget is "low"; backend should
// eventually ship the threshold itself, but for now compute defensively
// against `null`.
const ODDS_API_CREDITS_LOW_THRESHOLD = 200;
function oddsApiCreditsKind(credits: number | null): StatusKind {
  if (credits == null) return 'neutral';
  if (credits < ODDS_API_CREDITS_LOW_THRESHOLD) return 'error';
  return 'ok';
}

// ─── SourceSplitPanel ────────────────────────────────────────────────────
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
    <Box sx={{ mb: 2, p: 1.5, bgcolor: t.bg.surfaceAlt, borderRadius: 1.5, border: `1px solid ${t.border.subtle}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Label>Source split</Label>
        <Tooltip title="Per-row counters since the API started. SDB primary means it should dominate both columns; Odds API fallback should be a small share. If the Odds API column stays under ~5% for 2 weeks, the $60/mo plan can be downgraded.">
          <Chip label="?" size="small" sx={{ height: 16, fontSize: 10, cursor: 'help', borderRadius: 1 }} />
        </Tooltip>
        {ftStuckKnockoutCount > 0 && (
          <Box sx={{ ml: 'auto' }}>
            <StatusChip status="warning" label={`${ftStuckKnockoutCount} knockout(s) waiting on SDB`} />
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Meta sx={{ fontWeight: 600, color: t.text.secondary }}>Display rows (per cycle)</Meta>
            <Meta sx={{ fontVariantNumeric: 'tabular-nums' }}>{displayTotal.toLocaleString()} total</Meta>
          </Box>
          <Box sx={{ display: 'flex', height: 16, borderRadius: 1, overflow: 'hidden', bgcolor: t.hover.subtle }}>
            <Box sx={{ width: `${pct(displaySource.sdb, displayTotal)}%`, bgcolor: t.gain, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(displaySource.oddsApi, displayTotal)}%`, bgcolor: t.predict, transition: 'width 0.4s' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: '0.7rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>
            <Box component="span"><LegendDot color={t.gain} />SDB {pct(displaySource.sdb, displayTotal)}% ({displaySource.sdb.toLocaleString()})</Box>
            <Box component="span"><LegendDot color={t.predict} />Odds API gap-fill {pct(displaySource.oddsApi, displayTotal)}% ({displaySource.oddsApi.toLocaleString()})</Box>
          </Box>
        </Box>

        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
            <Meta sx={{ fontWeight: 600, color: t.text.secondary }}>FT signals (per match)</Meta>
            <Meta sx={{ fontVariantNumeric: 'tabular-nums' }}>{ftTotal.toLocaleString()} total</Meta>
          </Box>
          <Box sx={{ display: 'flex', height: 16, borderRadius: 1, overflow: 'hidden', bgcolor: t.hover.subtle }}>
            <Box sx={{ width: `${pct(ftSource.sdb, ftTotal)}%`, bgcolor: t.gain, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(ftSource.oddsApiFallback, ftTotal)}%`, bgcolor: t.predict, transition: 'width 0.4s' }} />
            <Box sx={{ width: `${pct(ftSource.chatgpt, ftTotal)}%`, bgcolor: t.warning, transition: 'width 0.4s' }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: '0.7rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums', flexWrap: 'wrap' }}>
            <Box component="span"><LegendDot color={t.gain} />SDB {pct(ftSource.sdb, ftTotal)}% ({ftSource.sdb})</Box>
            <Box component="span"><LegendDot color={t.predict} />Odds API fallback {pct(ftSource.oddsApiFallback, ftTotal)}% ({ftSource.oddsApiFallback})</Box>
            {ftSource.chatgpt > 0 && <Box component="span"><LegendDot color={t.warning} />ChatGPT {pct(ftSource.chatgpt, ftTotal)}% ({ftSource.chatgpt})</Box>}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

function LegendDot({ color }: { color: string }) {
  return <Box component="span" sx={{ display: 'inline-block', width: 8, height: 8, bgcolor: color, borderRadius: '50%', mr: 0.5 }} />;
}

// ─── LivescoreHealth ─────────────────────────────────────────────────────
function LivescoreHealth() {
  // Plan §3.9: keepPreviousData prevents the null-flash on every 15s
  // refetch - the panel kept blanking back to "no data" between polls.
  const { data, isLoading } = useQuery({
    queryKey: ['admin-livescore-health'],
    queryFn: () => adminFetch<LivescoreMetricsData>('/health/livescore'),
    refetchInterval: POLL_FAST_MS,
    placeholderData: keepPreviousData,
  });

  if (isLoading || !data) return null;

  const m = data.data;
  const pollAge = m.lastPollAt ? Math.round((Date.now() - m.lastPollAt) / 1000) : null;

  const sportsDbKind: StatusKind = m.consecutivePollFailures >= 3
    ? 'error'
    : m.consecutivePollFailures >= 1 || m.sportsDb429Count > 0 ? 'warning' : 'ok';
  const sportsDbLabel = m.consecutivePollFailures >= 3 ? 'Down' : m.consecutivePollFailures >= 1 || m.sportsDb429Count > 0 ? 'Degraded' : 'Healthy';

  const chatgptKind: StatusKind = m.chatgptCircuitBreakerOpen
    ? 'error'
    : m.chatgptCallsTotal > 0 ? 'ok' : 'pending';
  const chatgptLabel = m.chatgptCircuitBreakerOpen ? 'Circuit open' : m.chatgptCallsTotal > 0 ? 'Active' : 'Standby';

  const oddsApiKind: StatusKind = m.oddsApiDisabled
    ? 'error'
    : m.oddsApiCallsTotal > 0 ? 'ok' : 'pending';
  const oddsApiLabel = m.oddsApiDisabled ? 'Disabled' : m.oddsApiCallsTotal > 0 ? 'Active' : 'Standby';

  const creditsKind = oddsApiCreditsKind(m.oddsApiCreditsRemaining);

  return (
    <SectionCard title="Livescore health">
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2, mb: 2 }}>
        <Box>
          <Label>TheSportsDB</Label>
          <Box sx={{ mt: 0.5 }}><StatusChip status={sportsDbKind} label={sportsDbLabel} /></Box>
          {pollAge != null && <Meta sx={{ display: 'block', mt: 0.5 }}>Last poll: {pollAge}s ago ({m.lastPollDurationMs}ms)</Meta>}
        </Box>
        <Box>
          <Label>The Odds API</Label>
          <Box sx={{ mt: 0.5 }}><StatusChip status={oddsApiKind} label={oddsApiLabel} /></Box>
          <Meta sx={{ display: 'block', mt: 0.5 }}>Calls: {m.oddsApiCallsTotal} · Matched: {m.oddsApiSuccessTotal}</Meta>
        </Box>
        <Box>
          <Label>Odds API credits</Label>
          <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: creditsKind === 'error' ? t.error : creditsKind === 'ok' ? t.gain : t.text.tertiary, mt: 0.5 }}>
            {m.oddsApiCreditsRemaining != null ? m.oddsApiCreditsRemaining.toLocaleString() : '-'}
          </Box>
          {creditsKind === 'error' && <Meta sx={{ display: 'block', color: t.error }}>Low credits</Meta>}
        </Box>
        <Box>
          <Label>ChatGPT</Label>
          <Box sx={{ mt: 0.5 }}><StatusChip status={chatgptKind} label={chatgptLabel} /></Box>
          <Meta sx={{ display: 'block', mt: 0.5 }}>Calls: {m.chatgptCallsTotal}</Meta>
        </Box>
        <Box>
          <Label>Events / lookups</Label>
          <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: t.text.primary, mt: 0.5 }}>{m.lastPollEventCount}</Box>
          <Meta sx={{ display: 'block', mt: 0.5 }}>Lookups: {m.lookupCallsTotal}</Meta>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Meta>SportsDB: {m.sportsDbSuccessCount} ok / {m.sportsDbFailureCount} fail / {m.sportsDb429Count} 429</Meta>
        <Meta>Odds API: {m.oddsApiCallsTotal} calls / {m.oddsApiSuccessTotal} matched</Meta>
        <Meta>ChatGPT: {m.chatgptCallsTotal} calls / {m.chatgptRejectionsTotal} rejected</Meta>
        {m.lastPollError && <Meta sx={{ color: t.error }}>Last error: {m.lastPollError.slice(0, 80)}</Meta>}
      </Box>

      <SourceSplitPanel
        displaySource={m.displaySource}
        ftSource={m.ftSource}
        ftStuckKnockoutCount={m.ftStuckKnockoutCount}
      />

      {m.missingEvents.length > 0 && (
        <Box sx={{ mb: 2 }}>
          <Label sx={{ color: t.warning, display: 'block', mb: 0.5 }}>Missing events ({m.missingEvents.length})</Label>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Match</Label></TableCell>
                  <TableCell><Label>Sport</Label></TableCell>
                  <TableCell><Label>Missing</Label></TableCell>
                  <TableCell><Label>Reason</Label></TableCell>
                  <TableCell><Label>GPT</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {m.missingEvents.map(ev => (
                  <TableRow key={ev.eventId}>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{ev.homeTeam} vs {ev.awayTeam}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{ev.sport}</TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{Math.round((Date.now() - ev.missingSince) / 60000)}m</TableCell>
                    <TableCell><StatusChip status="warning" label={ev.reason} /></TableCell>
                    <TableCell sx={{ fontSize: '0.78rem' }}>{ev.chatgptAttempted ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {m.incidents.length > 0 && (
        <Box>
          <Label sx={{ display: 'block', mb: 0.5 }}>Recent incidents ({m.incidents.length})</Label>
          <Box sx={{ maxHeight: 200, overflow: 'auto', bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, p: 1 }}>
            {[...m.incidents].reverse().slice(0, 50).map((inc) => {
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
              // Plan §3.9 - use a stable key. timestamp+type+detailsHead
              // is sufficient (multiple incidents at the same ms with the
              // same type/details would collide, but that's safe to merge).
              const key = `${inc.timestamp}-${inc.type}-${inc.details.slice(0, 32)}`;
              return (
                <Box key={key} sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.7rem', lineHeight: 1.6 }}>
                  <Box component="span" sx={{ color: t.text.tertiary }}>{time}</Box>{' '}
                  <Box component="span" sx={{ color: typeColor[inc.type] || t.text.primary }}>{inc.type}</Box>{' '}
                  <Box component="span" sx={{ color: t.text.secondary }}>{inc.details}</Box>
                </Box>
              );
            })}
          </Box>
        </Box>
      )}
    </SectionCard>
  );
}

// ─── SystemHealth (root) ─────────────────────────────────────────────────
export function SystemHealth() {
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useQuery({
    queryKey: ['admin-health'],
    queryFn: () => adminFetch<HealthData>('/health/overview'),
    refetchInterval: POLL_FAST_MS,
    placeholderData: keepPreviousData,
  });

  if (isLoading && !data) return <LoadingState variant="block" />;
  if (error && !data) {
    return (
      <ErrorState
        title="Couldn’t load system health"
        message={(error as Error).message}
        details={error}
        onRetry={() => refetch()}
      />
    );
  }

  const h = data!.data;
  // Per PR 3 #9, jobs ship a tri-state `status`. Filter the failing list
  // to only `status === 'error'` so a freshly deployed scheduler doesn't
  // alarm. Fall back to !healthy for backward compat.
  const failingJobs = h.jobs.filter(j => (j.status ? j.status === 'error' : !j.healthy));
  const allJobsHealthy = h.jobs.length > 0 && failingJobs.length === 0;
  const lastUpdated = dataUpdatedAt ? Math.round((Date.now() - dataUpdatedAt) / 1000) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Alerts ────────────────────────────────────────────────── */}
      {h.stuckPools > 0 && (
        <SectionCard dense accentColor={t.error} title={`${h.stuckPools} stuck pool${h.stuckPools === 1 ? '' : 's'}`}>
          <Meta>Past endTime but still JOINING / ACTIVE - open the Pools tab to resolve them.</Meta>
        </SectionCard>
      )}
      {failingJobs.length > 0 && (
        <SectionCard dense accentColor={t.warning} title={`${failingJobs.length} job${failingJobs.length === 1 ? '' : 's'} with errors`}>
          <Meta>{failingJobs.map(j => j.name).join(', ')}</Meta>
        </SectionCard>
      )}

      {/* ─── Top-line status tiles ─────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
        <SectionCard dense title="Scheduler" actions={<RefreshButton onRefresh={() => refetch()} isFetching={isFetching} />}>
          <StatusChip status={h.scheduler.isRunning ? 'ok' : 'error'} label={h.scheduler.isRunning ? 'Running' : 'Stopped'} />
          <Meta sx={{ display: 'block', mt: 1 }}>{h.scheduler.jobCount} jobs registered</Meta>
          {lastUpdated != null && <Meta sx={{ display: 'block', mt: 0.25 }}>Last updated {lastUpdated}s ago</Meta>}
        </SectionCard>

        <SectionCard dense title="RPC">
          <StatusChip status={h.rpc.ok ? 'ok' : 'error'} label={h.rpc.ok ? `${h.rpc.ms}ms` : 'Down'} />
          {h.rpc.ok && h.rpc.ms > 2000 && <Meta sx={{ display: 'block', mt: 0.5, color: t.warning }}>Slow response</Meta>}
        </SectionCard>

        <SectionCard dense title="Price provider">
          <StatusChip status={h.priceProvider.healthy ? 'ok' : 'error'} label={h.priceProvider.healthy ? 'Healthy' : 'Down'} />
        </SectionCard>

        <SectionCard dense title="Authority SOL">
          <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: h.authorityBalance != null && h.authorityBalance < 0.1 ? t.error : t.text.primary }}>
            {h.authorityBalance != null ? h.authorityBalance.toFixed(4) : '-'}
          </Box>
          {h.authorityBalance != null && h.authorityBalance < 0.1 && (
            <Meta sx={{ display: 'block', color: t.error }}>Low balance</Meta>
          )}
        </SectionCard>
      </Box>

      <LivescoreHealth />

      {/* ─── Cron jobs ─────────────────────────────────────────────── */}
      <SectionCard
        title="Cron jobs"
        actions={
          <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
            <StatusChip status={allJobsHealthy ? 'ok' : 'error'} label={allJobsHealthy ? 'All healthy' : `${failingJobs.length} failing`} />
            <RefreshButton onRefresh={() => refetch()} isFetching={isFetching} />
          </Box>
        }
      >
        {h.jobs.length === 0 ? (
          <EmptyState title="No jobs registered" hint="Scheduler probably hasn’t finished bootstrapping yet - wait a moment." />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Job</Label></TableCell>
                  <TableCell><Label>Schedule</Label></TableCell>
                  <TableCell><Label>Status</Label></TableCell>
                  <TableCell><Label>Last run</Label></TableCell>
                  <TableCell><Label>Runs</Label></TableCell>
                  <TableCell><Label>Errors</Label></TableCell>
                  <TableCell><Label>Last error</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {h.jobs.map(job => {
                  const kind = jobStatusKind(job);
                  return (
                    <TableRow key={job.name} sx={{ bgcolor: kind === 'error' ? withAlpha(t.error, 0.05) : undefined }}>
                      <TableCell sx={{ fontSize: '0.78rem', fontWeight: 500 }}>{job.name}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>{job.schedule}</TableCell>
                      <TableCell>
                        <StatusChip status={kind} label={kind === 'ok' ? 'OK' : kind === 'error' ? 'Error' : 'Pending'} />
                      </TableCell>
                      <TableCell><TimeCell value={job.lastRunAt} mode="relative" /></TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{job.runCount}</TableCell>
                      <TableCell sx={{ fontVariantNumeric: 'tabular-nums', color: job.errorCount > 0 ? t.error : undefined }}>{job.errorCount}</TableCell>
                      <TableCell sx={{ maxWidth: 220, fontSize: '0.7rem' }}>
                        {job.lastError ? (
                          <Tooltip title={job.lastError} arrow>
                            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.lastError}</Box>
                          </Tooltip>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* ─── DB overview ───────────────────────────────────────────── */}
      <SectionCard title="Database">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(6, 1fr)' }, gap: 2 }}>
          {Object.entries(h.db.pools).map(([status, count]) => (
            <StatCard key={status} label={status} value={count.toLocaleString()} />
          ))}
          <StatCard label="Total bets" value={h.db.totalBets.toLocaleString()} />
          <StatCard label="Total users" value={h.db.totalUsers.toLocaleString()} />
        </Box>
        <Box sx={{ mt: 2 }}>
          <Label sx={{ display: 'block', mb: 0.25 }}>Authority pubkey</Label>
          {/* Plan §3.9 - long pubkey now uses IdCell so the admin can copy
              it cleanly; previous code dumped 44 chars and broke layout. */}
          <IdCell value={h.scheduler.authority} truncate={20} />
        </Box>
      </SectionCard>

      {/* If the latest poll errored but we kept previous data via
          keepPreviousData, surface the soft error inline so the admin
          knows refresh failed but the dashboard isn't blank. */}
      {error && data && (
        <SectionCard dense accentColor={t.warning} title="Health refresh failed">
          <Meta>Showing the most recent successful snapshot. {(error as Error).message}</Meta>
          <Box sx={{ mt: 1 }}>
            <ActionButton kind="secondary" label="Retry" onClick={() => refetch()} loading={isFetching} />
          </Box>
        </SectionCard>
      )}
    </Box>
  );
}
