'use client';

import { Box, Typography, Chip } from '@mui/material';
import { Groups, ChevronRight } from '@mui/icons-material';
import Avatar from '@mui/material/Avatar';
import { UP_COLOR, ACCENT_COLOR, GAIN_COLOR, getAvatarUrl } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { Squad } from '@/lib/api';

interface SquadCardProps {
  squad: Squad;
  onClick: () => void;
}

export function SquadCard({ squad, onClick }: SquadCardProps) {
  return (
    <Box
      onClick={onClick}
      sx={{
        bgcolor: '#0D1219',
        borderRadius: 0,
        px: { xs: 2, md: 2.5 },
        py: { xs: 2, md: 2.5 },
        cursor: 'pointer',
        transition: 'background 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
      }}
    >
      {/* Top: avatar + name + role */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Avatar
          src={getAvatarUrl(squad.id)}
          alt={squad.name}
          sx={{ width: 40, height: 40, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {squad.name}
            </Typography>
            {squad.role === 'OWNER' && (
              <Chip
                label="Owner"
                size="small"
                sx={{
                  backgroundColor: `${ACCENT_COLOR}20`,
                  color: ACCENT_COLOR,
                  fontWeight: 600,
                  fontSize: '0.6rem',
                  height: 18,
                  borderRadius: '2px',
                }}
              />
            )}
          </Box>
          <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', mt: 0.15 }}>
            Created {formatDateTime(squad.createdAt)}
          </Typography>
        </Box>
        <ChevronRight sx={{ fontSize: 20, color: 'rgba(255,255,255,0.15)' }} />
      </Box>

      {/* Stats row */}
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 1,
          pt: 1.5,
          borderTop: '1px solid rgba(255,255,255,0.04)',
        }}
      >
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Groups sx={{ fontSize: 14, color: UP_COLOR }} />
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: UP_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {squad.memberCount}
            </Typography>
          </Box>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Members
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
            {squad.activePoolCount}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Active
          </Typography>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {squad.poolCount}
          </Typography>
          <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Total Pools
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
