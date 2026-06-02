'use client';

import { Box, Typography, IconButton } from '@mui/material';
import { AttachMoney, LightMode, DarkMode } from '@mui/icons-material';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ConnectWalletButton } from './ConnectWalletButton';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { UserLevelBadge } from './UserLevelBadge';
import { MarketSearch } from './header/MarketSearch';
import { NotificationPanel } from './header/NotificationPanel';
import { MobileBottomNav } from './header/MobileBottomNav';
import { useThemeTokens, useThemeMode } from '@/app/providers';

// Top-bar nav links. Kept small (3 entries) so the row never wraps and
// the search field on the right still has room. The rest of the routes
// (Tournaments, Squads, Referrals, Faucet, Docs) live in the account
// dropdown + mobile bottom nav.
const HEADER_NAV = [
  { label: 'Markets', href: '/' },
  { label: 'Profile', href: '/profile' },
  { label: 'Leaderboard', href: '/leaderboard' },
] as const;

export function Header() {
  const t = useThemeTokens();
  const { mode, toggle } = useThemeMode();
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

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
      {/* Main bar - capped to the same 1400px frame as the body so the navbar
          edges line up with the sidebars. */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative',
          height: { xs: 44, sm: 52, lg: 64 },
          px: { xs: 1, sm: 2, lg: 3, xl: 4 },
          maxWidth: 1400,
          mx: 'auto',
        }}
      >
        {/* Left: Logo + nav links (Markets / Profile / Leaderboard). The
            nav row only shows on desktop — mobile keeps the MobileBottomNav
            below as the primary navigation surface. */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { md: 2.5, lg: 3.5 }, minWidth: 0 }}>
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
          <Box
            component="nav"
            sx={{
              display: { xs: 'none', md: 'flex' },
              alignItems: 'center',
              gap: { md: 0.5, lg: 1 },
            }}
          >
            {HEADER_NAV.map(item => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{ textDecoration: 'none' }}
                >
                  <Box
                    sx={{
                      px: { md: 1.25, lg: 1.5 },
                      py: 0.75,
                      borderRadius: '6px',
                      fontFamily: 'inherit',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: active ? t.text.primary : t.text.tertiary,
                      bgcolor: active ? t.hover.default : 'transparent',
                      transition: 'color 0.15s, background 0.15s',
                      cursor: 'pointer',
                      '&:hover': { color: t.text.primary, bgcolor: t.hover.light },
                    }}
                  >
                    {item.label}
                  </Box>
                </Link>
              );
            })}
          </Box>
        </Box>

        {/* Right: search + compact stats bar + notifications + wallet */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 } }}>
          {/* Search active markets — moved to the right cluster so the
              left side stays anchored to logo + nav. Hidden on the
              smallest viewport to leave room for the wallet button. */}
          <Box sx={{ display: { xs: 'none', sm: 'block' }, mr: { sm: 0.5, lg: 1 } }}>
            <MarketSearch />
          </Box>
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
                {/* Level icon - desktop only */}
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

                {/* UP Coins - desktop only */}
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
