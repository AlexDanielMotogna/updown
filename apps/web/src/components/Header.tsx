'use client';

import {
  Box,
  Typography,
  Button,
  Chip,
} from '@mui/material';
import {
  AccountBalanceWallet,
  ShowChart,
  WorkOutline,
} from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';

const NAV_ITEMS = [
  { label: 'Markets', href: '/', icon: ShowChart },
  { label: 'Portfolio', href: '/bets', icon: WorkOutline },
];

export function Header() {
  const pathname = usePathname();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#0A0A0A',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* Main bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          height: { xs: 56, md: 64 },
          px: { xs: 2, sm: 3, md: 4 },
        }}
      >
        {/* Left: Logo */}
        <Link href="/" style={{ textDecoration: 'none' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 600,
              letterSpacing: '-0.02em',
              cursor: 'pointer',
              display: 'flex',
            }}
          >
            <Box component="span" sx={{ color: '#FFFFFF' }}>
              Up
            </Box>
            <Box component="span" sx={{ color: 'rgba(255, 255, 255, 0.5)' }}>
              Down
            </Box>
          </Typography>
        </Link>

        {/* Desktop nav — centered */}
        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            alignItems: 'center',
            gap: 1,
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <Button
                  sx={{
                    color: active ? '#FFFFFF' : 'text.secondary',
                    px: 2,
                    borderBottom: active ? '2px solid #FFFFFF' : '2px solid transparent',
                    borderRadius: 0,
                    '&:hover': {
                      color: '#FFFFFF',
                      backgroundColor: 'transparent',
                    },
                  }}
                >
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </Box>

        {/* Right: Balance + Wallet */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {connected && balance && (
            <Chip
              icon={<AccountBalanceWallet sx={{ fontSize: 16 }} />}
              label={`${balance.uiAmount.toFixed(2)} USDC`}
              size="small"
              sx={{
                display: { xs: 'none', sm: 'flex' },
                bgcolor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'text.primary',
                fontWeight: 400,
                fontSize: '0.8rem',
                '& .MuiChip-icon': { color: '#FFFFFF' },
              }}
            />
          )}
          <ConnectWalletButton variant="header" />
        </Box>
      </Box>

      {/* Mobile bottom nav — fixed bar */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          backgroundColor: '#0A0A0A',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          justifyContent: 'space-around',
          px: 1,
          pb: 'env(safe-area-inset-bottom)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
              <Button
                fullWidth
                sx={{
                  flexDirection: 'column',
                  gap: 0.25,
                  color: active ? '#FFFFFF' : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                  fontSize: '0.7rem',
                  py: 1,
                  minWidth: 0,
                  borderRadius: 0,
                  textTransform: 'none',
                  '&:hover': {
                    color: '#FFFFFF',
                    backgroundColor: 'transparent',
                  },
                }}
              >
                <Icon sx={{ fontSize: 22 }} />
                {item.label}
              </Button>
            </Link>
          );
        })}
      </Box>

    </Box>
  );
}
