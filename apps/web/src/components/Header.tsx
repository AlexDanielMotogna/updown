'use client';

import {
  Box,
  Typography,
  Button,
  Chip,
} from '@mui/material';
import {
  AccountBalanceWallet,
} from '@mui/icons-material';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';

interface HeaderProps {
  showBackButton?: boolean;
}

const NAV_ITEMS = [
  { label: 'Markets', href: '/' },
  { label: 'Portfolio', href: '/bets' },
];

export function Header({ showBackButton = false }: HeaderProps) {
  const router = useRouter();
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
        {/* Left: Back button or Logo + Nav (desktop) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          {showBackButton && (
            <Button
              onClick={() => router.back()}
              startIcon={<ArrowBackIcon />}
              aria-label="Go back"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  color: 'text.primary',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                },
              }}
            >
              Back
            </Button>
          )}

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

        </Box>

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

      {/* Mobile nav — centered tabs */}
      <Box
        sx={{
          display: { xs: 'flex', md: 'none' },
          justifyContent: 'center',
          gap: 1,
          px: 2,
          pb: 1,
          borderTop: '1px solid rgba(255, 255, 255, 0.04)',
        }}
      >
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Link key={item.href} href={item.href} style={{ textDecoration: 'none', flex: 1 }}>
              <Button
                fullWidth
                sx={{
                  color: active ? '#FFFFFF' : 'text.secondary',
                  fontWeight: active ? 500 : 400,
                  fontSize: '0.85rem',
                  py: 1,
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
    </Box>
  );
}
