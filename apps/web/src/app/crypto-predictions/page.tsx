'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Button, Skeleton, Menu, MenuItem, ListItemIcon, Avatar, Tooltip } from '@mui/material';
import { KeyboardArrowDown, Logout, InfoOutlined } from '@mui/icons-material';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { joinCryptoEvent, fetchCryptoMe } from '@/lib/api';
import { CryptoLeaderboard } from '@/components/crypto/CryptoLeaderboard';
import { CryptoPoolColumn } from '@/components/crypto/CryptoPoolColumn';
import { InfoBanners } from '@/components/crypto/InfoBanners';

const ASSETS = ['BTC', 'ETH', 'SOL'];

function identityLabel(user: ReturnType<typeof usePrivy>['user']): string | null {
  if (!user) return null;
  const twitter = user.twitter?.username;
  if (twitter) return `@${twitter}`;
  return user.google?.email ?? user.email?.address ?? null;
}
const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
};

export default function CryptoPredictionsPage() {
  const t = useThemeTokens();
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { walletAddress } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  const who = identityLabel(user);
  const pfp = user?.twitter?.profilePictureUrl;
  const avatarSrc = pfp ? pfp.replace('_normal', '_400x400') : undefined;
  const initial = (who ?? 'U').replace('@', '').charAt(0).toUpperCase();

  // One-time auto-fund on first authenticated load (once per wallet in this session).
  const joinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authenticated || !walletAddress || joinedRef.current === walletAddress) return;
    joinedRef.current = walletAddress;
    (async () => {
      try {
        const token = await getAccessToken();
        if (token) await joinCryptoEvent(token, walletAddress);
      } catch { /* best-effort; retried next load */ }
    })();
  }, [authenticated, walletAddress, getAccessToken]);

  // Live PNL (weekly = the leaderboard metric).
  const { data: me } = useQuery({
    queryKey: ['crypto-me', walletAddress],
    queryFn: async () => {
      const token = await getAccessToken();
      if (!token || !walletAddress) return null;
      return fetchCryptoMe(token, walletAddress);
    },
    enabled: authenticated && !!walletAddress,
    refetchInterval: 10_000,
  });
  const weeklyPnl = me?.data?.weeklyPnl ?? null;

  const stat = (label: string, value: React.ReactNode, color?: string) => (
    <Box sx={{ textAlign: 'right', px: { xs: 0.75, md: 1.25 } }}>
      <Typography sx={{ fontSize: '0.58rem', fontWeight: 700, color: t.text.tertiary, letterSpacing: '0.05em', lineHeight: 1 }}>{label}</Typography>
      <Typography sx={{ fontSize: { xs: '0.78rem', md: '0.88rem' }, fontWeight: 800, color: color ?? t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.3 }}>{value}</Typography>
    </Box>
  );

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: t.bg.app, color: t.text.primary, overflowX: 'hidden' }}>
      {/* Navbar */}
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 100, bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', px: { xs: 1.5, md: 3 }, height: { xs: 54, md: 62 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
            <Box component="img" src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" sx={{ height: { xs: 22, md: 28 } }} />
            <Tooltip arrow title="UpDown is under development — play crypto predictions with test funds while we build towards launch."
              slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem', maxWidth: 240 } }, arrow: { sx: { color: t.bg.tooltip } } }}>
              <InfoOutlined sx={{ fontSize: 16, color: t.text.tertiary, cursor: 'help' }} />
            </Tooltip>
          </Box>

          {!ready ? (
            <Skeleton variant="rounded" sx={{ width: 200, height: 36, borderRadius: '4px', bgcolor: 'rgba(255,255,255,0.06)' }} />
          ) : authenticated ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, md: 1.5 } }}>
              {stat('PNL (7D)', weeklyPnl != null ? fmtPnl(weeklyPnl) : '—', weeklyPnl != null ? (Number(weeklyPnl) >= 0 ? t.gain : t.error) : undefined)}
              {stat('BALANCE', balance ? `$${balance.uiAmount.toFixed(2)}` : '—')}
              <Box onClick={(e) => setAnchor(e.currentTarget)} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, height: 36, px: 1, borderRadius: '4px', cursor: 'pointer', bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}>
                <Avatar src={avatarSrc} sx={{ width: 22, height: 22, fontSize: '0.72rem', fontWeight: 700, bgcolor: t.hover.strong, color: t.text.secondary }}>{initial}</Avatar>
                <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: '0.8rem', fontWeight: 600, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{who ?? 'Account'}</Typography>
                <KeyboardArrowDown sx={{ fontSize: 18, color: t.text.tertiary }} />
              </Box>
              <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{ paper: { sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}`, mt: 0.5, minWidth: 200 } } }}>
                {walletAddress && (
                  <Box sx={{ px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}` }}>
                    <Typography sx={{ fontSize: '0.62rem', color: t.text.tertiary }}>Wallet</Typography>
                    <Typography sx={{ fontFamily: 'monospace', fontSize: '0.72rem', color: t.text.secondary }}>{walletAddress.slice(0, 6)}…{walletAddress.slice(-6)}</Typography>
                  </Box>
                )}
                <MenuItem onClick={() => { setAnchor(null); logout(); }} sx={{ fontSize: '0.85rem', gap: 1 }}>
                  <ListItemIcon sx={{ minWidth: 'auto !important', color: t.text.secondary }}><Logout sx={{ fontSize: 17 }} /></ListItemIcon>
                  Sign out
                </MenuItem>
              </Menu>
            </Box>
          ) : (
            <Button onClick={login} sx={{ height: 36, px: { xs: 1.5, sm: 2.5 }, fontSize: { xs: '0.75rem', sm: '0.875rem' }, fontWeight: 500, backgroundColor: t.hover.medium, borderRadius: '4px', color: t.text.primary, textTransform: 'none', '&:hover': { backgroundColor: t.hover.strong } }}>
              Sign in
            </Button>
          )}
        </Box>
      </Box>

      {/* Body: 3 columns */}
      <Box sx={{ width: '100%', maxWidth: 1600, mx: 'auto', flex: 1, px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
          {/* Left — leaderboard */}
          <Box sx={{ order: { xs: 2, lg: 0 } }}><CryptoLeaderboard /></Box>
          {/* Center — 3 pool cards + charts */}
          <Box sx={{ order: { xs: 0, lg: 0 }, display: 'flex', flexDirection: 'column', gap: 2.5, minWidth: 0 }}>
            {!authenticated && ready && (
              <Box sx={{ borderRadius: 2, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, p: 2.5, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', mb: 0.5 }}>Predict BTC, ETH & SOL</Typography>
                <Typography sx={{ color: t.text.secondary, fontSize: '0.85rem', mb: 1.5 }}>Sign in to get 1,000 to trade and call the 5-minute moves.</Typography>
                <Button onClick={login} sx={{ px: 3, py: 1, fontWeight: 700, textTransform: 'none', bgcolor: t.hover.strong, borderRadius: 1.5, color: t.text.primary, '&:hover': { bgcolor: t.hover.emphasis } }}>Sign in to play</Button>
              </Box>
            )}
            {ASSETS.map((a) => <CryptoPoolColumn key={a} asset={a} />)}
          </Box>
          {/* Right — info banners */}
          <Box sx={{ order: { xs: 1, lg: 0 } }}><InfoBanners /></Box>
        </Box>
      </Box>
    </Box>
  );
}
