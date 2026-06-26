'use client';

import { useState, useRef } from 'react';
import {
  Avatar,
  Button,
  Box,
  Typography,
  ClickAwayListener,
  Popper,
  Fade,
} from '@mui/material';
import { ContentCopy, Logout, CheckCircle } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { getDisplayName, getDisplayAvatar } from '@/lib/userDisplay';
import { NAV_ITEMS } from '@/lib/navigation';
import { UserLevelBadge } from './UserLevelBadge';
import { XpProgressBar } from './XpProgressBar';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface ConnectWalletButtonProps {
  variant?: 'header' | 'page';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

export function ConnectWalletButton({ variant = 'header' }: ConnectWalletButtonProps) {
  const t = useThemeTokens();
  const pathname = usePathname();
  const { connected, walletAddress, login, logout } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const isPage = variant === 'page';
  const height = isPage ? '48px' : '36px';

  const handleCopy = () => {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Identity for the connected state. Falls back to truncated wallet +
  // gradient avatar via the shared helper so a user who hasn't customised
  // their profile keeps the previous look. `identity` reads `null` when
  // the wallet hasn't loaded yet and the helper guards against that.
  const identity = walletAddress
    ? {
        walletAddress,
        displayName: userProfile?.displayName ?? null,
        avatarUrl: userProfile?.avatarUrl ?? null,
      }
    : null;

  if (!connected) {
    return (
      <Button
        onClick={login}
        sx={{
          height: isPage ? '48px' : { xs: 34, sm: 38 },
          px: isPage ? 3 : { xs: 1.5, sm: 2.5 },
          fontSize: { xs: '0.75rem', sm: '0.875rem' },
          fontWeight: 500,
          backgroundColor: withAlpha(t.up, 0.06),
          border: 'none',
          borderRadius: '4px',
          color: t.up,
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
          '&:hover': {
            backgroundColor: withAlpha(t.up, 0.1),
            borderColor: withAlpha(t.up, 0.31),
          },
        }}
      >
        Connect
      </Button>
    );
  }

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative' }}>
        <Button
          ref={anchorRef}
          onClick={() => setOpen((prev) => !prev)}
          startIcon={
            identity ? (
              <Avatar
                src={getDisplayAvatar(identity)}
                sx={{ width: 22, height: 22 }}
              />
            ) : undefined
          }
          sx={{
            height: isPage ? '48px' : { xs: 34, sm: 38 },
            px: isPage ? 3 : { xs: 1, sm: 2.5 },
            fontSize: { xs: '0.75rem', sm: '0.875rem' },
            fontWeight: 500,
            backgroundColor: open ? t.hover.strong : t.hover.medium,
            border: 'none',
            borderRadius: '4px',
            color: 'text.primary',
            transition: 'all 0.2s ease',
            minWidth: 0,
            '&:hover': {
              backgroundColor: t.hover.strong,
              borderColor: t.border.hover,
            },
            '& .MuiButton-startIcon': {
              mr: { xs: 0, sm: 0.75 },
            },
            '& .wallet-text': {
              display: { xs: 'none', sm: 'inline' },
            },
          }}
        >
          <Box component="span" className="wallet-text">
            {identity ? getDisplayName(identity) : 'Connected'}
          </Box>
        </Button>

        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-end"
          transition
          // Header is position:sticky, so the trigger stays fixed on scroll. Use the
          // fixed positioning strategy so the menu stays glued to it instead of
          // drifting away as the page scrolls.
          popperOptions={{ strategy: 'fixed' }}
          sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)', position: 'fixed' }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box
                sx={{
                  mt: 1,
                  minWidth: 220,
                  maxWidth: 280,
                  maxHeight: 'calc(100vh - 80px)',
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  bgcolor: t.bg.surfaceAlt,
                  border: t.surfaceBorder,
                  borderRadius: '6px',
                  boxShadow: t.surfaceShadow,
                }}
              >
                {/* Wallet address + copy */}
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: `1px solid ${t.border.default}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                  }}
                >
                  {identity && (
                    <Avatar
                      src={getDisplayAvatar(identity)}
                      sx={{ width: 28, height: 28 }}
                    />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography
                      sx={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: t.text.primary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {identity ? getDisplayName(identity) : ''}
                    </Typography>
                    {/* Show the wallet under the display name when the user
                        has customised their identity - the wallet is still
                        useful in this menu (copy button below it) but it
                        shouldn't be the primary identifier anymore. */}
                    {userProfile?.displayName && walletAddress && (
                      <Typography
                        sx={{
                          fontSize: '0.68rem',
                          color: t.text.tertiary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontVariantNumeric: 'tabular-nums',
                          mt: 0.25,
                        }}
                      >
                        {truncateAddress(walletAddress)}
                      </Typography>
                    )}
                  </Box>
                  <Button
                    size="small"
                    onClick={handleCopy}
                    sx={{
                      minWidth: 0,
                      p: 0.5,
                      color: copied ? t.gain : 'text.secondary',
                      '&:hover': { color: t.text.primary },
                    }}
                  >
                    {copied ? (
                      <CheckCircle sx={{ fontSize: 16 }} />
                    ) : (
                      <ContentCopy sx={{ fontSize: 16 }} />
                    )}
                  </Button>
                </Box>

                {/* Level & XP section */}
                {userProfile && (
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: `1px solid ${t.border.default}`,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <UserLevelBadge level={userProfile.level} title={userProfile.title} size="md" variant="icon-only" />
                      <Box>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.2 }}>
                          LVL {userProfile.level}: {userProfile.title}
                        </Typography>
                      </Box>
                    </Box>
                    {/* XP progress - single source of truth (same component
                        used by /profile and the user-profile-panel dropdown). */}
                    <XpProgressBar profile={userProfile} compact />
                  </Box>
                )}

                {/* UP Coins */}
                {userProfile && (
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: `1px solid ${t.border.default}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Box
                      component="img"
                      src="/token/Token_16px_Gold.png"
                      alt="UP Coin"
                      sx={{ width: 16, height: 16 }}
                    />
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.accent }}>
                      {(Number(userProfile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary }}>
                      UP Coins
                    </Typography>
                  </Box>
                )}

                {/* Navigation */}
                <Box sx={{ py: 0.5, borderBottom: `1px solid ${t.border.default}` }}>
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        style={{ textDecoration: 'none' }}
                        onClick={() => setOpen(false)}
                      >
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1.25,
                            px: 2,
                            py: 1,
                            cursor: 'pointer',
                            color: active ? t.text.primary : t.text.secondary,
                            bgcolor: active ? t.hover.default : 'transparent',
                            transition: 'all 0.12s ease',
                            '&:hover': { bgcolor: t.border.subtle, color: t.text.primary },
                          }}
                        >
                          <Icon sx={{ fontSize: 17, color: active ? t.up : 'inherit' }} />
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: active ? 700 : 500 }}>
                            {item.label}
                          </Typography>
                        </Box>
                      </Link>
                    );
                  })}
                </Box>

                {/* Disconnect */}
                <Button
                  fullWidth
                  onClick={() => {
                    setOpen(false);
                    logout();
                  }}
                  startIcon={<Logout sx={{ fontSize: 16 }} />}
                  sx={{
                    justifyContent: 'flex-start',
                    px: 2,
                    py: 1.5,
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    color: 'text.secondary',
                    textTransform: 'none',
                    borderRadius: 1,
                    '&:hover': {
                      bgcolor: t.border.subtle,
                      color: t.text.primary,
                    },
                  }}
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
