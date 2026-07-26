'use client';

import { useState, useRef } from 'react';
import { Avatar, Button, Box, Typography, ClickAwayListener, Popper, Fade } from '@mui/material';
import { ContentCopy, Logout, CheckCircle } from '@mui/icons-material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { getDisplayName, getDisplayAvatar } from '@/lib/userDisplay';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

const truncate = (a: string) => `${a.slice(0, 4)}...${a.slice(-4)}`;

/**
 * Wallet control scoped to the Crypto Predictions event. Deliberately a
 * stripped-down copy of ConnectWalletButton: it exposes ONLY identity + copy +
 * disconnect, with no NAV_ITEMS, UP coins, level, or XP. The event is a sealed
 * page, so the header must not offer any route back into the rest of the app.
 */
export function EventWalletButton() {
  const t = useThemeTokens();
  const { connected, walletAddress, login, logout } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const identity = walletAddress
    ? { walletAddress, displayName: userProfile?.displayName ?? null, avatarUrl: userProfile?.avatarUrl ?? null }
    : null;

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!connected) {
    return (
      <Button
        onClick={login}
        sx={{
          height: { xs: 34, sm: 38 }, px: { xs: 1.5, sm: 2.5 }, fontSize: { xs: '0.75rem', sm: '0.875rem' },
          fontWeight: 500, backgroundColor: withAlpha(t.up, 0.06), border: 'none', borderRadius: '4px',
          color: t.up, transition: 'all 0.2s ease', whiteSpace: 'nowrap',
          '&:hover': { backgroundColor: withAlpha(t.up, 0.1) },
        }}
      >
        Sign in
      </Button>
    );
  }

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative' }}>
        <Button
          ref={anchorRef}
          onClick={() => setOpen((prev) => !prev)}
          startIcon={identity ? <Avatar src={getDisplayAvatar(identity)} sx={{ width: 22, height: 22 }} /> : undefined}
          sx={{
            height: { xs: 34, sm: 38 }, px: { xs: 1, sm: 2.5 }, fontSize: { xs: '0.75rem', sm: '0.875rem' },
            fontWeight: 500, backgroundColor: open ? t.hover.strong : t.hover.medium, border: 'none',
            borderRadius: '4px', color: 'text.primary', transition: 'all 0.2s ease', minWidth: 0,
            '&:hover': { backgroundColor: t.hover.strong },
            '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.75 } },
            '& .wallet-text': { display: { xs: 'none', sm: 'inline' } },
          }}
        >
          <Box component="span" className="wallet-text">{identity ? getDisplayName(identity) : 'Connected'}</Box>
        </Button>

        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-end"
          transition
          popperOptions={{ strategy: 'fixed' }}
          sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)', position: 'fixed' }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box sx={{ mt: 1, minWidth: 220, maxWidth: 280, bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, borderRadius: '6px', boxShadow: t.surfaceShadow, overflow: 'hidden' }}>
                {/* Identity + copy */}
                <Box sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${t.border.default}`, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {identity && <Avatar src={getDisplayAvatar(identity)} sx={{ width: 28, height: 28 }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {identity ? getDisplayName(identity) : ''}
                    </Typography>
                    {userProfile?.displayName && walletAddress && (
                      <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', mt: 0.25 }}>
                        {truncate(walletAddress)}
                      </Typography>
                    )}
                  </Box>
                  <Button size="small" onClick={handleCopy} sx={{ minWidth: 0, p: 0.5, color: copied ? t.gain : 'text.secondary', '&:hover': { color: t.text.primary } }}>
                    {copied ? <CheckCircle sx={{ fontSize: 16 }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
                  </Button>
                </Box>

                {/* Disconnect */}
                <Button
                  fullWidth
                  onClick={() => { setOpen(false); logout(); }}
                  startIcon={<Logout sx={{ fontSize: 16 }} />}
                  sx={{ justifyContent: 'flex-start', px: 2, py: 1.5, fontSize: '0.8rem', fontWeight: 500, color: 'text.secondary', textTransform: 'none', borderRadius: 1, '&:hover': { bgcolor: t.border.subtle, color: t.text.primary } }}
                >
                  Disconnect
                </Button>
              </Box>
            </Fade>
          )}
        </Popper>
      </Box>
    </ClickAwayListener>
  );
}
