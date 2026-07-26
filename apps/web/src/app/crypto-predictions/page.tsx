'use client';

import { useEffect, useRef, useState } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { AttachMoney } from '@mui/icons-material';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { ConnectWalletButton } from '@/components/ConnectWalletButton';
import { NotificationPanel } from '@/components/header/NotificationPanel';
import { UserLevelBadge } from '@/components/UserLevelBadge';
import { joinCryptoEvent, fetchCryptoMe } from '@/lib/api';
import { WeeklyLeaderboardCard } from '@/components/crypto/WeeklyLeaderboardCard';
import { MarketsCard } from '@/components/crypto/MarketsCard';
import { ActivePool } from '@/components/crypto/ActivePool';
import { EventInfoCard, AboutEventCard, LiveActivityCard } from '@/components/crypto/EventSidebar';
import { HideTermsContext } from '@/components/pool/ResolutionCards';

const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
};
const fmtCoins = (raw: bigint | string | number) => {
  const num = Number(raw) / UP_COINS_DIVISOR;
  return num >= 1_000_000 ? `${(num / 1_000_000).toFixed(1)}M` : num >= 1_000 ? `${(num / 1_000).toFixed(1)}K` : num.toFixed(1);
};

export default function CryptoPredictionsPage() {
  const t = useThemeTokens();
  const { authenticated, getAccessToken } = usePrivy();
  const { connected, walletAddress } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();
  const [asset, setAsset] = useState('BTC');

  // One-time auto-fund on first authenticated load.
  const joinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authenticated || !walletAddress || joinedRef.current === walletAddress) return;
    joinedRef.current = walletAddress;
    (async () => {
      try { const token = await getAccessToken(); if (token) await joinCryptoEvent(token, walletAddress); } catch { /* retried next load */ }
    })();
  }, [authenticated, walletAddress, getAccessToken]);

  const { data: me } = useQuery({
    queryKey: ['crypto-me', walletAddress],
    queryFn: async () => { const token = await getAccessToken(); if (!token || !walletAddress) return null; return fetchCryptoMe(token, walletAddress); },
    enabled: authenticated && !!walletAddress,
    refetchInterval: 10_000,
  });
  const weeklyPnl = me?.data?.weeklyPnl ?? null;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: t.bg.app, color: t.text.primary, overflowX: 'hidden' }}>
      {/* Navbar — mirrors the app header cluster (level · coins · $ balance · bell · wallet) */}
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 100, bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ width: '100%', maxWidth: 1680, mx: 'auto', px: { xs: 1.5, md: 3 }, height: { xs: 54, md: 64 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box component="img" src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" sx={{ height: { xs: 22, md: 30 } }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.25 } }}>
            {connected && weeklyPnl != null && (
              <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.92rem' }, fontWeight: 800, color: Number(weeklyPnl) >= 0 ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(weeklyPnl)}</Typography>
            )}
            {connected && (
              <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: t.hover.default, borderRadius: '6px', height: { xs: 34, sm: 38 }, overflow: 'hidden' }}>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', px: { sm: 1 }, height: '100%', borderRight: `1px solid ${t.border.default}` }}>
                  {userProfile ? <UserLevelBadge level={userProfile.level} title={userProfile.title} size="sm" variant="icon-only" /> : <Skeleton variant="circular" width={22} height={22} sx={{ bgcolor: t.border.default }} />}
                </Box>
                <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 0.5, px: { sm: 1.25 }, height: '100%', borderRight: `1px solid ${t.border.default}` }}>
                  <Box component="img" src="/token/Token_16px_Gold.png" alt="UP Coin" sx={{ width: 14, height: 14 }} />
                  {userProfile ? <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtCoins(userProfile.coinsBalance)}</Typography> : <Skeleton variant="text" width={30} height={16} sx={{ bgcolor: t.border.default }} />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, px: { xs: 0.75, sm: 1.25 }, height: '100%' }}>
                  <AttachMoney sx={{ fontSize: 14, color: t.gain }} />
                  {balance ? <Typography sx={{ fontSize: { xs: '0.7rem', sm: '0.8rem' }, fontWeight: 600, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{balance.uiAmount.toFixed(2)}</Typography> : <Skeleton variant="text" width={36} height={16} sx={{ bgcolor: t.border.default }} />}
                </Box>
              </Box>
            )}
            {connected && <NotificationPanel />}
            <ConnectWalletButton variant="header" />
          </Box>
        </Box>
      </Box>

      {/* Body: 3 columns */}
      <Box sx={{ width: '100%', maxWidth: 1680, mx: 'auto', flex: 1, px: { xs: 1.5, md: 3 }, py: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr) 300px' }, gap: { xs: 2, lg: 2.5 }, alignItems: 'start' }}>
          <Box sx={{ order: { xs: 2, lg: 0 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <WeeklyLeaderboardCard />
            <MarketsCard active={asset} onSelect={setAsset} />
          </Box>
          <Box sx={{ order: { xs: 0, lg: 0 }, minWidth: 0 }}>
            <HideTermsContext.Provider value={true}>
              <ActivePool asset={asset} />
            </HideTermsContext.Provider>
          </Box>
          <Box sx={{ order: { xs: 1, lg: 0 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <EventInfoCard />
            <AboutEventCard />
            <LiveActivityCard />
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
