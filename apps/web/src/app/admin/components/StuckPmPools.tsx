'use client';

import { useState } from 'react';
import {
  Box, Chip, Table, TableBody, TableCell, TableHead, TableRow, Tooltip,
} from '@mui/material';
import CleaningServicesRoundedIcon from '@mui/icons-material/CleaningServicesRounded';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, StatusChip, ActionButton, RefreshButton,
  LoadingState, EmptyState, ErrorAlert, IdCell,
  Body, Meta, Label,
  useMutationFeedback,
} from '../ui';

type StuckPool = {
  id: string;
  matchId: string | null;
  homeTeam: string | null;
  league: string | null;
  subcategory: string | null;
  startTime: string;
  status: string;
  betCount: number;
  gammaDelisted: boolean | null;
  hoursOverdue: number;
};

type StuckResponse = {
  success: true;
  data: { pools: StuckPool[]; totalCount: number; truncated: boolean };
};

export function StuckPmPools() {
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Default minHoursOverdue=0 to show everything past kickoff. The 15m
  // cron also runs the sweep; this button is the manual escape hatch.
  const { data, isLoading, refetch, isFetching } = useQuery<StuckResponse>({
    queryKey: ['admin-stuck-pm-pools'],
    queryFn: () => adminFetch<StuckResponse>('/actions/stuck-pm-pools?minHoursOverdue=0'),
    staleTime: 30_000,
  });

  const cancelMutation = useMutation({
    mutationFn: ({ poolId, reason }: { poolId: string; reason: string }) =>
      adminPost('/actions/cancel-pm-pool', { poolId, reason }),
    onSettled: () => {
      setCancellingId(null);
      qc.invalidateQueries({ queryKey: ['admin-stuck-pm-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
    },
  });

  const sweepMutation = useMutation({
    mutationFn: () => adminPost('/actions/sweep-pm-pools'),
    onSettled: () => qc.invalidateQueries({ queryKey: ['admin-stuck-pm-pools'] }),
  });

  const pools = data?.data.pools ?? [];
  const totalCount = data?.data.totalCount ?? 0;
  const truncated = data?.data.truncated ?? false;

  return (
    <SectionCard
      dense
      title="Stuck Polymarket pools"
      subtitle="PM pools past kickoff still in JOINING / ACTIVE. UMA can stall 24–72h after market end and Gamma can delist a market. The sweep auto-cancels 0-bet pools past the grace window; pools with bets need a manual call here."
      actions={
        <Box sx={{ display: 'inline-flex', gap: 0.75, alignItems: 'center' }}>
          <RefreshButton onRefresh={() => refetch()} isFetching={isFetching} />
          <ActionButton
            kind="secondary"
            label="Run sweep"
            icon={<CleaningServicesRoundedIcon sx={{ fontSize: 16 }} />}
            loading={sweepMutation.isPending}
            onClick={() => feedback.run(sweepMutation, undefined, { success: 'Sweep complete' })}
          />
        </Box>
      }
    >
      {sweepMutation.isError && (
        <Box sx={{ mb: 1 }}>
          <ErrorAlert title="Sweep failed" message={(sweepMutation.error as Error).message} details={sweepMutation.error} />
        </Box>
      )}
      {cancelMutation.isError && (
        <Box sx={{ mb: 1 }}>
          <ErrorAlert title="Cancel failed" message={(cancelMutation.error as Error).message} details={cancelMutation.error} />
        </Box>
      )}

      {isLoading ? (
        <LoadingState variant="block" />
      ) : pools.length === 0 ? (
        <EmptyState variant="success" title="All caught up" hint="No Polymarket pools past their kickoff right now." />
      ) : (
        <>
          <Table size="small" sx={{ '& td, & th': { borderColor: t.border.subtle } }}>
            <TableHead>
              <TableRow>
                <TableCell><Label>Question</Label></TableCell>
                <TableCell><Label>Pool</Label></TableCell>
                <TableCell><Label>League</Label></TableCell>
                <TableCell align="right"><Label>Bets</Label></TableCell>
                <TableCell align="right"><Label>Overdue</Label></TableCell>
                <TableCell><Label>Gamma</Label></TableCell>
                <TableCell align="right"><Label>Action</Label></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pools.map(p => (
                <TableRow key={p.id} hover>
                  <TableCell sx={{ maxWidth: 380 }}>
                    <Tooltip title={`matchId=${p.matchId ?? '—'}`}>
                      <Body sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text.primary }}>
                        {p.homeTeam || '(no question)'}
                      </Body>
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {/* Click the truncated id → opens /match/<id> in a new
                        tab so the operator keeps the admin context open. */}
                    <IdCell
                      value={p.id}
                      truncate={10}
                      href={`/match/${p.id}`}
                      external
                    />
                  </TableCell>
                  <TableCell>
                    <Chip size="small" label={p.league || '—'} sx={{ height: 22, fontSize: '0.7rem', borderRadius: 1, bgcolor: t.hover.medium, color: t.text.primary }} />
                    {p.subcategory && (
                      <Chip size="small" label={p.subcategory} variant="outlined" sx={{ ml: 0.5, height: 22, fontSize: '0.7rem', borderRadius: 1 }} />
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {p.betCount === 0
                      ? <Meta>0</Meta>
                      : <StatusChip status="warning" label={`${p.betCount} bets`} />}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.hoursOverdue}h</TableCell>
                  <TableCell>
                    {p.gammaDelisted === true
                      ? <StatusChip status="error" label="DELISTED" />
                      : p.gammaDelisted === false
                        ? <StatusChip status="ok" label="exists" />
                        : <StatusChip status="neutral" label="—" />}
                  </TableCell>
                  <TableCell align="right">
                    <ActionButton
                      kind={p.betCount > 0 ? 'destructive' : 'secondary'}
                      label={p.betCount > 0 ? 'Cancel + refund' : 'Cancel'}
                      loading={cancellingId === p.id && cancelMutation.isPending}
                      onClick={() => {
                        const reason = p.gammaDelisted ? 'gamma-delisted' : `admin-${p.hoursOverdue}h-overdue`;
                        setCancellingId(p.id);
                        void feedback.run(cancelMutation, { poolId: p.id, reason }, {
                          success: p.betCount > 0 ? 'Cancelled, refunds queued' : 'Pool cancelled',
                        });
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {truncated && (
            <Meta sx={{ mt: 1, display: 'block' }}>
              Showing 20 of {totalCount} — run the sweep to bulk-cancel 0-bet pools, then refresh.
            </Meta>
          )}
        </>
      )}
    </SectionCard>
  );
}
