'use client';

import { Box, Typography, IconButton, Chip } from '@mui/material';
import Avatar from '@mui/material/Avatar';
import { RemoveCircleOutline } from '@mui/icons-material';
import { getAvatarUrl } from '@/lib/constants';
import { formatDateTime } from '@/lib/format';
import type { SquadMemberEntry } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface SquadMemberListProps {
  members: SquadMemberEntry[];
  currentWallet: string | null;
  isOwner: boolean;
  onKick: (wallet: string) => void;
}

function shortWallet(addr: string) {
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

export function SquadMemberList({ members, currentWallet, isOwner, onKick }: SquadMemberListProps) {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {/* Header — desktop only */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '1fr 100px 140px 60px',
          px: 2,
          py: 1,
          bgcolor: t.bg.surfaceAlt,
          border: t.surfaceBorder,
          boxShadow: t.surfaceShadow,
        }}
      >
        {['Player', 'Role', 'Joined', ''].map((h) => (
          <Typography key={h} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h}
          </Typography>
        ))}
      </Box>

      {members.map((m) => {
        const isMe = m.walletAddress === currentWallet;
        return (
          <Box
            key={m.walletAddress}
            sx={{
              display: { xs: 'flex', md: 'grid' },
              gridTemplateColumns: { md: '1fr 100px 140px 60px' },
              alignItems: 'center',
              gap: { xs: 1.5, md: 0 },
              px: 2,
              py: 1.2,
              minHeight: 52,
              bgcolor: t.bg.surfaceAlt,
              border: t.surfaceBorder,
              boxShadow: t.surfaceShadow,
              transition: 'background 0.15s ease',
              '&:hover': { background: t.border.subtle },
            }}
          >
            {/* Player */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flex: 1, minWidth: 0 }}>
              <Avatar
                src={getAvatarUrl(m.walletAddress)}
                alt={m.walletAddress}
                sx={{ width: 32, height: 32, borderRadius: '50%', border: `1px solid ${t.border.default}`, flexShrink: 0 }}
              />
              <Box sx={{ minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: t.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {shortWallet(m.walletAddress)}
                  {isMe && (
                    <Typography component="span" sx={{ color: t.up, fontSize: '0.7rem', ml: 0.5 }}>
                      (you)
                    </Typography>
                  )}
                </Typography>
              </Box>
            </Box>

            {/* Role */}
            <Box>
              {m.role === 'OWNER' ? (
                <Chip
                  label="Owner"
                  size="small"
                  sx={{
                    backgroundColor: withAlpha(t.accent, 0.13),
                    color: t.accent,
                    fontWeight: 600,
                    fontSize: '0.6rem',
                    height: 20,
                    borderRadius: '2px',
                  }}
                />
              ) : (
                <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                  Member
                </Typography>
              )}
            </Box>

            {/* Joined — desktop */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
              <Typography sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                {formatDateTime(m.joinedAt)}
              </Typography>
            </Box>

            {/* Kick */}
            <Box sx={{ display: 'flex' }}>
              {isOwner && m.role !== 'OWNER' && !isMe && (
                <IconButton
                  size="small"
                  onClick={() => onKick(m.walletAddress)}
                  sx={{ color: t.down, '&:hover': { backgroundColor: withAlpha(t.down, 0.1) } }}
                >
                  <RemoveCircleOutline sx={{ fontSize: 18 }} />
                </IconButton>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
