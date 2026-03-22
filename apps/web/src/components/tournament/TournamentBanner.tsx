'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { ArrowForward } from '@mui/icons-material';
import Link from 'next/link';
import { fetchActiveTournamentBanner, type TournamentSummary } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { UP_COLOR } from '@/lib/constants';

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
  const totalPot = (Number(tournament.entryFee) * tournament.size / 1_000_000).toFixed(2);
  const filled = tournament.participantCount ?? tournament._count?.participants ?? 0;
  const matchMins = Math.floor(Number(tournament.matchDuration) / 60);
  const isRegistering = tournament.status === 'REGISTERING';

  const title = isRegistering ? `$${totalPot} tournament now open` : `$${totalPot} tournament in progress`;
  const scheduledStr = tournament.scheduledAt ? formatDate(tournament.scheduledAt) : null;
  const subtitle = isRegistering
    ? `${tournament.size}-player ${tournament.asset} bracket with ${matchMins}min matches. ${filled} registered, ${tournament.size - filled} spots left.${scheduledStr ? ` Starts ${scheduledStr}.` : ''}`
    : `${tournament.size}-player ${tournament.asset} bracket with ${matchMins}min matches. Round ${tournament.currentRound} of ${tournament.totalRounds}.`;

  return (
    <Link href={`/tournament/${tournament.id}`} style={{ textDecoration: 'none' }}>
      <Box
        sx={{
          background: `linear-gradient(135deg, ${UP_COLOR}12, ${UP_COLOR}04)`,
          border: `1px solid ${UP_COLOR}20`,
          borderRadius: 2,
          mb: 2,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'border-color 0.15s ease',
          '&:hover': { borderColor: `${UP_COLOR}40` },
        }}
      >
        {/* Desktop */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            alignItems: 'center',
            gap: 1.5,
            px: 1.5,
            py: 0.75,
          }}
        >
          <Box
            component="img"
            src={`/tournaments/tournament-${tournament.asset.toLowerCase()}.png`}
            alt={tournament.asset}
            sx={{ width: 80, height: 80, objectFit: 'contain', flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: '#fff' }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500, mt: 0.25 }}>{subtitle}</Typography>
          </Box>
          <Button
            size="small"
            variant="contained"
            endIcon={<ArrowForward sx={{ fontSize: 14 }} />}
            sx={{
              bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.78rem',
              textTransform: 'none', borderRadius: 1.5, px: 2, py: 0.5,
              boxShadow: 'none', whiteSpace: 'nowrap',
              '&:hover': { bgcolor: `${UP_COLOR}CC`, boxShadow: 'none' },
            }}
          >
            {isRegistering ? 'Join Now' : 'View Bracket'}
          </Button>
        </Box>

        {/* Mobile */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' },
            alignItems: 'center',
            gap: 1,
            px: 1,
            py: 0.75,
          }}
        >
          <Box
            component="img"
            src={`/tournaments/tournament-${tournament.asset.toLowerCase()}.png`}
            alt={tournament.asset}
            sx={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0 }}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', color: '#fff', lineHeight: 1.3 }}>{title}</Typography>
            <Typography sx={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.55)', fontWeight: 500, mt: 0.5, lineHeight: 1.4 }}>{subtitle}</Typography>
          </Box>
        </Box>
      </Box>
    </Link>
  );
}
