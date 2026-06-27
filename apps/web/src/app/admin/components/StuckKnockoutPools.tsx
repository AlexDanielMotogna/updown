'use client';

import { useState } from 'react';
import {
  Box, Chip, Table, TableBody, TableCell, TableHead, TableRow,
  TextField,
} from '@mui/material';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, AdminDialog, StatusChip, ActionButton, RefreshButton,
  LoadingState, EmptyState, ErrorAlert,
  Body, Meta, Label,
  useMutationFeedback,
} from '../ui';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';

type StuckKnockout = {
  id: string;
  matchId: string | null;
  league: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeTeamCrest: string | null;
  awayTeamCrest: string | null;
  startTime: string;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  betCount: number;
  minutesPastExpectedEnd: number;
  graceWindowExpired: boolean;
};

type StuckResponse = {
  success: true;
  data: { knockouts: StuckKnockout[]; count: number };
};

type WinnerChoice = 'HOME' | 'DRAW' | 'AWAY';

/**
 * CL/EL knockouts the Phase B grace-window deliberately leaves stuck:
 * Odds API's `completed:true` can't tell us if the match went to ET, and
 * regulation-time bets on a CL knockout 1-1 reg → 2-1 ET should resolve
 * to DRAW, not the ET winner. This panel lets the admin enter the
 * regulation result manually.
 */
