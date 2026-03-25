'use client';

import { useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress } from '@mui/material';
import { UP_COLOR } from '@/lib/constants';
import { type TournamentFixture } from '@/lib/api';
import { MatchdayFixtureRow } from './MatchdayFixtureRow';

interface Props {
  fixtures: TournamentFixture[];
  tournamentId: string;
  matchId: string;
  walletAddress: string;
  onSubmitted: () => void;
  sideLabels?: string[];
}

export function MatchdayPredictionForm({ fixtures, tournamentId, matchId, walletAddress, onSubmitted, sideLabels }: Props) {
  const [outcomes, setOutcomes] = useState<Record<number, string>>({});
  const [totalGoals, setTotalGoals] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allPicked = fixtures.length > 0 && fixtures.every((_, i) => outcomes[i]);
  const totalGoalsNum = parseInt(totalGoals, 10);
  const canSubmit = allPicked && !isNaN(totalGoalsNum) && totalGoalsNum >= 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const orderedOutcomes = fixtures.map((_, i) => outcomes[i]);
      const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
      const res = await fetch(`${API}/api/tournaments/${tournamentId}/matches/${matchId}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, outcomes: orderedOutcomes, totalGoals: totalGoalsNum }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed');
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
        Predict each match
      </Typography>

      {fixtures.map((f, i) => (
        <MatchdayFixtureRow
          key={f.id}
          homeTeam={f.homeTeam}
          awayTeam={f.awayTeam}
          homeTeamCrest={f.homeTeamCrest}
          awayTeamCrest={f.awayTeamCrest}
          selected={outcomes[i] || null}
          onSelect={(v) => setOutcomes(prev => ({ ...prev, [i]: v }))}
          sideLabels={sideLabels}
        />
      ))}

      {/* Total goals tiebreaker */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1, pt: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', flex: 1 }}>
          Total goals (tiebreaker)
        </Typography>
        <TextField
          size="small"
          type="number"
          value={totalGoals}
          onChange={(e) => setTotalGoals(e.target.value)}
          placeholder="0"
          inputProps={{ min: 0, step: 1 }}
          sx={{
            width: 80,
            '& .MuiInputBase-root': { bgcolor: 'rgba(255,255,255,0.04)', borderRadius: '6px', height: 32 },
            '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
            '& .MuiInputBase-input': { color: '#fff', fontSize: '0.85rem', textAlign: 'center', py: 0.5 },
          }}
        />
      </Box>

      {error && (
        <Typography sx={{ fontSize: '0.7rem', color: '#F87171', mt: 0.5 }}>{error}</Typography>
      )}

      <Button
        fullWidth
        variant="contained"
        disabled={!canSubmit || submitting}
        onClick={handleSubmit}
        sx={{
          mt: 1, bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.8rem',
          py: 0.75, borderRadius: '6px', textTransform: 'none',
          '&:hover': { filter: 'brightness(1.1)' },
          '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
        }}
      >
        {submitting ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Lock Predictions'}
      </Button>
    </Box>
  );
}
