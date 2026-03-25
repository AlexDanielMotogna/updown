'use client';

import { Box, Typography } from '@mui/material';
import Link from 'next/link';
import { GAIN_COLOR, UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import type { TournamentSummary } from '@/lib/api';

const STATUS_COLORS: Record<string, string> = {
  REGISTERING: UP_COLOR,
  ACTIVE: ACCENT_COLOR,
  COMPLETED: 'rgba(255,255,255,0.35)',
};

interface TournamentSidebarListProps {
  tournaments: TournamentSummary[];
}

export function TournamentSidebarList({ tournaments }: TournamentSidebarListProps) {
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
      {tournaments.map((t) => {
        const filled = t.participantCount ?? t._count?.participants ?? 0;
        const pot = (Number(t.entryFee) * t.size / 1_000_000).toFixed(2);
        const statusColor = STATUS_COLORS[t.status] || 'rgba(255,255,255,0.35)';
        return (
          <Link key={t.id} href={`/tournament/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                bgcolor: '#0D1219',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                <Box
                  component="img"
                  src={t.asset.includes(':') ? `https://crests.football-data.org/${t.asset.split(':')[1]}.png` : `/tournaments/tournament-${t.asset.toLowerCase()}.png`}
                  alt={t.asset}
                  sx={{ width: 22, height: 22, objectFit: 'contain', ...(t.asset.includes(':') && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }) }}
                />
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: statusColor }}>
                  {t.status === 'REGISTERING' ? 'Open' : t.status === 'ACTIVE' ? 'Live' : 'Ended'}
                </Typography>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: GAIN_COLOR }}>
                  ${pot}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                {filled}/{t.size} players · Round {t.currentRound}/{t.totalRounds}
              </Typography>
            </Box>
          </Link>
        );
      })}
    </Box>
  );
}
