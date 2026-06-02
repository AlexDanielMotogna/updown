'use client';

import { useMemo, useState } from 'react';
import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatusChip, AdminDialog, ConfirmDialog,
  ActionButton, LoadingState, EmptyState, FilterBar,
  WalletCell, IdCell, TimeCell,
  useMutationFeedback,
  Body, Meta, Label,
  POLL_FAST_MS,
  type StatusKind,
} from '../ui';

interface PoolRow {
  id: string;
  asset: string;
  interval: string;
  status: string;
  endTime: string;
  totalUp: string;
  totalDown: string;
  betCount: number;
  stuckMinutes?: number;
}

interface PoolDetail extends PoolRow {
  poolId: string;
  strikePrice: string | null;
  finalPrice: string | null;
  winner: string | null;
  bets: Array<{ id: string; walletAddress: string; side: string; amount: string; claimed: boolean }>;
}

// Pool status → StatusChip kind. Driven by domain semantics: JOINING is
// the "betting window open" warm state (warning), ACTIVE is mid-flight
// (info), RESOLVED is done with winner decided (neutral), CLAIMABLE is
// the desirable end state (ok).
const STATUS_TO_KIND: Record<string, StatusKind> = {
  JOINING: 'warning',
  ACTIVE: 'info',
  RESOLVED: 'neutral',
  CLAIMABLE: 'ok',
};

