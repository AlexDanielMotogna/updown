'use client';

import { useState } from 'react';
import { getExplorerTxUrl } from '@/lib/format';
import {
  Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatCard, StatusChip, ActionButton,
  LoadingState, EmptyState, ErrorState,
  IdCell, TimeCell, Label,
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
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><Label>Closed at</Label></TableCell>
                      <TableCell><Label>Pool ID</Label></TableCell>
                      <TableCell><Label>Asset</Label></TableCell>
                      <TableCell><Label>Interval</Label></TableCell>
                      <TableCell><Label>Total pool</Label></TableCell>
                      <TableCell><Label>Bets</Label></TableCell>
                      <TableCell><Label>Winner</Label></TableCell>
                      <TableCell><Label>Rent reclaimed</Label></TableCell>
                      <TableCell><Label>TX</Label></TableCell>
                      <TableCell><Label>Source</Label></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(closuresData?.data ?? []).map(c => (
                      <TableRow key={c.id} hover>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}><TimeCell value={c.closedAt} mode="datetime" /></TableCell>
                        <TableCell><IdCell value={c.poolId} truncate={10} /></TableCell>
                        <TableCell>{c.payload.asset ?? '-'}</TableCell>
                        <TableCell>{c.payload.interval ?? '-'}</TableCell>
                        <TableCell sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.payload.totalPool ? formatUsdc(c.payload.totalPool) : '0'}</TableCell>
                        <TableCell>{c.payload.betCount ?? '0'}</TableCell>
                        <TableCell>
                          {c.payload.winner && c.payload.winner !== 'none' ? (
                            <StatusChip
                              status={c.payload.winner === 'UP' ? 'ok' : c.payload.winner === 'DOWN' ? 'error' : 'warning'}
                              label={c.payload.winner}
                            />
                          ) : '-'}
                        </TableCell>
                        <TableCell sx={{ color: t.success, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                          {c.payload.rentReclaimedSol ?? '0'} SOL
                        </TableCell>
                        <TableCell>
                          {c.payload.txSignature ? (
                            <a
                              // Cluster comes from getExplorerTxUrl, which
                              // reads SOLANA_CLUSTER from env. The previous
                              // hardcoded ?cluster=devnet broke explorer
                              // links on mainnet - Plan §3.5.
                              href={getExplorerTxUrl(c.payload.txSignature)}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: t.info, textDecoration: 'none', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.7rem' }}
                            >
                              {c.payload.txSignature.slice(0, 8)}…
                            </a>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <StatusChip
                            status={c.payload.source === 'admin' ? 'warning' : 'neutral'}
                            label={c.payload.source === 'admin' ? 'Admin' : 'Auto'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {closuresData?.meta && closuresData.meta.totalPages > 1 && (
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', mt: 2 }}>
                  <ActionButton kind="secondary" label="Previous" disabled={closuresPage <= 1} onClick={() => setClosuresPage(p => p - 1)} />
                  <Label>{closuresPage} / {closuresData.meta.totalPages}</Label>
                  <ActionButton kind="secondary" label="Next" disabled={closuresPage >= closuresData.meta.totalPages} onClick={() => setClosuresPage(p => p + 1)} />
                </Box>
              )}
            </>
          )}
        </SectionCard>
      )}
    </Box>
  );
}
