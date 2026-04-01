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
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COINS_DIVISOR, getAvatarUrl } from '@/lib/constants';
import { UserLevelBadge } from './UserLevelBadge';
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
  const { connected, walletAddress, login, logout } = useWalletBridge();
  const { data: userProfile } = useUserProfile();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const isPage = variant === 'page';
  const height = isPage ? '48px' : '36px';

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
            walletAddress ? (
              <Avatar
                src={getAvatarUrl(walletAddress)}
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
            {walletAddress ? truncateAddress(walletAddress) : 'Connected'}
          </Box>
        </Button>

        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-end"
          transition
          sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)' }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box
                sx={{
                  mt: 1,
                  minWidth: 200,
                  maxWidth: 280,
                  bgcolor: t.bg.surfaceAlt,
                  border: t.surfaceBorder,
                  borderRadius: '6px',
                  overflow: 'hidden',
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
                  {walletAddress && (
                    <Avatar
                      src={getAvatarUrl(walletAddress)}
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
                      {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : ''}
                    </Typography>
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
                    {/* XP Progress bar */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Box
                        sx={{
                          flex: 1,
                          height: 6,
                          borderRadius: 3,
                          bgcolor: t.border.default,
                          overflow: 'hidden',
                        }}
                      >
                        <Box
                          sx={{
                            width: `${Math.max(0, Math.min(100, (userProfile.xpProgress || 0) * 100))}%`,
                            height: '100%',
                            borderRadius: 3,
                            bgcolor: t.accent,
                            transition: 'width 0.3s ease',
                          }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, flexShrink: 0 }}>
                        {userProfile.level >= 40 ? 'MAX' : `${userProfile.level + 1} LVL`}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary, mt: 0.5 }}>
                      XP {(Number(userProfile.totalXp) - Number(userProfile.xpForCurrentLevel)).toLocaleString()} / {(Number(userProfile.xpForNextLevel) - Number(userProfile.xpForCurrentLevel)).toLocaleString()}
                    </Typography>
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
