'use client';

import { Avatar, Button } from '@mui/material';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { UP_COLOR } from '@/lib/constants';

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

  const isPage = variant === 'page';
  const height = isPage ? '48px' : '36px';

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
          border: `1px solid ${UP_COLOR}30`,
          borderRadius: '8px',
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
    <Button
      onClick={logout}
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
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
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
  );
}
