'use client';

import { useState } from 'react';
import { Box, ToggleButtonGroup, ToggleButton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, RefreshButton,
  LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label, Meta,
  DataTable, type Column,
  POLL_MEDIUM_MS,
  type StatusKind,
} from '../ui';

type Window = '24h' | '7d' | '30d' | 'all';

interface OverallStats {
  window: Window;
  totalPools: number;
  resolved: number;
  cancelled: number;
  stuck: number;
  pending: number;
  p50LatencyMs: number | null;
  p90LatencyMs: number | null;
  p99LatencyMs: number | null;
  avgLatencyMs: number | null;
}

interface CategoryStat {
  code: string;
  total: number;
  resolved: number;
  cancelled: number;
  stuck: number;
  pending: number;
  p50LatencyMs: number | null;
  p90LatencyMs: number | null;
  avgLatencyMs: number | null;
}

interface RecentRow {
  poolId: string;
  code: string | null;
  poolType: string;
  homeTeam: string | null;
  awayTeam: string | null;
  bucket: 'resolved' | 'cancelled' | 'stuck' | 'pending';
  status: string;
  winner: string | null;
  betCount: number;
  startTime: string | null;
  endTime: string;
  resolvedAt: string;
  latencyMs: number | null;
}

interface MetricsResponse {
  data: {
    overall: OverallStats;
    perCategory: CategoryStat[];
    recent: RecentRow[];
  };
}

const BUCKET_KIND: Record<RecentRow['bucket'], StatusKind> = {
  resolved: 'ok',
  cancelled: 'warning',
  stuck: 'error',
  pending: 'neutral',
};

/**
 * Human-format a millisecond latency. Picks the most-useful unit so
 * "2m 14s" reads naturally next to "3h 7m" without an extra mental step.
 */
function formatLatency(ms: number | null): string {
  if (ms == null) return '-';
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const remSec = s % 60;
  if (m < 60) return remSec === 0 ? `${m}m` : `${m}m ${remSec}s`;
  const h = Math.floor(m / 60);
  const remMin = m % 60;
  if (h < 24) return remMin === 0 ? `${h}h` : `${h}h ${remMin}m`;
  const d = Math.floor(h / 24);
  const remH = h % 24;
  return remH === 0 ? `${d}d` : `${d}d ${remH}h`;
}

/**
 * Color a latency value by how good/bad it is. Sports pools should
 * resolve within seconds-to-minutes; anything over ~6h is a smell.
 */
function latencyColor(ms: number | null): string | undefined {
  if (ms == null) return undefined;
  if (ms < 5 * 60_000) return t.success;          // <5 min
  if (ms < 30 * 60_000) return t.gain;            // <30 min
  if (ms < 6 * 60 * 60_000) return t.warning;     // <6h
  return t.error;                                  // 6h+
}

const NUM = { fontVariantNumeric: 'tabular-nums' } as const;

const CATEGORY_COLUMNS: Column<CategoryStat>[] = [
  { key: 'code', header: 'Code', render: c => {
    const rate = c.total > 0 ? (c.resolved / c.total) * 100 : 0;
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.78rem', color: t.text.primary }}>{c.code}</Box>
        {rate >= 80 && <StatusChip status="ok" label={`${rate.toFixed(0)}%`} />}
        {rate < 80 && rate >= 50 && <StatusChip status="warning" label={`${rate.toFixed(0)}%`} />}
        {rate < 50 && c.total > 0 && <StatusChip status="error" label={`${rate.toFixed(0)}%`} />}
      </Box>
    );
  } },
  { key: 'total', header: 'Total', align: 'right', cellSx: NUM, render: c => c.total },
  { key: 'resolved', header: 'Resolved', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: c.resolved > 0 ? t.gain : undefined }}>{c.resolved}</Box> },
  { key: 'cancelled', header: 'Cancelled', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: c.cancelled > 0 ? t.warning : undefined }}>{c.cancelled}</Box> },
  { key: 'stuck', header: 'Stuck', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: c.stuck > 0 ? t.error : undefined }}>{c.stuck}</Box> },
  { key: 'pending', header: 'Pending', align: 'right', cellSx: { ...NUM, color: t.text.tertiary }, render: c => c.pending },
  { key: 'p50', header: 'p50', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: latencyColor(c.p50LatencyMs) }}>{formatLatency(c.p50LatencyMs)}</Box> },
  { key: 'p90', header: 'p90', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: latencyColor(c.p90LatencyMs) }}>{formatLatency(c.p90LatencyMs)}</Box> },
  { key: 'avg', header: 'Avg', align: 'right', cellSx: NUM, render: c => <Box component="span" sx={{ color: latencyColor(c.avgLatencyMs) }}>{formatLatency(c.avgLatencyMs)}</Box> },
];

