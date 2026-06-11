'use client';

import { useState } from 'react';
import { Box, ToggleButtonGroup, ToggleButton, TextField } from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { adminPost } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  AdminDialog, ActionButton, ErrorAlert, Body, Meta, Label,
  useMutationFeedback,
} from '../ui';

export interface ResolvableSportsPool {
  id: string;
  homeTeam: string | null;
  awayTeam: string | null;
  league?: string | null;
}

type WinnerChoice = 'HOME' | 'DRAW' | 'AWAY';

/**
 * Manual winner-resolution for a stuck sports pool of any league (not just CL/EL
 * knockouts). Lets the operator set the final result (HOME / DRAW / AWAY) + an
 * optional score, running the same on-chain `resolve_with_winner` path the
 * auto-resolver uses. Used by the Zombie / Needs-Attention queue for pools that
 * finished without a live-score feed.
 */
export function ResolveSportsDialog({ pool, onClose, onResolved }: {
  pool: ResolvableSportsPool;
  onClose: () => void;
  onResolved: () => void;
}) {
  const feedback = useMutationFeedback();
  const [winner, setWinner] = useState<WinnerChoice>('HOME');
  const [homeScore, setHomeScore] = useState('');
  const [awayScore, setAwayScore] = useState('');
  const [reason, setReason] = useState('');

  const resolveMutation = useMutation({
    mutationFn: () => adminPost<{ success: true; data: { onChainResolved: boolean } }>('/sports/resolve-knockout', {
      poolId: pool.id,
      winner,
      regulationHomeScore: homeScore !== '' ? Number(homeScore) : undefined,
      regulationAwayScore: awayScore !== '' ? Number(awayScore) : undefined,
      reason: reason || 'admin-manual-resolve',
    }),
    onSuccess: () => onResolved(),
  });

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

  const winnerLabel = winner === 'DRAW' ? 'DRAW' : winner === 'HOME' ? pool.homeTeam ?? 'HOME' : pool.awayTeam ?? 'AWAY';

  return (
    <AdminDialog
      open
      onClose={onClose}
      title="Resolve sports pool"
      maxWidth="sm"
      loading={resolveMutation.isPending}
      footer={
        <>
          <ActionButton kind="tertiary" label="Cancel" onClick={onClose} disabled={resolveMutation.isPending} />
          <ActionButton
            kind="primary"
            label={`Resolve as ${winnerLabel}`}
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
            {pool.homeTeam ?? 'Home'} vs {pool.awayTeam ?? 'Away'}
          </Body>
          {pool.league && <Meta sx={{ display: 'block', mt: 0.25 }}>{pool.league}</Meta>}
        </Box>

        <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
          <Body sx={{ fontSize: '0.78rem' }}>
            Set the <Box component="strong" sx={{ color: t.text.primary }}>final result</Box>. This pays out winners on-chain and cannot be undone — verify the result against a real source first.
          </Body>
        </Box>

        <Box>
          <Label sx={{ display: 'block', mb: 0.5 }}>Result</Label>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={winner}
            onChange={(_, v) => v && setWinner(v as WinnerChoice)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.8rem' } }}
          >
            <ToggleButton value="HOME">{pool.homeTeam ?? 'Home'} win</ToggleButton>
            <ToggleButton value="DRAW">Draw</ToggleButton>
            <ToggleButton value="AWAY">{pool.awayTeam ?? 'Away'} win</ToggleButton>
          </ToggleButtonGroup>
        </Box>

        <Box>
          <Label sx={{ display: 'block', mb: 0.5 }}>Final score (optional)</Label>
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <TextField size="small" type="number" label={pool.homeTeam || 'Home'} value={homeScore} onChange={e => setHomeScore(e.target.value)} inputProps={{ min: 0, max: 99 }} sx={{ width: 120 }} />
            <Meta>-</Meta>
            <TextField size="small" type="number" label={pool.awayTeam || 'Away'} value={awayScore} onChange={e => setAwayScore(e.target.value)} inputProps={{ min: 0, max: 99 }} sx={{ width: 120 }} />
          </Box>
          {!scoresValid && bothScoresFilled && (
            <Body sx={{ fontSize: '0.7rem', mt: 0.5, color: t.error }}>
              Score is inconsistent with the {winner.toLowerCase()} pick.
            </Body>
          )}
          {neitherFilled && (
            <Meta sx={{ display: 'block', mt: 0.5 }}>Leave blank to skip — the public match page won&apos;t show a score.</Meta>
          )}
        </Box>

        <TextField
          size="small"
          label="Reason (audit log)"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="e.g. SDB never reported the result; confirmed via ESPN"
          fullWidth
        />

        {resolveMutation.isError && (
          <ErrorAlert title="Resolve failed" message={(resolveMutation.error as Error).message} details={resolveMutation.error} />
        )}
      </Box>
    </AdminDialog>
  );
}
