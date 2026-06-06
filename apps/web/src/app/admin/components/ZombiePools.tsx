'use client';

import {
  Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { adminFetch, adminPost } from '../lib/adminApi';
import {
  SectionCard, StatusChip, ActionButton, LoadingState, EmptyState,
  IdCell, TimeCell, ConfirmDialog,
  useMutationFeedback,
  Body, Meta, Label,
  POLL_FAST_MS,
} from '../ui';

/**
 * Layer 3 of the sports-pool validation system. Polls
 * /api/admin/actions/zombie-sports-pools every POLL_FAST_MS and renders
 * one row per JOINING/ACTIVE sports pool whose lockTime + 2× expected
 * match duration is past with no live-score row.
 *
 * Each row gives the operator two actions:
 *   • Refund - only when betCount > 0. Uses the existing
 *     /actions/refund-pool endpoint so the same on-chain unwind path
 *     runs (per-bet authority transfer + close).
 *   • Delete - always. Removes the pool from the DB (and its bets +
 *     snapshots) without touching the chain. For 0-bet zombies this
 *     is the typical action; the on-chain rent is reclaimed via the
 *     orphan-recovery sweep later.
 *
 * Detection lives in the API; this component is read-and-act-only.
 */
interface ZombiePool {
  id: string;
  matchId: string;
  league: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  startTime: string;
  lockTime: string;
  status: string;
  betCount: number;
  expectedEnd: string;
  hoursOverdue: number;
}

export function ZombiePools() {
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [confirmAction, setConfirmAction] = useState<{ kind: 'refund' | 'delete'; pool: ZombiePool } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-zombie-sports-pools'],
    queryFn: () => adminFetch<{ data: ZombiePool[]; meta: { count: number } }>('/actions/zombie-sports-pools'),
    refetchInterval: POLL_FAST_MS,
  });

  const zombies = data?.data ?? [];
  const total = data?.meta?.count ?? zombies.length;

  // Reuse the same endpoints PoolManagement uses. Keeps the on-chain
  // path identical across surfaces - admin sees the same outcome no
  // matter where they triggered the action from.
  const refundMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/refund-pool', { poolId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-zombie-sports-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      setConfirmAction(null);
    },
    onError: () => setConfirmAction(null),
  });
  const deleteMut = useMutation({
    mutationFn: (poolId: string) => adminPost('/actions/delete-pool', { poolId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-zombie-sports-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      setConfirmAction(null);
    },
    onError: () => setConfirmAction(null),
  });

  const submitConfirm = () => {
    if (!confirmAction) return;
    const mut = confirmAction.kind === 'refund' ? refundMut : deleteMut;
    const verb = confirmAction.kind === 'refund' ? 'Refunded' : 'Deleted';
    void feedback.run(mut, confirmAction.pool.id, {
      success: `${verb} pool ${confirmAction.pool.homeTeam ?? confirmAction.pool.matchId}`,
    });
  };
  const confirmLoading = refundMut.isPending || deleteMut.isPending;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard
        title={`Zombie sports pools${zombies.length > 0 ? ` (${zombies.length})` : ''}`}
        subtitle="JOINING / ACTIVE sports pools past their expected end time with no live-score row. The match either silently finished without a feed (tennis without coverage, SDB dropped the event) or was rescheduled and the cache went stale. Force-refund if there are bets; otherwise delete and move on."
      >
        {isLoading ? (
          <LoadingState variant="block" />
        ) : zombies.length === 0 ? (
          <EmptyState
            title="No zombies - clean."
            hint="The scheduler audit runs every 30 min and re-checks all open sports pools. New zombies surface here automatically."
          />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>ID</Label></TableCell>
                  <TableCell><Label>League</Label></TableCell>
                  <TableCell><Label>Match</Label></TableCell>
                  <TableCell><Label>Status</Label></TableCell>
                  <TableCell><Label>Kickoff</Label></TableCell>
                  <TableCell><Label>Overdue</Label></TableCell>
                  <TableCell><Label>Bets</Label></TableCell>
                  <TableCell align="right"><Label>Actions</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {zombies.map(z => (
                  <TableRow key={z.id}>
                    <TableCell><IdCell value={z.id} truncate={10} /></TableCell>
                    <TableCell><Meta>{z.league ?? '-'}</Meta></TableCell>
                    <TableCell>
                      <Body>{z.homeTeam ?? '-'}</Body>
                      <Meta>vs {z.awayTeam ?? '-'}</Meta>
                    </TableCell>
                    <TableCell><StatusChip status="warning" label={z.status} /></TableCell>
                    <TableCell><TimeCell value={z.startTime} mode="datetime" /></TableCell>
                    <TableCell>
                      <Meta sx={{ color: 'text.primary', fontWeight: 600 }}>{z.hoursOverdue}h</Meta>
                    </TableCell>
                    <TableCell>{z.betCount}</TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'inline-flex', gap: 0.75, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        {z.betCount > 0 && (
                          <ActionButton
                            kind="destructive"
                            label="Refund"
                            onClick={() => setConfirmAction({ kind: 'refund', pool: z })}
                          />
                        )}
                        <ActionButton
                          kind="destructive"
                          label="Delete"
                          onClick={() => setConfirmAction({ kind: 'delete', pool: z })}
                        />
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={submitConfirm}
        loading={confirmLoading}
        title={confirmAction?.kind === 'refund' ? 'Refund pool?' : 'Delete pool?'}
        actionLabel={confirmAction?.kind === 'refund' ? 'Refund' : 'Delete'}
        severity="destructive"
        consequences={confirmAction
          ? confirmAction.kind === 'refund'
            ? <>This will refund every bet on the zombie pool <b>{confirmAction.pool.homeTeam ?? confirmAction.pool.matchId}</b> on-chain and close the pool. Each refund is a separate transaction and cannot be undone.</>
            : <>This removes the pool row + every bet + every price snapshot from the database. <b>It does NOT touch the on-chain PDA</b> - you reclaim rent separately via the orphan-recovery sweep, or leave the lamports on-chain. Cannot be undone.</>
          : ''
        }
      />
    </Box>
  );
}
