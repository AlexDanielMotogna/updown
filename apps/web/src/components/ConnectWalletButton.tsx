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
import { UP_COLOR, GAIN_COLOR } from '@/lib/constants';

interface ConnectWalletButtonProps {
  variant?: 'header' | 'page';
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

function getAvatarUrl(address: string): string {
  return `https://api.dicebear.com/9.x/shapes/svg?seed=${address}`;
}

export function ConnectWalletButton({ variant = 'header' }: ConnectWalletButtonProps) {
  const { connected, walletAddress, login, logout } = useWalletBridge();
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
          height,
          px: isPage ? 3 : 2.5,
          fontSize: '0.875rem',
          fontWeight: 500,
          backgroundColor: `${UP_COLOR}10`,
          border: 'none',
          borderRadius: '4px',
          color: UP_COLOR,
          transition: 'all 0.2s ease',
          '&:hover': {
            backgroundColor: `${UP_COLOR}1A`,
            borderColor: `${UP_COLOR}50`,
          },
        }}
      >
        Connect Wallet
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
            height,
            px: isPage ? 3 : 2.5,
            fontSize: '0.875rem',
            fontWeight: 500,
            backgroundColor: open ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.05)',
            border: 'none',
            borderRadius: '4px',
            color: 'text.primary',
            transition: 'all 0.2s ease',
            '&:hover': {
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '& .MuiButton-startIcon': {
              mr: 0.75,
            },
          }}
        >
          {walletAddress ? truncateAddress(walletAddress) : 'Connected'}
        </Button>

        <Popper
          open={open}
          anchorEl={anchorRef.current}
          placement="bottom-end"
          transition
          sx={{ zIndex: 1400 }}
        >
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box
                sx={{
                  mt: 1,
                  minWidth: 200,
                  bgcolor: '#0D1219',
                  border: '1px solid rgba(255,255,255,0.06)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                }}
              >
                {/* Wallet address + copy */}
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
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
                        fontFamily: 'monospace',
                        color: '#fff',
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
                      color: copied ? GAIN_COLOR : 'text.secondary',
                      '&:hover': { color: '#fff' },
                    }}
                  >
                    {copied ? (
                      <CheckCircle sx={{ fontSize: 16 }} />
                    ) : (
                      <ContentCopy sx={{ fontSize: 16 }} />
                    )}
                  </Button>
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
                    borderRadius: 0,
                    '&:hover': {
                      bgcolor: 'rgba(255,255,255,0.04)',
                      color: '#fff',
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