const RECENT_COLUMNS: Column<RecentRow>[] = [
  { key: 'pool', header: 'Pool', render: r => <IdCell value={r.poolId} truncate={10} href={`/match/${r.poolId}`} external /> },
  { key: 'category', header: 'Category', cellSx: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.72rem' }, render: r => r.code ?? '-' },
  { key: 'match', header: 'Match', cellSx: { maxWidth: 260 }, render: r => (
    <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
      {r.awayTeam ? `${r.homeTeam} vs ${r.awayTeam}` : r.homeTeam ?? '-'}
    </Box>
  ) },
  { key: 'end', header: 'End', render: r => <TimeCell value={r.endTime} mode="datetime" /> },
  { key: 'resolved', header: 'Resolved', render: r => <TimeCell value={r.resolvedAt} mode="datetime" /> },
  { key: 'latency', header: 'Latency', align: 'right', cellSx: { ...NUM, fontWeight: 600 }, render: r => <Box component="span" sx={{ color: latencyColor(r.latencyMs) }}>{formatLatency(r.latencyMs)}</Box> },
  { key: 'outcome', header: 'Outcome', render: r => (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
      <StatusChip status={BUCKET_KIND[r.bucket]} label={r.bucket} />
      {r.winner && <Meta>{r.winner}</Meta>}
    </Box>
  ) },
  { key: 'bets', header: 'Bets', align: 'right', cellSx: NUM, render: r => r.betCount },
];

export function ResolutionMetrics() {
  const [windowSel, setWindowSel] = useState<Window>('7d');

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-resolution-metrics', windowSel],
    queryFn: () => adminFetch<MetricsResponse>(`/resolution-metrics?window=${windowSel}`),
    refetchInterval: POLL_MEDIUM_MS,
  });

  if (isLoading && !data) return <LoadingState variant="block" />;
  if (error && !data) {
    return (
      <ErrorState
        title="Couldn’t load resolution metrics"
        message={(error as Error).message}
        details={error}
        onRetry={() => refetch()}
      />
    );
  }

  const overall = data!.data.overall;
  const perCategory = data!.data.perCategory;
  const recent = data!.data.recent;

  const successRate = overall.totalPools > 0
    ? (overall.resolved / overall.totalPools) * 100
    : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Window selector + refresh ─────────────────────────────── */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Label>Window</Label>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={windowSel}
          onChange={(_, v) => v && setWindowSel(v)}
          sx={{ '& .MuiToggleButton-root': { fontSize: '0.72rem', textTransform: 'none', px: 1.5, py: 0.4 } }}
        >
          <ToggleButton value="24h">Last 24h</ToggleButton>
          <ToggleButton value="7d">Last 7d</ToggleButton>
          <ToggleButton value="30d">Last 30d</ToggleButton>
          <ToggleButton value="all">All time</ToggleButton>
        </ToggleButtonGroup>
        <Box sx={{ flex: 1 }} />
        <RefreshButton onRefresh={() => refetch()} isFetching={isFetching} />
      </Box>

      {/* ─── Headline buckets ──────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 2 }}>
        <StatCard label="Total pools" value={overall.totalPools.toLocaleString()} />
        <StatCard
          label="Resolved"
          value={overall.resolved.toLocaleString()}
          unit={successRate !== null ? `${successRate.toFixed(1)}%` : undefined}
          color={t.gain}
          hint="status CLAIMABLE or RESOLVED"
        />
        <StatCard
          label="Cancelled"
          value={overall.cancelled.toLocaleString()}
          color={overall.cancelled > 0 ? t.warning : undefined}
          hint="sweep or admin cancel"
        />
        <StatCard
          label="Stuck"
          value={overall.stuck.toLocaleString()}
          color={overall.stuck > 0 ? t.error : undefined}
          hint="overdue, still JOINING / ACTIVE"
        />
        <StatCard
          label="Pending"
          value={overall.pending.toLocaleString()}
          hint="endTime not yet passed"
        />
      </Box>

      {/* ─── Latency percentiles ───────────────────────────────────── */}
      <SectionCard
        title="Resolution latency"
        subtitle="Time from endTime → state flip (CLAIMABLE / RESOLVED only - CANCELLED skews the tail). Lower is better; >5min on sports usually means a livescore lag."
      >
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          <StatCard label="p50 (median)" value={formatLatency(overall.p50LatencyMs)} color={latencyColor(overall.p50LatencyMs)} />
          <StatCard label="p90" value={formatLatency(overall.p90LatencyMs)} color={latencyColor(overall.p90LatencyMs)} />
          <StatCard label="p99" value={formatLatency(overall.p99LatencyMs)} color={latencyColor(overall.p99LatencyMs)} />
          <StatCard label="Average" value={formatLatency(overall.avgLatencyMs)} color={latencyColor(overall.avgLatencyMs)} />
        </Box>
      </SectionCard>

      {/* ─── Per-category breakdown ───────────────────────────────── */}
      <SectionCard title={`Per category (${perCategory.length})`}>
        {perCategory.length === 0 ? (
          <EmptyState title="No pools yet" hint={`No pools created in the ${windowSel === 'all' ? 'history' : windowSel + ' window'}.`} />
        ) : (
          <DataTable columns={CATEGORY_COLUMNS} rows={perCategory} getRowKey={c => c.code} />
        )}
      </SectionCard>

      {/* ─── Recent resolutions ───────────────────────────────────── */}
      <SectionCard
        title={`Recent resolutions (${recent.length})`}
        subtitle="Last 50 pools that flipped to resolved or cancelled. Click the id to inspect the public match page."
      >
        {recent.length === 0 ? (
          <EmptyState title="No resolutions yet" hint="When the pipeline starts flipping pools, they show up here in real time." />
        ) : (
          <DataTable columns={RECENT_COLUMNS} rows={recent} getRowKey={r => r.poolId} />
        )}
      </SectionCard>
    </Box>
  );
}
