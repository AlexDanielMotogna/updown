'use client';

import { useState } from 'react';
import { Box, Typography, Button, Skeleton, Menu, MenuItem, ListItemIcon, Tooltip, Avatar } from '@mui/material';
import { KeyboardArrowDown, Logout, InfoOutlined } from '@mui/icons-material';
import { usePrivy } from '@privy-io/react-auth';
import { useThemeTokens } from '@/app/providers';
import { WorldCupApp } from '@/components/worldcup/WorldCupApp';

function identityLabel(user: ReturnType<typeof usePrivy>['user']): string | null {
  if (!user) return null;
  const twitter = user.twitter?.username;
  if (twitter) return `@${twitter}`;
  return user.google?.email ?? user.email?.address ?? null;
}

export default function WorldCupPage() {
  const t = useThemeTokens();
  const { ready, authenticated, user, login, logout } = usePrivy();
  const who = identityLabel(user);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  // X provides a profile picture (small "_normal"; strip it for the original size). Google/email
  // don't expose one via Privy, so fall back to the initial of the handle/email.
  const pfp = user?.twitter?.profilePictureUrl;
  const avatarSrc = pfp ? pfp.replace('_normal', '_400x400') : undefined;
  const initial = (who ?? 'U').replace('@', '').charAt(0).toUpperCase();

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: t.bg.app, color: t.text.primary, overflowX: 'hidden' }}>
      {/* Header (app-style) */}
      <Box
        component="header"
        sx={{
          position: 'sticky', top: 0, zIndex: 100,
          bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}`,
        }}
      >
      <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 }, height: { xs: 52, md: 60 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
          <Box component="img" src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" sx={{ height: { xs: 24, md: 30 } }} />
          <Tooltip
            arrow
            title="UpDown is under development — this free World Cup game is a preview while we build towards mainnet."
            slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem', maxWidth: 240 } }, arrow: { sx: { color: t.bg.tooltip } } }}
          >
            <InfoOutlined sx={{ fontSize: 17, color: t.text.tertiary, cursor: 'help' }} />
          </Tooltip>
        </Box>

        {!ready ? (
          <Skeleton variant="rounded" sx={{ width: { xs: 100, sm: 132 }, height: { xs: 34, sm: 38 }, borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.06)' }} />
        ) : authenticated ? (
          <>
            <Box
              onClick={(e) => setAnchor(e.currentTarget)}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: { xs: 34, sm: 38 }, px: 1.25, borderRadius: '4px', cursor: 'pointer', bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}
            >
              <Avatar src={avatarSrc} sx={{ width: 22, height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: t.hover.strong, color: t.text.secondary }}>{initial}</Avatar>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 600, color: t.text.primary, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who ?? 'Account'}</Typography>
              <KeyboardArrowDown sx={{ fontSize: 18, color: t.text.tertiary }} />
            </Box>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}`, mt: 0.5 } } }}>
              <MenuItem onClick={() => { setAnchor(null); logout(); }} sx={{ fontSize: '0.85rem', gap: 1 }}>
                <ListItemIcon sx={{ minWidth: 'auto !important', color: t.text.secondary }}><Logout sx={{ fontSize: 17 }} /></ListItemIcon>
                Sign out
              </MenuItem>
            </Menu>
          </>
        ) : (
          <Button
            onClick={login}
            sx={{ height: { xs: 34, sm: 38 }, px: { xs: 1.5, sm: 2.5 }, fontSize: { xs: '0.75rem', sm: '0.875rem' }, fontWeight: 500, backgroundColor: t.hover.medium, borderRadius: '4px', color: t.text.primary, textTransform: 'none', '&:hover': { backgroundColor: t.hover.strong } }}
          >
            Sign in
          </Button>
        )}
      </Box>
      </Box>

      {/* Body */}
      <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto', flex: 1, px: { xs: 2, md: 3 }, py: { xs: 3, md: 4 } }}>
        <WorldCupApp />
      </Box>

      {/* Footer disclaimer */}
      <Box sx={{ borderTop: `1px solid ${t.border.subtle}`, mt: 2 }}>
        <Box sx={{ maxWidth: 1400, mx: 'auto', px: { xs: 2, md: 3 }, py: 2.5 }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, lineHeight: 1.7 }}>
            Free to play, no purchase necessary. The $100 prize applies only once at least 20 users have submitted a prediction. 2 winners are drawn at random among the users with the exact correct score and phase. By signing in you agree we store your X handle or email only to identify and contact prize winners; we do not sell your data.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
