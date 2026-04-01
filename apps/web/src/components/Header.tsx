'use client';

import { Box, Typography, Button, IconButton } from '@mui/material';
import { AttachMoney, LightMode, DarkMode } from '@mui/icons-material';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { NAV_ITEMS, DESKTOP_NAV_ITEMS } from '@/lib/navigation';
import { UserLevelBadge } from './UserLevelBadge';
import { NotificationPanel } from './header/NotificationPanel';
import { MobileBottomNav } from './header/MobileBottomNav';
import { useThemeTokens, useThemeMode } from '@/app/providers';

export function Header() {
  const t = useThemeTokens();
  const { mode, toggle } = useThemeMode();
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
        backgroundColor: t.bg.app,
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
            src="/updown-logos/Logo_48px_Cyan_Transparent.png"
            alt="UpDown"
            sx={{ display: { xs: 'block', sm: 'none' }, width: 28, height: 28 }}
          />
          <Box
            component="img"
            src={mode === 'dark' ? '/updown-logos/Logo_cyan_text_white.png' : '/updown-logos/Logo_cyan_text_dark_Medium.png'}
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
            gap: 0,
          }}
        >
          {DESKTOP_NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href} style={{ textDecoration: 'none' }}>
                <Button
                  sx={{
                    color: active ? t.text.primary : 'text.secondary',
                    px: { lg: 1, xl: 1.5 },
                    fontSize: { lg: '0.75rem', xl: '0.8125rem' },
                    borderBottom: active ? `2px solid ${t.up}` : '2px solid transparent',
                    borderRadius: 0,
                    whiteSpace: 'nowrap',
                    minWidth: 0,
                    '&:hover': {
                      color: t.text.primary,
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

        {/* Right: compact stats bar + notifications + wallet */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
          {connected ? (
            <>
              {/* Unified stats bar */}
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  bgcolor: t.hover.default,
                  borderRadius: '6px',
                  height: { xs: 34, sm: 38 },
                  overflow: 'hidden',
                }}
              >
                {/* Level icon — desktop only */}
                {userProfile && (
                  <Box
                    sx={{
                      display: { xs: 'none', sm: 'flex' },
                      alignItems: 'center',
                      px: { sm: 1 },
                      height: '100%',
                      borderRight: `1px solid ${t.border.default}`,
                    }}
                  >
                    <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" />
                  </Box>
                )}

                {/* UP Coins — desktop only */}
                {userProfile && (
                  <Box
                    sx={{
                      display: { xs: 'none', sm: 'flex' },
                      alignItems: 'center',
                      gap: 0.5,
                      px: { sm: 1.25 },
                      height: '100%',
                      borderRight: `1px solid ${t.border.default}`,
                    }}
                  >
                    <Box
                      component="img"
                      src="/token/Token_16px_Gold.png"
                      alt="UP Coin"
                      sx={{ width: 14, height: 14 }}
                    />
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
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
                  <AttachMoney sx={{ fontSize: 14, color: t.gain }} />
                  <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, fontWeight: 600, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                    {balance ? balance.uiAmount.toFixed(2) : '0.00'}
                  </Typography>
                </Box>
              </Box>

              <IconButton
                onClick={toggle}
                size="small"
                sx={{
                  color: t.text.secondary,
                  width: { xs: 32, sm: 36 },
                  height: { xs: 32, sm: 36 },
                  '&:hover': { color: t.text.primary, bgcolor: t.hover.default },
                }}
              >
                {mode === 'dark' ? <LightMode sx={{ fontSize: { xs: 16, sm: 18 } }} /> : <DarkMode sx={{ fontSize: { xs: 16, sm: 18 } }} />}
              </IconButton>
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
