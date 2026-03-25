'use client';

import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { UP_COLOR, DRAW_COLOR } from '@/lib/constants';
import type { TournamentSummary } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  tournament: TournamentSummary;
  entryFee: string;
  prizePool: string;
  sideLabels?: string[];
}

const LEAGUE_NAMES: Record<string, string> = {
  CL: 'Champions League', PL: 'Premier League', PD: 'La Liga',
  SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1',
};

export function TournamentRulesDialog({ open, onClose, tournament: t, entryFee, prizePool, sideLabels }: Props) {
  const isSports = t.tournamentType === 'SPORTS';
  const predMins = Math.floor(Number(t.predictionWindow) / 60);
  const accent = isSports ? DRAW_COLOR : UP_COLOR;
  const leagueName = isSports ? (LEAGUE_NAMES[t.league || ''] || t.league || 'Football') : null;

  const stats = isSports ? [
    { label: 'Players', value: `${t.size}` },
    { label: 'Rounds', value: `${t.totalRounds}` },
    { label: 'League', value: leagueName },
    { label: 'Prediction window', value: `${predMins}min` },
    { label: 'Entry fee', value: `$${entryFee}` },
    { label: 'Prize pool', value: `$${prizePool}` },
  ] : [
    { label: 'Players', value: `${t.size}` },
    { label: 'Rounds', value: `${t.totalRounds}` },
    { label: 'Prediction window', value: `${predMins}min` },
    { label: 'Match duration', value: `${Math.floor(Number(t.matchDuration) / 60)}min` },
    { label: 'Entry fee', value: `$${entryFee}` },
    { label: 'Prize pool', value: `$${prizePool}` },
  ];

  const steps = isSports ? [
    { step: '1', title: 'Register', desc: `Pay $${entryFee} entry fee. All fees go to the prize pool.` },
    { step: '2', title: 'Predict the Matchday', desc: `Each round, predict ${(sideLabels || ['Home', 'Draw', 'Away']).join('/')} for every real ${leagueName} fixture, plus a total goals tiebreaker. You have ${predMins} minutes.` },
    { step: '3', title: 'Wait for Results', desc: 'Matches are resolved automatically when the real football fixtures finish. The admin can also resolve manually.' },
    { step: '4', title: 'Most Correct Wins', desc: 'The player with the most correct predictions advances. Tied? Closest total goals prediction wins. Still tied? First to predict wins.' },
    { step: '5', title: 'Prize', desc: `Last player standing wins $${prizePool} (minus 5% platform fee).` },
  ] : [
    { step: '1', title: 'Register', desc: `Pay $${entryFee} entry fee. All fees go to the prize pool.` },
    { step: '2', title: 'Predict', desc: `Each round you have ${predMins} minutes to predict the closing price of ${t.asset}/USD.` },
    { step: '3', title: 'Wait', desc: `After predictions close, the match runs for ${Math.floor(Number(t.matchDuration) / 60)} minutes while the price moves.` },
    { step: '4', title: 'Closest Wins', desc: 'The player whose prediction is closest to the final price advances to the next round.' },
    { step: '5', title: 'Prize', desc: `Last player standing wins $${prizePool} (minus 5% platform fee).` },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { bgcolor: '#111820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 0, m: { xs: 1, md: 4 }, width: { xs: 'calc(100% - 16px)' }, maxWidth: { xs: 'none', md: 600 } } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: { xs: 1.5, md: 2.5 }, pt: { xs: 1.25, md: 2 }, pb: 0.75 }}>
        <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>How it works</Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.4)' }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>
      <Box sx={{ px: { xs: 1.5, md: 2.5 }, pb: { xs: 1.5, md: 2.5 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
          {stats.map(({ label, value }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: 1.5, py: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', mb: 0.25 }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        {steps.map(({ step, title, desc }) => (
          <Box key={step} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: accent, bgcolor: `${accent}15`, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</Typography>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 0.25 }}>{title}</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{desc}</Typography>
            </Box>
          </Box>
        ))}

        <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            {isSports
              ? 'If you don\u2019t predict before the deadline, your opponent advances automatically. All fixtures must finish before the round is resolved.'
              : 'If you don\u2019t predict before the deadline, your opponent advances automatically.'}
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}
