'use client';

import { Box, Typography } from '@mui/material';
import Link from 'next/link';
import { useBadgeLookup } from '@/hooks/useCategories';
import { useThemeTokens } from '@/app/providers';
import type { TournamentSummary } from '@/lib/api';

export function TournamentSidebarList({ tournaments }: { tournaments: TournamentSummary[] }) {
  const t = useThemeTokens();
  const getBadge = useBadgeLookup();

  const STATUS_COLORS: Record<string, string> = {
    REGISTERING: t.up,
    ACTIVE: t.accent,
    COMPLETED: t.text.quaternary,
  };

  if (tournaments.length === 0) {
    return (
      <Box sx={{ p: 2, textAlign: 'center' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
          No tournaments yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {tournaments.map((tour) => {
        const filled = tour.participantCount ?? tour._count?.participants ?? 0;
        const pot = (Number(tour.entryFee) * tour.size / 1_000_000).toFixed(2);
        const statusColor = STATUS_COLORS[tour.status] || t.text.quaternary;
        return (
          <Link key={tour.id} href={`/tournament/${tour.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                bgcolor: t.bg.surfaceAlt,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                '&:hover': { background: t.hover.default },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Box
                  component="img"
                  src={tour.asset.includes(':') ? (getBadge(tour.asset.split(':')[1]) || '') : `/tournaments/tournament-${tour.asset.toLowerCase()}.png`}
                  alt={tour.asset}
                  sx={{ width: 22, height: 22, objectFit: 'contain', ...(tour.asset.includes(':') && { bgcolor: t.text.vivid, borderRadius: '50%', p: '2px' }) }}
                />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tour.name}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: statusColor }}>
                  {tour.status === 'REGISTERING' ? 'Open' : tour.status === 'ACTIVE' ? 'Live' : 'Ended'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.gain }}>
                  ${pot}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                {filled}/{tour.size} players · Round {tour.currentRound}/{tour.totalRounds}
              </Typography>
            </Box>
          </Link>
        );
      })}
    </Box>
  );
}
