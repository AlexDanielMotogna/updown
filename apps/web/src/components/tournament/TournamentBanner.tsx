'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { EmojiEvents, ArrowForward } from '@mui/icons-material';
import Link from 'next/link';
import { fetchActiveTournamentBanner, type TournamentSummary } from '@/lib/api';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';

export function TournamentBanner() {
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetchActiveTournamentBanner();
        if (!cancelled && res.success && res.data) {
          setTournament(res.data);
        }
      } catch {
        // silently ignore
      }
    }

    load();
    const interval = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!tournament) return null;

  const entryFeeUsdc = (Number(tournament.entryFee) / 1_000_000).toFixed(2);
  const prizePoolUsdc = (Number(tournament.prizePool) / 1_000_000).toFixed(2);
  const filled = tournament.participantCount ?? tournament._count?.participants ?? 0;

  return (
    <Box
      sx={{
        background: `linear-gradient(135deg, ${UP_COLOR}12, ${UP_COLOR}04)`,
        border: `1px solid ${UP_COLOR}20`,
        borderRadius: 2,
        px: { xs: 1.5, md: 2.5 },
        py: { xs: 1, md: 1.25 },
        mb: 2,
        display: 'flex',
        alignItems: 'center',
        gap: { xs: 1, md: 2 },
        minHeight: { xs: 52, md: 60 },
        overflow: 'hidden',
      }}
    >
      <EmojiEvents sx={{ color: ACCENT_COLOR, fontSize: { xs: 20, md: 24 }, flexShrink: 0 }} />

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2.5 }, flexWrap: 'wrap' }}>
        <Typography
          sx={{
            fontWeight: 800,
            fontSize: { xs: '0.78rem', md: '0.88rem' },
            whiteSpace: 'nowrap',
          }}
        >
          {tournament.name}
        </Typography>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flexWrap: 'wrap' }}>
          <Typography sx={{ fontSize: { xs: '0.68rem', md: '0.78rem' }, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {tournament.asset}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.68rem', md: '0.78rem' }, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            Entry: ${entryFeeUsdc}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.68rem', md: '0.78rem' }, color: 'text.secondary', whiteSpace: 'nowrap' }}>
            Slots: {filled}/{tournament.size}
          </Typography>
          <Typography sx={{ fontSize: { xs: '0.68rem', md: '0.78rem' }, color: ACCENT_COLOR, fontWeight: 700, whiteSpace: 'nowrap' }}>
            Prize: ${prizePoolUsdc}
          </Typography>
        </Box>
      </Box>

      <Link href={`/tournament/${tournament.id}`} style={{ textDecoration: 'none', flexShrink: 0 }}>
        <Button
          size="small"
          variant="contained"
          endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
          sx={{
            bgcolor: UP_COLOR,
            color: '#000',
            fontWeight: 700,
            fontSize: { xs: '0.7rem', md: '0.78rem' },
            textTransform: 'none',
            borderRadius: 1.5,
            px: { xs: 1.5, md: 2 },
            py: 0.5,
            boxShadow: 'none',
            whiteSpace: 'nowrap',
            '&:hover': {
              bgcolor: `${UP_COLOR}CC`,
              boxShadow: 'none',
            },
          }}
        >
          Register Now
        </Button>
      </Link>
    </Box>
  );
}