export function StuckKnockoutPools() {
  const qc = useQueryClient();
  const [pending, setPending] = useState<StuckKnockout | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<StuckResponse>({
    queryKey: ['admin-stuck-knockouts'],
    queryFn: () => adminFetch<StuckResponse>('/sports/stuck-knockouts'),
    staleTime: 30_000,
  });

  const knockouts = data?.data.knockouts ?? [];

  return (
    <SectionCard
      dense
      title="Stuck knockout pools (CL / EL)"
      subtitle="Champions League / Europa League knockouts past expected end. The auto-resolver waits on SDB indefinitely so a 1-1 regulation → 2-1 ET tie doesn’t mis-resolve to the ET winner - admin enters the regulation result manually."
      actions={<RefreshButton onRefresh={() => refetch()} isFetching={isFetching} />}
    >
      {isLoading ? (
        <LoadingState variant="block" />
      ) : knockouts.length === 0 ? (
        <EmptyState variant="success" title="All caught up" hint="No knockout pools waiting on regulation-time resolution." />
      ) : (
        <Table size="small" sx={{ '& td, & th': { borderColor: t.border.subtle } }}>
          <TableHead>
            <TableRow>
              <TableCell><Label>Match</Label></TableCell>
              <TableCell><Label>League</Label></TableCell>
              <TableCell align="right"><Label>Bets</Label></TableCell>
              <TableCell align="right"><Label>Past end</Label></TableCell>
              <TableCell><Label>Grace</Label></TableCell>
              <TableCell align="right"><Label>Action</Label></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {knockouts.map(p => (
              <TableRow key={p.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {p.homeTeamCrest && <Box component="img" src={p.homeTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                    <Body sx={{ fontSize: '0.78rem', color: t.text.primary }}>{p.homeTeam}</Body>
                    <Meta sx={{ mx: 0.5 }}>vs</Meta>
                    {p.awayTeamCrest && <Box component="img" src={p.awayTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                    <Body sx={{ fontSize: '0.78rem', color: t.text.primary }}>{p.awayTeam}</Body>
                  </Box>
                </TableCell>
                <TableCell>
                  <Chip size="small" label={p.league} sx={{ height: 22, fontSize: '0.7rem', borderRadius: 1, bgcolor: t.hover.medium, color: t.text.primary }} />
                </TableCell>
                <TableCell align="right">
                  {p.betCount === 0 ? <Meta>0</Meta> : <StatusChip status="warning" label={`${p.betCount} bets`} />}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.minutesPastExpectedEnd}m</TableCell>
                <TableCell>
                  {p.graceWindowExpired
                    ? <StatusChip status="error" label="expired" />
                    : <StatusChip status="pending" label="in window" />}
                </TableCell>
                <TableCell align="right">
                  <ActionButton
                    kind="secondary"
                    label="Resolve manually"
                    icon={<GavelRoundedIcon sx={{ fontSize: 14 }} />}
                    onClick={() => setPending(p)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {pending && (
        <ResolveKnockoutDialog
          pool={pending}
          onClose={() => setPending(null)}
          onResolved={() => {
            setPending(null);
            qc.invalidateQueries({ queryKey: ['admin-stuck-knockouts'] });
            qc.invalidateQueries({ queryKey: ['admin-pools'] });
            qc.invalidateQueries({ queryKey: ['admin-livescore-health'] });
          }}
        />
      )}
    </SectionCard>
  );
}

// ─── Resolve dialog ───────────────────────────────────────────────────────────

function ResolveKnockoutDialog({ pool, onClose, onResolved }: {
  pool: StuckKnockout;
  onClose: () => void;
  onResolved: () => void;
}) {
  const feedback = useMutationFeedback();
  const [winner, setWinner] = useState<WinnerChoice>('DRAW');
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  const draw = winner === 'DRAW';

  const resolveMutation = useMutation({
    mutationFn: () => adminPost<{ success: true; data: { onChainResolved: boolean } }>('/sports/resolve-knockout', {
      poolId: pool.id,
      winner,
      regulationHomeScore: homeScore !== '' ? Number(homeScore) : undefined,
      regulationAwayScore: awayScore !== '' ? Number(awayScore) : undefined,
      reason: reason || 'admin-knockout-resolve',
    }),
    onSuccess: () => onResolved(),
  });

  // Validation: if either score is filled, both must be filled and consistent
  // with the winner choice (HOME → home > away, DRAW → equal, AWAY → away > home).
  const bothScoresFilled = homeScore !== '' && awayScore !== '';
  const neitherFilled = homeScore === '' && awayScore === '';
  const scoresValid = neitherFilled || (bothScoresFilled && (
    (winner === 'HOME' && Number(homeScore) > Number(awayScore)) ||
    (winner === 'AWAY' && Number(awayScore) > Number(homeScore)) ||
    (winner === 'DRAW' && Number(homeScore) === Number(awayScore))
  ));

  const submit = () => {
    void feedback.run(resolveMutation, undefined, { success: `Resolved as ${winner}` });
  };

  return (
    <AdminDialog
      open
      onClose={onClose}
      title={`Resolve ${pool.league} knockout`}
      maxWidth="sm"
      loading={resolveMutation.isPending}
      footer={
        <>
          <ActionButton kind="tertiary" label="Cancel" onClick={onClose} disabled={resolveMutation.isPending} />
          <ActionButton
            kind="primary"
            label={`Resolve as ${winner === 'DRAW' ? 'DRAW' : winner === 'HOME' ? pool.homeTeam ?? 'HOME' : pool.awayTeam ?? 'AWAY'}`}
            loading={resolveMutation.isPending}
            disabled={!scoresValid}
            onClick={submit}
          />
        </>
      }
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ p: 1.25, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5 }}>
          <Body sx={{ fontWeight: 600, color: t.text.primary, fontSize: '0.9rem' }}>
            {pool.homeTeam} vs {pool.awayTeam}
          </Body>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mt: 0.5 }}>
            <Meta>kickoff <Box component="strong" sx={{ color: t.text.secondary }}>{new Date(pool.startTime).toLocaleString()}</Box></Meta>
            <Meta>{pool.minutesPastExpectedEnd}m past expected end</Meta>
            <Meta>{pool.betCount} bets</Meta>
          </Box>
        </Box>

        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
          <Body sx={{ fontSize: '0.78rem' }}>
            Regulation-time rules: the bet resolves on the <Box component="strong" sx={{ color: t.text.primary }}>90'</Box> result. If the match went to extra time / penalties, regulation was a draw - pick <Box component="strong" sx={{ color: t.text.primary }}>DRAW</Box> even if a team eventually won.
          </Body>
        </Box>

        <Box>
          <Label sx={{ display: 'block', mb: 0.5 }}>Regulation result</Label>
          <SegmentedToggle
            size="sm"
            fullWidth
            value={winner}
            onChange={(v) => setWinner(v as WinnerChoice)}
            tokens={t}
            options={[
              { value: 'HOME', label: `${pool.homeTeam} win` },
              { value: 'DRAW', label: "Draw at 90'" },
              { value: 'AWAY', label: `${pool.awayTeam} win` },
            ]}
          />
          {draw && (
            <Meta sx={{ display: 'block', mt: 0.5 }}>
              Use this for ties that went to ET or penalties - the bet still resolves to DRAW.
            </Meta>
          )}
        </Box>

        <Box>
          <Label sx={{ display: 'block', mb: 0.5 }}>Regulation score (optional)</Label>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField
              size="small"
              type="number"
              label={pool.homeTeam || 'Home'}
              value={homeScore}
              onChange={e => setHomeScore(e.target.value)}
              inputProps={{ min: 0, max: 99 }}
              sx={{ width: 120 }}
            />
            <Meta>-</Meta>
            <TextField
              size="small"
              type="number"
              label={pool.awayTeam || 'Away'}
              value={awayScore}
              onChange={e => setAwayScore(e.target.value)}
              inputProps={{ min: 0, max: 99 }}
              sx={{ width: 120 }}
            />
          </Box>
          {!scoresValid && bothScoresFilled && (
            <Body sx={{ fontSize: '0.7rem', mt: 0.5, color: t.error }}>
              Score is inconsistent with the {winner.toLowerCase()} pick.
            </Body>
          )}
          {neitherFilled && (
            <Meta sx={{ display: 'block', mt: 0.5 }}>
              Leave blank to skip - the public match page won't show a score.
            </Meta>
          )}
        </Box>

        <TextField
          size="small"
          label="Reason (audit log)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. SDB never reported AET status; confirmed via UEFA.com"
          fullWidth
        />

        {resolveMutation.isError && (
          <ErrorAlert title="Resolve failed" message={(resolveMutation.error as Error).message} details={resolveMutation.error} />
        )}
      </Box>
    </AdminDialog>
  );
}
