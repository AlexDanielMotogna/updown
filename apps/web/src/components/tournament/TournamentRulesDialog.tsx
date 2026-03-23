'use client';

import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { UP_COLOR } from '@/lib/constants';
import type { TournamentSummary } from '@/lib/api';

interface Props {
  open: boolean;
  onClose: () => void;
  tournament: TournamentSummary;
  entryFee: string;
  prizePool: string;
}

export function TournamentRulesDialog({ open, onClose, tournament: t, entryFee, prizePool }: Props) {
  const predMins = Math.floor(Number(t.predictionWindow) / 60);
  const matchMins = Math.floor(Number(t.matchDuration) / 60);

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
          {[
            { label: 'Players', value: `${t.size}` },
            { label: 'Rounds', value: `${t.totalRounds}` },
            { label: 'Prediction window', value: `${predMins}min` },
            { label: 'Match duration', value: `${matchMins}min` },
            { label: 'Entry fee', value: `$${entryFee}` },
            { label: 'Prize pool', value: `$${prizePool}` },
          ].map(({ label, value }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: 1.5, py: 1 }}>
              <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', mb: 0.25 }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            </Box>
          ))}
        </Box>

        {[
          { step: '1', title: 'Register', desc: `Pay $${entryFee} entry fee. All fees go to the prize pool.` },
          { step: '2', title: 'Predict', desc: `Each round you have ${predMins} minutes to predict the closing price of ${t.asset}/USD.` },
          { step: '3', title: 'Wait', desc: `After predictions close, the match runs for ${matchMins} minutes while the price moves.` },
          { step: '4', title: 'Closest wins', desc: 'The player whose prediction is closest to the final price advances to the next round.' },
          { step: '5', title: 'Prize', desc: `Last player standing wins $${prizePool} (minus 5% platform fee).` },
        ].map(({ step, title, desc }) => (
          <Box key={step} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
            <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: UP_COLOR, bgcolor: `${UP_COLOR}15`, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</Typography>
            <Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 0.25 }}>{title}</Typography>
              <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{desc}</Typography>
            </Box>
          </Box>
        ))}

        <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            If you don&apos;t predict before the deadline, your opponent advances automatically.
          </Typography>
        </Box>
      </Box>
    </Dialog>
  );
}
