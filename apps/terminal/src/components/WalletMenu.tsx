'use client';

import { useEffect, useRef, useState } from 'react';
import { Avatar, Box, Button, ClickAwayListener, Fade, Popper, Typography } from '@mui/material';
import { ContentCopy, CheckCircle, Logout, ShowChart, AccountCircle, EmojiEvents, MenuBook, AccountBalanceWallet, PeopleOutline } from '@mui/icons-material';
import { usePrivy } from '@privy-io/react-auth';
import { useIdentity } from '@/hooks/useIdentity';
import { fetchProfile, IS_TESTNET, type UserProfile } from '@/lib/api';
import { useThemeTokens, getDisplayAvatar, getDisplayName, truncateWallet } from '@/lib/theme-tokens';
import { UserLevelBadge } from './UserLevelBadge';
import { XpProgressBar } from './XpProgressBar';

const rawAppUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
// Prepend https:// if the env var omits the protocol (else it's treated relative).
const APP_URL = /^https?:\/\//.test(rawAppUrl) ? rawAppUrl : `https://${rawAppUrl}`;
const UP_COINS_DIVISOR = 100;

// Same items + icons as the app nav (apps/web/src/lib/navigation.ts).
const NAV = [
  { label: 'Markets', href: `${APP_URL}/`, icon: ShowChart },
  { label: 'Profile', href: `${APP_URL}/profile`, icon: AccountCircle },
  { label: 'Referrals', href: `${APP_URL}/referrals`, icon: PeopleOutline },
  { label: 'Leaderboard', href: `${APP_URL}/leaderboard`, icon: EmojiEvents },
  { label: 'Faucet', href: `${APP_URL}/faucet`, icon: AccountBalanceWallet },
  { label: 'Docs', href: `${APP_URL}/docs`, icon: MenuBook },
];

/** Connected-wallet chip + dropdown — mirrors the app's ConnectWalletButton
 * (MUI, same tokens/sections), with an added HyperLiquid account section. */
export function WalletMenu() {
  const t = useThemeTokens();
  const { logout } = usePrivy();
  const { walletAddress, evmAddress } = useIdentity();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);

  const addr = evmAddress ?? '';
  const identity = addr ? { walletAddress: addr, displayName: profile?.displayName ?? null, avatarUrl: profile?.avatarUrl ?? null } : null;

  useEffect(() => {
    if (open && walletAddress) fetchProfile(walletAddress).then(setProfile);
  }, [open, walletAddress]);

  function handleCopy() {
    if (!addr) return;
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const border = `1px solid ${t.border.default}`;

  return (
    <ClickAwayListener onClickAway={() => setOpen(false)}>
      <Box sx={{ position: 'relative' }}>
        <Button
          ref={anchorRef}
          onClick={() => setOpen((p) => !p)}
          startIcon={identity ? <Avatar src={getDisplayAvatar(identity)} sx={{ width: 22, height: 22 }} /> : undefined}
          sx={{
            height: { xs: 34, sm: 38 }, px: { xs: 1, sm: 2 }, fontSize: { xs: '0.75rem', sm: '0.875rem' },
            fontWeight: 500, fontFamily: 'inherit', textTransform: 'none', backgroundColor: open ? t.hover.strong : t.hover.medium,
            border: 'none', borderRadius: '6px', color: t.text.primary, transition: 'all 0.2s ease', minWidth: 0,
            '&:hover': { backgroundColor: t.hover.strong },
            '& .MuiButton-startIcon': { mr: { xs: 0, sm: 0.75 } },
            '& .wallet-text': { display: { xs: 'none', sm: 'inline' } },
          }}
        >
          <Box component="span" className="wallet-text">{identity ? getDisplayName(identity) : 'Account'}</Box>
        </Button>

        <Popper open={open} anchorEl={anchorRef.current} placement="bottom-end" transition sx={{ zIndex: 1400, maxWidth: 'calc(100vw - 16px)' }}>
          {({ TransitionProps }) => (
            <Fade {...TransitionProps} timeout={150}>
              <Box sx={{
                mt: 1, minWidth: 240, maxWidth: 300, maxHeight: 'calc(100vh - 90px)', overflowY: 'auto', overflowX: 'hidden',
                bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, borderRadius: '8px', boxShadow: t.surfaceShadow, fontFamily: 'inherit',
              }}>
                {/* Identity + copy */}
                <Box sx={{ px: 2, py: 1.5, borderBottom: border, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  {identity && <Avatar src={getDisplayAvatar(identity)} sx={{ width: 28, height: 28 }} />}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {identity ? getDisplayName(identity) : ''}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                      {/* Only show the wallet here when the name line isn't already
                          the wallet (i.e. the user has a custom display name). */}
                      {profile?.displayName && addr && (
                        <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                          {truncateWallet(addr)}
                        </Typography>
                      )}
                      <Box sx={{ fontSize: '0.58rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: t.text.tertiary, bgcolor: t.hover.default, borderRadius: '4px', px: 0.6, py: 0.1 }}>
                        {IS_TESTNET ? 'Testnet' : 'Mainnet'}
                      </Box>
                    </Box>
                  </Box>
                  <Button size="small" onClick={handleCopy} sx={{ minWidth: 0, p: 0.5, color: copied ? t.gain : t.text.secondary, '&:hover': { color: t.text.primary } }}>
                    {copied ? <CheckCircle sx={{ fontSize: 16 }} /> : <ContentCopy sx={{ fontSize: 16 }} />}
                  </Button>
                </Box>

                {/* Level & XP */}
                {profile && (
                  <Box sx={{ px: 2, py: 1.5, borderBottom: border }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                      <UserLevelBadge level={profile.level} title={profile.title} size="md" variant="icon-only" />
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary, lineHeight: 1.2 }}>
                        LVL {profile.level}: {profile.title}
                      </Typography>
                    </Box>
                    <XpProgressBar profile={profile} compact />
                  </Box>
                )}

                {/* UP Coins */}
                {profile && (
                  <Box sx={{ px: 2, py: 1.5, borderBottom: border, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Box component="img" src="/token/Token_16px_Gold.png" alt="UP Coin" sx={{ width: 16, height: 16 }} />
                    <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.accent }}>
                      {(Number(profile.coinsBalance) / UP_COINS_DIVISOR).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </Typography>
                    <Typography sx={{ fontSize: '0.65rem', color: t.text.quaternary }}>UP Coins</Typography>
                  </Box>
                )}

                {/* Nav (cross to the app) */}
                <Box sx={{ py: 0.5, borderBottom: border }}>
                  {NAV.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Box key={item.label} component="a" href={item.href} sx={{
                        display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1, cursor: 'pointer', textDecoration: 'none',
                        color: t.text.secondary, transition: 'all 0.12s ease', '&:hover': { bgcolor: t.border.subtle, color: t.text.primary },
                      }}>
                        <Icon sx={{ fontSize: 17 }} />
                        <Typography sx={{ fontSize: '0.82rem', fontWeight: 500 }}>{item.label}</Typography>
                      </Box>
                    );
                  })}
                </Box>

                {/* Disconnect */}
                <Button fullWidth onClick={() => { setOpen(false); logout(); }} startIcon={<Logout sx={{ fontSize: 16 }} />} sx={{
                  justifyContent: 'flex-start', px: 2, py: 1.5, fontSize: '0.8rem', fontWeight: 500, fontFamily: 'inherit',
                  color: t.text.secondary, textTransform: 'none', borderRadius: 1, '&:hover': { bgcolor: t.border.subtle, color: t.text.primary },
                }}>
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
