'use client';

import { useState } from 'react';
import { getExplorerTxUrl } from '@/lib/format';
import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, ActionButton,
  LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label,
  DataTable, type Column, Paginator,
  POLL_MEDIUM_MS,
} from '../ui';

interface FinanceData {
  data: {
    totalVolume: string;
    totalPayouts: string;
    totalFeesCollected: string;
    totalBets: number;
    // Plan §3.5 - flagged as 'never read by the UI'. Backend still ships
    // them; we just stop pretending we use them. authorityUsdcDisplay is
    // the human-formatted string the StatCard binds against.
    authorityUsdcDisplay: string | null;
    poolStatusCounts: Record<string, number>;
    closures: {
      totalPoolsClosed: number;
      totalRentReclaimedSol: string;
    };
  };
}

interface ClosureRow {
  id: string;
  poolId: string;
  payload: {
    asset?: string;
    interval?: string;
    totalPool?: string;
    betCount?: string;
    winner?: string;
    rentReclaimedSol?: string;
    rentReclaimedLamports?: string;
    txSignature?: string;
    source?: string;
    [key: string]: string | undefined;
  };
  closedAt: string;
}

interface ClosuresData {
  data: ClosureRow[];
  meta: { page: number; totalPages: number; total: number };
}

function formatUsdc(raw: string): string {
  const n = Number(raw) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CLOSURE_COLUMNS: Column<ClosureRow>[] = [
  { key: 'closedAt', header: 'Closed at', nowrap: true, render: c => <TimeCell value={c.closedAt} mode="datetime" /> },
  { key: 'poolId', header: 'Pool ID', render: c => <IdCell value={c.poolId} truncate={10} /> },
  { key: 'asset', header: 'Asset', render: c => c.payload.asset ?? '-' },
  { key: 'interval', header: 'Interval', render: c => c.payload.interval ?? '-' },
  { key: 'totalPool', header: 'Total pool', cellSx: { fontVariantNumeric: 'tabular-nums' }, render: c => c.payload.totalPool ? formatUsdc(c.payload.totalPool) : '0' },
  { key: 'bets', header: 'Bets', render: c => c.payload.betCount ?? '0' },
  { key: 'winner', header: 'Winner', render: c => (c.payload.winner && c.payload.winner !== 'none')
      ? <StatusChip status={c.payload.winner === 'UP' ? 'ok' : c.payload.winner === 'DOWN' ? 'error' : 'warning'} label={c.payload.winner} />
      : '-' },
  { key: 'rent', header: 'Rent reclaimed', cellSx: { color: t.success, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }, render: c => `${c.payload.rentReclaimedSol ?? '0'} SOL` },
  { key: 'tx', header: 'TX', render: c => c.payload.txSignature
      ? <a href={getExplorerTxUrl(c.payload.txSignature)} target="_blank" rel="noopener noreferrer" style={{ color: t.info, textDecoration: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.7rem' }}>{c.payload.txSignature.slice(0, 8)}…</a>
      : '-' },
  { key: 'source', header: 'Source', render: c => <StatusChip status={c.payload.source === 'admin' ? 'warning' : 'neutral'} label={c.payload.source === 'admin' ? 'Admin' : 'Auto'} /> },
];

export function FinancialOverview() {
  const [closuresPage, setClosuresPage] = useState(1);
  const [showClosures, setShowClosures] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-finance'],
    queryFn: () => adminFetch<FinanceData>('/finance/overview'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const { data: closuresData, isLoading: closuresLoading } = useQuery({
    queryKey: ['admin-closures', closuresPage],
    queryFn: () => adminFetch<ClosuresData>(`/finance/closures?page=${closuresPage}&limit=20`),
    enabled: showClosures,
  });

  if (isLoading) return <LoadingState variant="block" />;
  if (error) {
    return (
      <ErrorState
        title="Couldn’t load financial overview"
        message={(error as Error).message}
        details={error}
        onRetry={() => refetch()}
      />
    );
  }

  const f = data!.data;
  const netRevenue = String(BigInt(f.totalVolume) - BigInt(f.totalPayouts));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Headline stats ─────────────────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(3, 1fr)' }, gap: 2 }}>
        <StatCard label="Total volume" value={formatUsdc(f.totalVolume)} unit="USDC" />
        <StatCard label="Total payouts" value={formatUsdc(f.totalPayouts)} unit="USDC" />
        <StatCard
          label="Fees collected"
          value={formatUsdc(f.totalFeesCollected)}
          unit="USDC"
          color={t.success}
          hint="Calculated from claimed bets"
        />
        <StatCard label="Total bets" value={f.totalBets.toLocaleString()} />
        <StatCard
          label="Authority USDC (on-chain)"
          value={f.authorityUsdcDisplay ?? '-'}
          color={t.warning}
          hint="Fee wallet balance on the active cluster"
        />
        <StatCard
          label="Net revenue"
          value={formatUsdc(netRevenue)}
          unit="USDC"
          hint="Volume − payouts (includes unclaimed)"
        />
      </Box>

      {/* ─── Closures + status breakdown ────────────────────────────── */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <SectionCard
          dense
          title="Pool closures"
          actions={
            <ActionButton
              kind="secondary"
              label={showClosures ? 'Hide details' : 'View closed pools'}
              onClick={() => setShowClosures(v => !v)}
            />
          }
        >
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Box>
              <Label>Pools closed</Label>
              <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: t.text.primary, mt: 0.25 }}>
                {f.closures.totalPoolsClosed.toLocaleString()}
              </Box>
            </Box>
            <Box>
              <Label>Rent reclaimed</Label>
              <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: t.text.primary, mt: 0.25 }}>
                {f.closures.totalRentReclaimedSol} SOL
              </Box>
            </Box>
          </Box>
        </SectionCard>
        <SectionCard dense title="Pool status breakdown">
          {Object.keys(f.poolStatusCounts).length === 0 ? (
            <EmptyState title="No pool data yet" />
          ) : (
            <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
              {Object.entries(f.poolStatusCounts).map(([status, count]) => (
                <Box key={status}>
                  <Label>{status}</Label>
                  <Box sx={{ fontSize: '1.2rem', fontWeight: 700, color: t.text.primary, mt: 0.25 }}>
                    {count.toLocaleString()}
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </SectionCard>
      </Box>

      {/* ─── Closures detail table ──────────────────────────────────── */}
      {showClosures && (
        <SectionCard
          title="Closed pools history"
          subtitle={closuresData?.meta ? `Page ${closuresData.meta.page} of ${closuresData.meta.totalPages} · ${closuresData.meta.total.toLocaleString()} closures` : undefined}
        >
          {closuresLoading ? (
            <LoadingState variant="block" />
          ) : (closuresData?.data ?? []).length === 0 ? (
            <EmptyState title="No closures yet" hint="Pools show up here once the scheduler closes them on-chain." />
          ) : (
            <>
              <DataTable columns={CLOSURE_COLUMNS} rows={closuresData?.data ?? []} getRowKey={c => c.id} />
              <Paginator page={closuresPage} totalPages={closuresData?.meta?.totalPages ?? 1} onChange={setClosuresPage} />
            </>
          )}
        </SectionCard>
      )}
    </Box>
  );
}
