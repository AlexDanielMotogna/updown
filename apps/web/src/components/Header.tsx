'use client';

import { Box, Typography, Button } from '@mui/material';
import { AttachMoney } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COLOR, GAIN_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';
import { NAV_ITEMS } from '@/lib/navigation';
import { UserLevelBadge } from './UserLevelBadge';
import { NotificationPanel } from './header/NotificationPanel';
import { MobileBottomNav } from './header/MobileBottomNav';

export function Header() {
  const pathname = usePathname();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: '#0B0F14',
      }}
    >
      {/* Main bar */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          height: { xs: 44, sm: 52, lg: 64 },
          px: { xs: 1, sm: 2, lg: 3, xl: 4 },
        }}
      >
        {/* Left: Logo */}
        <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <Box
            component="img"
            src="/updown-logos/Logo_48px.png"
            alt="UpDown"
            sx={{ display: { xs: 'block', sm: 'none' }, width: 28, height: 28 }}
          />
          <Box
            component="img"
            src="/updown-logos/Logo_text_white_796x277.png"
            alt="UpDown"
            sx={{ display: { xs: 'none', sm: 'block' }, height: { sm: 32, md: 36 } }}
          />
        </Link>

        {/* Desktop nav — centered (only on lg+) */}
        <Box
          sx={{
            display: { xs: 'none', lg: 'flex' },
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
                    borderBottom: active ? `2px solid ${UP_COLOR}` : '2px solid transparent',
                    borderRadius: 0,
                    '&:hover': {
                      color: '#FFFFFF',
                      backgroundColor: 'transparent',
                    },
                  }}
                  startIcon={<item.icon sx={{ fontSize: 18 }} />}
                >
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </Box>

        {/* Right: compact stats bar + notifications + wallet */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
          {connected ? (
            <>
              {/* Unified stats bar */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  bgcolor: 'rgba(255,255,255,0.04)',
                  borderRadius: '6px',
                  height: { xs: 34, sm: 38 },
                  overflow: 'hidden',
                }}
              >
                {/* Level icon */}
                {userProfile && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      px: { xs: 0.75, sm: 1 },
                      height: '100%',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" />
                  </Box>
                )}

                {/* UP Coins */}
                {userProfile && (
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: { xs: 0.75, sm: 1.25 },
                      height: '100%',
                      borderRight: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    <Box
                      component="img"
                      src="/token/Token_16px_Gold.png"
                      alt="UP Coin"
                      sx={{ width: 14, height: 14 }}
                    />
                    <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                      {(() => {
                        const num = Number(userProfile.coinsBalance) / UP_COINS_DIVISOR;
                        return num >= 1_000_000 ? `${(num / 1_000_000).toFixed(1)}M`
                          : num >= 1_000 ? `${(num / 1_000).toFixed(1)}K`
                          : num.toFixed(1);
                      })()}
                    </Typography>
                  </Box>
                )}

                {/* USDC Balance */}
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    px: { xs: 0.75, sm: 1.25 },
                    height: '100%',
                  }}
                >
                  <AttachMoney sx={{ fontSize: 14, color: GAIN_COLOR }} />
                  <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, fontWeight: 600, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>
                    {balance ? balance.uiAmount.toFixed(2) : '0.00'}
                  </Typography>
                </Box>
              </Box>

              <NotificationPanel />
              <ConnectWalletButton variant="header" />
            </>
          ) : (
            <ConnectWalletButton variant="header" />
          )}
        </Box>
      </Box>

      {/* Mobile bottom nav */}
      <MobileBottomNav />
    </Box>
  );
}