export function PoolManagement() {
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedPoolId, setSelectedPoolId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // Confirmation gate for irreversible on-chain actions. Per
  // PLAN-ADMIN-REFACTOR.md §3.3: Resolve/Refund had NO confirmation —
  // a single misclick burned a transaction.
  const [confirmAction, setConfirmAction] = useState<{ kind: 'resolve' | 'refund'; poolId: string; asset: string } | null>(null);

  const { data: stuckData, isLoading: stuckLoading } = useQuery({
    queryKey: ['admin-stuck-pools'],
    queryFn: () => adminFetch<{ data: PoolRow[] }>('/pools/stuck'),
    refetchInterval: POLL_FAST_MS,
  });

  const { data: poolsData, isLoading: poolsLoading } = useQuery({
    queryKey: ['admin-pools', statusFilter],
    queryFn: () => adminFetch<{ data: PoolRow[]; meta: { total: number } }>(`/pools?limit=100${statusFilter ? `&status=${statusFilter}` : ''}`),
    refetchInterval: POLL_FAST_MS,
  });

  const { data: detailData } = useQuery({
    queryKey: ['admin-pool-detail', selectedPoolId],
    queryFn: () => adminFetch<{ data: PoolDetail }>(`/pools/${selectedPoolId}`),
    enabled: !!selectedPoolId,
  });

  const resolveMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/resolve-pool', { poolId }),
    onSuccess: () => {
      // Plan §3.3: invalidate detail too so the dialog reflects the new
      // status without a manual refresh.
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pool-detail'] });
      setConfirmAction(null);
    },
    onError: () => setConfirmAction(null),
  });

  const refundMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/refund-pool', { poolId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pool-detail'] });
      setConfirmAction(null);
    },
    onError: () => setConfirmAction(null),
  });

  const stuckPools = stuckData?.data ?? [];
  const allPools = poolsData?.data ?? [];
  const totalPools = poolsData?.meta?.total ?? allPools.length;

  // Local filter on asset / id. Plan §3.3 calls for backend pagination +
  // backend search; that's the deferred follow-up. Local filter still
  // works for the 100-row page.
  const filteredPools = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allPools;
    return allPools.filter(p => p.asset.toLowerCase().includes(q) || p.id.toLowerCase().includes(q));
  }, [allPools, search]);

  const submitConfirm = () => {
    if (!confirmAction) return;
    const mut = confirmAction.kind === 'resolve' ? resolveMut : refundMut;
    const verb = confirmAction.kind === 'resolve' ? 'Resolved' : 'Refunded';
    void feedback.run(mut, confirmAction.poolId, { success: `${verb} pool ${confirmAction.asset}` });
  };
  const confirmLoading = resolveMut.isPending || refundMut.isPending;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Stuck pools banner + table ─────────────────────────────── */}
      {stuckLoading ? (
        <LoadingState variant="inline" />
      ) : stuckPools.length > 0 ? (
        <SectionCard
          dense
          accentColor={t.error}
          title={`Stuck pools (${stuckPools.length})`}
          subtitle="Past endTime but still JOINING / ACTIVE. Resolve or refund manually."
        >
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>ID</Label></TableCell>
                  <TableCell><Label>Asset</Label></TableCell>
                  <TableCell><Label>Status</Label></TableCell>
                  <TableCell><Label>Stuck for</Label></TableCell>
                  <TableCell><Label>Bets</Label></TableCell>
                  <TableCell align="right"><Label>Actions</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {stuckPools.map(p => (
                  <TableRow key={p.id}>
                    <TableCell><IdCell value={p.id} truncate={10} /></TableCell>
                    <TableCell>{p.asset}</TableCell>
                    <TableCell><StatusChip status={STATUS_TO_KIND[p.status] ?? 'neutral'} label={p.status} /></TableCell>
                    <TableCell>{p.stuckMinutes}m</TableCell>
                    <TableCell>{p.betCount}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', gap: 0.75 }}>
                        <ActionButton kind="secondary" label="Resolve" onClick={() => setConfirmAction({ kind: 'resolve', poolId: p.id, asset: p.asset })} />
                        <ActionButton kind="destructive" label="Refund" onClick={() => setConfirmAction({ kind: 'refund', poolId: p.id, asset: p.asset })} />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </SectionCard>
      ) : (
        <SectionCard dense accentColor={t.success} title="All clear">
          <Body>No stuck pools right now.</Body>
        </SectionCard>
      )}

      {/* ─── All pools list ─────────────────────────────────────────── */}
      <SectionCard
        title={`All Pools (${filteredPools.length}${filteredPools.length !== totalPools ? ` of ${totalPools}` : ''})`}
      >
        <Box sx={{ mb: 2, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box sx={{ flex: 1, minWidth: 220 }}>
            <FilterBar
              value={search}
              onChange={setSearch}
              placeholder="Search by asset or pool id…"
            />
          </Box>
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} label="Status">
              <MenuItem value="">All</MenuItem>
              <MenuItem value="JOINING">JOINING</MenuItem>
              <MenuItem value="ACTIVE">ACTIVE</MenuItem>
              <MenuItem value="RESOLVED">RESOLVED</MenuItem>
              <MenuItem value="CLAIMABLE">CLAIMABLE</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {poolsLoading ? (
          <LoadingState variant="block" />
        ) : filteredPools.length === 0 ? (
          <EmptyState
            title={allPools.length === 0 ? 'No pools to display' : 'No pools match the current filter'}
            hint={allPools.length === 0
              ? 'Pools auto-create on the scheduled interval. Check System Health for scheduler status.'
              : 'Clear the search or status filter to see all pools.'}
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>ID</Label></TableCell>
                  <TableCell><Label>Asset</Label></TableCell>
                  <TableCell><Label>Interval</Label></TableCell>
                  <TableCell><Label>Status</Label></TableCell>
                  <TableCell><Label>End time</Label></TableCell>
                  <TableCell><Label>Up / Down</Label></TableCell>
                  <TableCell><Label>Bets</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredPools.map(p => (
                  <TableRow
                    key={p.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => setSelectedPoolId(p.id)}
                  >
                    <TableCell onClick={(e) => e.stopPropagation()}><IdCell value={p.id} truncate={10} /></TableCell>
                    <TableCell>{p.asset}</TableCell>
                    <TableCell>{p.interval}</TableCell>
                    <TableCell><StatusChip status={STATUS_TO_KIND[p.status] ?? 'neutral'} label={p.status} /></TableCell>
                    <TableCell><TimeCell value={p.endTime} mode="datetime" /></TableCell>
                    <TableCell>{p.totalUp} / {p.totalDown}</TableCell>
                    <TableCell>{p.betCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* ─── Pool detail dialog ─────────────────────────────────────── */}
      <AdminDialog
        open={!!selectedPoolId}
        onClose={() => setSelectedPoolId(null)}
        title="Pool detail"
        maxWidth="md"
        footer={<ActionButton kind="secondary" label="Close" onClick={() => setSelectedPoolId(null)} />}
      >
        {detailData?.data ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 0.75, alignItems: 'center' }}>
              <Label>DB id</Label><IdCell value={detailData.data.id} />
              <Label>Pool pubkey</Label><IdCell value={detailData.data.poolId} truncate={20} />
              <Label>Asset</Label><Body>{detailData.data.asset}</Body>
              <Label>Interval</Label><Body>{detailData.data.interval}</Body>
              <Label>Status</Label><StatusChip status={STATUS_TO_KIND[detailData.data.status] ?? 'neutral'} label={detailData.data.status} />
              <Label>Winner</Label><Body>{detailData.data.winner ?? '—'}</Body>
              <Label>Strike</Label><Body>{detailData.data.strikePrice ?? '—'}</Body>
              <Label>Final</Label><Body>{detailData.data.finalPrice ?? '—'}</Body>
            </Box>
            {detailData.data.bets.length > 0 && (
              <>
                <Label sx={{ mt: 1.5 }}>Bets ({detailData.data.bets.length})</Label>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><Label>Wallet</Label></TableCell>
                      <TableCell><Label>Side</Label></TableCell>
                      <TableCell><Label>Amount</Label></TableCell>
                      <TableCell><Label>Claimed</Label></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {detailData.data.bets.map(b => (
                      <TableRow key={b.id}>
                        <TableCell><WalletCell address={b.walletAddress} /></TableCell>
                        <TableCell>
                          <StatusChip
                            status={b.side === 'UP' ? 'ok' : b.side === 'DOWN' ? 'error' : 'warning'}
                            label={b.side}
                          />
                        </TableCell>
                        <TableCell>{b.amount}</TableCell>
                        <TableCell>{b.claimed ? 'Yes' : 'No'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Box>
        ) : (
          <LoadingState variant="block" />
        )}
      </AdminDialog>

      {/* ─── Resolve / Refund confirm (irreversible) ────────────────── */}
      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={submitConfirm}
        loading={confirmLoading}
        title={confirmAction?.kind === 'resolve' ? 'Resolve pool?' : 'Refund pool?'}
        actionLabel={confirmAction?.kind === 'resolve' ? 'Resolve' : 'Refund'}
        severity={confirmAction?.kind === 'refund' ? 'destructive' : 'warning'}
        consequences={confirmAction
          ? confirmAction.kind === 'resolve'
            ? <>This will fetch the final price and resolve <b>{confirmAction.asset}</b> on-chain. The transaction cannot be undone.</>
            : <>This will refund every bet on <b>{confirmAction.asset}</b> and close the pool. Each refund is a separate on-chain transaction and cannot be undone.</>
          : ''
        }
      />
    </Box>
  );
}
