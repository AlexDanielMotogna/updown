'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Button, Chip, Alert, Table, TableBody, TableCell,
  TableHead, TableRow, CircularProgress, Tooltip, Dialog, DialogTitle,
  DialogContent, DialogActions, ToggleButtonGroup, ToggleButton, TextField,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';

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
 * to DRAW, not the ET winner. The Phase C `SourceSplitPanel` shows the
 * count of these; this panel lets the admin actually resolve them once
 * the regulation result is known.
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
    <Card sx={{ p: 2, border: `1px solid ${t.border.medium}` }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
        <Box>
          <Typography variant="subtitle2">Stuck Knockout Pools (CL / EL)</Typography>
          <Typography variant="body2" color="text.secondary">
            Champions League / Europa League knockouts past expected end. The auto-resolver waits on SDB indefinitely so a 1-1 regulation → 2-1 ET tie doesn&apos;t mis-resolve to the ET winner — admin enters the regulation result manually.
          </Typography>
        </Box>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={() => refetch()}
          disabled={isFetching}
        >
          Refresh
        </Button>
      </Box>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={20} /></Box>
      ) : knockouts.length === 0 ? (
        <Alert severity="success" variant="outlined">No stuck knockouts — all caught up.</Alert>
      ) : (
        <Table size="small" sx={{ '& td, & th': { borderColor: t.border.subtle } }}>
          <TableHead>
            <TableRow>
              <TableCell>Match</TableCell>
              <TableCell>League</TableCell>
              <TableCell align="right">Bets</TableCell>
              <TableCell align="right">Minutes past end</TableCell>
              <TableCell>Grace</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {knockouts.map(p => (
              <TableRow key={p.id} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {p.homeTeamCrest && <Box component="img" src={p.homeTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{p.homeTeam}</Typography>
                    <Typography variant="body2" sx={{ fontSize: '0.7rem', color: t.text.tertiary, mx: 0.5 }}>vs</Typography>
                    {p.awayTeamCrest && <Box component="img" src={p.awayTeamCrest} alt="" sx={{ width: 14, height: 14, objectFit: 'contain' }} />}
                    <Typography variant="body2" sx={{ fontSize: '0.78rem' }}>{p.awayTeam}</Typography>
                  </Box>
                </TableCell>
                <TableCell><Chip size="small" label={p.league} /></TableCell>
                <TableCell align="right">
                  {p.betCount === 0
                    ? <Typography variant="body2" color="text.secondary">0</Typography>
                    : <Chip size="small" color="warning" label={`${p.betCount} bets`} />}
                </TableCell>
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{p.minutesPastExpectedEnd}m</TableCell>
                <TableCell>
                  {p.graceWindowExpired
                    ? <Chip size="small" color="error" label="expired" />
                    : <Chip size="small" label="in window" variant="outlined" />}
                </TableCell>
                <TableCell align="right">
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    startIcon={<GavelRoundedIcon sx={{ fontSize: 14 }} />}
                    onClick={() => setPending(p)}
                    sx={{ fontSize: '0.7rem', textTransform: 'none' }}
                  >
                    Resolve manually
                  </Button>
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
    </Card>
  );
}

// ─── Resolve dialog ───────────────────────────────────────────────────────────

function ResolveKnockoutDialog({ pool, onClose, onResolved }: {
  pool: StuckKnockout;
  onClose: () => void;
  onResolved: () => void;
}) {
  const [winner, setWinner] = useState<WinnerChoice>('DRAW');
  const [homeScore, setHomeScore] = useState<string>('');
  const [awayScore, setAwayScore] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Auto-fill the regulation score from the winner choice when it implies
  // an obvious result, so the admin doesn't have to type both fields.
  // Most CL/EL knockouts that get stuck on us are 1-1 / 0-0 reg games that
  // went to ET, so DRAW is the dominant case.
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
    onError: (err: Error) => setError(err.message),
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

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface } }}>
      <DialogTitle sx={{ fontSize: '1rem' }}>Resolve {pool.league} knockout</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Box sx={{ p: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
            {pool.homeTeam} vs {pool.awayTeam}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5, fontSize: '0.7rem', color: t.text.tertiary }}>
            <span>kickoff <strong>{new Date(pool.startTime).toLocaleString()}</strong></span>
            <span>{pool.minutesPastExpectedEnd}m past expected end</span>
            <span>{pool.betCount} bets</span>
          </Box>
        </Box>

        <Alert severity="info" sx={{ fontSize: '0.78rem' }}>
          Regulation-time rules: the bet resolves on the <strong>90&apos;</strong> result. If the match went to extra time / penalties, regulation was a draw → pick <strong>DRAW</strong> even if a team eventually won.
        </Alert>

        <Box>
          <Typography sx={{ fontSize: '0.78rem', mb: 0.5, fontWeight: 600 }}>Regulation result</Typography>
          <ToggleButtonGroup
            exclusive
            fullWidth
            value={winner}
            onChange={(_, v) => v && setWinner(v as WinnerChoice)}
            sx={{ '& .MuiToggleButton-root': { textTransform: 'none', fontSize: '0.8rem' } }}
          >
            <ToggleButton value="HOME">{pool.homeTeam} win</ToggleButton>
            <ToggleButton value="DRAW">Draw at 90&apos;</ToggleButton>
            <ToggleButton value="AWAY">{pool.awayTeam} win</ToggleButton>
          </ToggleButtonGroup>
          {draw && (
            <Typography sx={{ fontSize: '0.68rem', mt: 0.5, color: t.text.tertiary }}>
              Use this for ties that went to ET or penalties — the bet still resolves to DRAW.
            </Typography>
          )}
        </Box>

        <Box>
          <Typography sx={{ fontSize: '0.78rem', mb: 0.5, fontWeight: 600 }}>Regulation score (optional)</Typography>
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
            <Typography sx={{ color: t.text.tertiary }}>—</Typography>
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
            <Typography sx={{ fontSize: '0.68rem', mt: 0.5, color: t.error }}>
              Score is inconsistent with the {winner.toLowerCase()} pick.
            </Typography>
          )}
          {neitherFilled && (
            <Typography sx={{ fontSize: '0.68rem', mt: 0.5, color: t.text.tertiary }}>
              Leave blank to skip — the public match page won&apos;t show a score.
            </Typography>
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

        {error && <Alert severity="error" sx={{ fontSize: '0.75rem' }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={resolveMutation.isPending} sx={{ textTransform: 'none', color: t.text.tertiary }}>Cancel</Button>
        <Button
          onClick={() => resolveMutation.mutate()}
          disabled={resolveMutation.isPending || !scoresValid}
          variant="contained"
          color={winner === 'DRAW' ? 'primary' : 'warning'}
          sx={{ textTransform: 'none', bgcolor: winner === 'DRAW' ? t.draw : undefined, '&:hover': { bgcolor: winner === 'DRAW' ? withAlpha(t.draw, 0.85) : undefined } }}
        >
          {resolveMutation.isPending ? 'Resolving…' : `Resolve as ${winner === 'DRAW' ? 'DRAW' : winner === 'HOME' ? pool.homeTeam : pool.awayTeam}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
