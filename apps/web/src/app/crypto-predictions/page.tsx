'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Typography, Skeleton, Tooltip, IconButton } from '@mui/material';
import { AttachMoney, HelpOutline } from '@mui/icons-material';
import { usePrivy } from '@privy-io/react-auth';
import { useQuery } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { EventWalletButton } from '@/components/crypto/EventWalletButton';
import { WelcomeFundModal, type FundStatus } from '@/components/crypto/WelcomeFundModal';
import { CryptoTour, type TourStep } from '@/components/crypto/CryptoTour';
import { joinCryptoEvent, fetchCryptoMe } from '@/lib/api';
import { WeeklyLeaderboardCard } from '@/components/crypto/WeeklyLeaderboardCard';
import { MarketsCard } from '@/components/crypto/MarketsCard';
import { MarketTabs } from '@/components/crypto/MarketTabs';
import { MobileSectionNav } from '@/components/crypto/MobileSectionNav';
import { ActivePool } from '@/components/crypto/ActivePool';
import { EventInfoCard, AboutEventCard, LiveActivityCard } from '@/components/crypto/EventSidebar';
import { HideTermsContext } from '@/components/pool/ResolutionCards';

const CYAN = '#5FD8EF';
const fmtPnl = (raw: string) => {
  const n = Number(raw) / 1_000_000;
  return `${n >= 0 ? '+' : '−'}$${Math.abs(n).toFixed(2)}`;
};

const TOUR_STEPS: TourStep[] = [
  { selector: '[data-tour="balance"]', title: 'Your test balance', body: 'We credited your wallet with 1,000 test USDC to play. It is free play money, so experiment freely.' },
  { selector: '[data-tour="markets"]', title: 'Pick a market', body: 'Switch between BTC, ETH and SOL. Each runs its own 5-minute prediction rounds.' },
  { selector: '[data-tour="round"]', title: 'Every 5 minutes', body: 'A new round opens every 5 minutes. Predict where the price closes versus the strike when the timer hits zero.' },
  { selector: '[data-tour="predict"]', title: 'Predict UP or DOWN', body: 'Choose a side, pick an amount, and place it. Predicting earlier earns a bigger share of the pool (early bird bonus).' },
  { selector: '[data-tour="leaderboard"]', title: 'Climb the leaderboard', body: 'Your weekly PNL ranks you here. Top the board to win the weekly prize. It resets every Monday.' },
];

export default function CryptoPredictionsPage() {
  const t = useThemeTokens();
  const { authenticated, getAccessToken } = usePrivy();
  const { connected, walletAddress } = useWalletBridge();
  const { data: balance, refetch: refetchBalance } = useUsdcBalance();
  const [asset, setAsset] = useState('BTC');
  const [fund, setFund] = useState<{ open: boolean; status: FundStatus }>({ open: false, status: 'funding' });
  const [tutorialOpen, setTutorialOpen] = useState(false);

  // Tutorial shows once per browser (new account), then only via the header icon.
  const tutorialCheckedRef = useRef(false);
  const maybeOpenTutorial = useCallback(() => {
    try { if (localStorage.getItem('crypto-tutorial-seen') !== '1') setTutorialOpen(true); } catch { /* private mode */ }
  }, []);
  const closeTutorial = useCallback(() => {
    setTutorialOpen(false);
    try { localStorage.setItem('crypto-tutorial-seen', '1'); } catch { /* private mode */ }
  }, []);

  // One-time auto-fund on first authenticated load. `showModal` = tell the user
  // we're crediting (only for likely-new wallets, so returning users don't flash it).
  const runJoin = useCallback(async (showModal: boolean) => {
    if (!walletAddress) return;
    if (showModal) setFund({ open: true, status: 'funding' });
    try {
      const token = await getAccessToken();
      if (!token) { setFund((f) => (f.open ? { ...f, open: false } : f)); return; }
      const res = await joinCryptoEvent(token, walletAddress);
      if (res?.data?.funded) {
        setFund({ open: true, status: 'funded' });
        refetchBalance();
      } else {
        setFund((f) => (f.open ? { ...f, open: false } : f)); // already funded, nothing minted
      }
    } catch {
      setFund((f) => (f.open ? { open: true, status: 'error' } : f));
    }
  }, [walletAddress, getAccessToken, refetchBalance]);

  const joinedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!authenticated || !walletAddress || joinedRef.current === walletAddress) return;
    joinedRef.current = walletAddress;
    const likelyNew = !balance || balance.uiAmount === 0; // no funds yet → show the funding modal
    runJoin(likelyNew);
  }, [authenticated, walletAddress, balance, runJoin]);

  // Existing (already-funded) users: offer the tutorial once, once no funding modal is up.
  useEffect(() => {
    if (!authenticated || fund.open || tutorialCheckedRef.current) return;
    if (balance && balance.uiAmount > 0) {
      tutorialCheckedRef.current = true;
      maybeOpenTutorial();
    }
  }, [authenticated, fund.open, balance, maybeOpenTutorial]);

  const { data: me } = useQuery({
    queryKey: ['crypto-me', walletAddress],
    queryFn: async () => { const token = await getAccessToken(); if (!token || !walletAddress) return null; return fetchCryptoMe(token, walletAddress); },
    enabled: authenticated && !!walletAddress,
    refetchInterval: 10_000,
  });
  const weeklyPnl = me?.data?.weeklyPnl ?? null;

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: t.bg.app, color: t.text.primary, overflowX: 'hidden' }}>
      {/* Navbar — event-scoped: PNL · $ balance · tutorial · wallet (no route back into the app) */}
      <Box component="header" sx={{ position: 'sticky', top: 0, zIndex: 100, bgcolor: t.bg.app, borderBottom: `1px solid ${t.border.subtle}` }}>
        <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto', px: { xs: 1.5, md: 3 }, height: { xs: 54, md: 64 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
          <Box component="img" src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" sx={{ height: { xs: 22, md: 30 } }} />

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.75, md: 1.25 } }}>
            {connected && weeklyPnl != null && (
              <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.92rem' }, fontWeight: 800, color: Number(weeklyPnl) >= 0 ? t.gain : t.error, fontVariantNumeric: 'tabular-nums' }}>{fmtPnl(weeklyPnl)}</Typography>
            )}
            {connected && (
              <Box data-tour="balance" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, bgcolor: t.hover.default, borderRadius: '6px', height: { xs: 34, sm: 38 }, px: { xs: 1, sm: 1.25 } }}>
                <AttachMoney sx={{ fontSize: 14, color: t.gain }} />
                {balance ? <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.8rem' }, fontWeight: 600, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{balance.uiAmount.toFixed(2)}</Typography> : <Skeleton variant="text" width={36} height={16} sx={{ bgcolor: t.border.default }} />}
              </Box>
            )}
            <Tooltip arrow title="How it works">
              <IconButton onClick={() => setTutorialOpen(true)} size="small" sx={{ color: t.text.tertiary, '&:hover': { color: CYAN } }}>
                <HelpOutline sx={{ fontSize: 20 }} />
              </IconButton>
            </Tooltip>
            <EventWalletButton />
          </Box>
        </Box>
      </Box>

      {/* Mobile market switcher — sticky under the navbar so it's always 1 tap away */}
      <Box sx={{ display: { xs: 'block', lg: 'none' }, position: 'sticky', top: { xs: 54, md: 64 }, zIndex: 90, bgcolor: t.bg.app, px: 0.75, py: 1, borderBottom: `1px solid ${t.border.subtle}` }}>
        <MarketTabs active={asset} onSelect={setAsset} />
      </Box>

      {/* Body: 3 columns */}
      <Box sx={{ width: '100%', maxWidth: 1400, mx: 'auto', flex: 1, px: { xs: 0.75, md: 3 }, pt: { xs: 2, md: 3 }, pb: { xs: 9, md: 3 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '260px minmax(0, 1fr) 300px' }, gap: '5px', alignItems: 'start' }}>
          <Box sx={{ order: { xs: 2, lg: 0 }, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <Box id="sec-leaderboard" sx={{ scrollMarginTop: '112px' }}><WeeklyLeaderboardCard /></Box>
            {/* Full Markets list only on desktop; mobile uses the sticky MarketTabs above */}
            <Box sx={{ display: { xs: 'none', lg: 'block' } }}>
              <MarketsCard active={asset} onSelect={setAsset} />
            </Box>
          </Box>
          <Box id="sec-predict" sx={{ order: { xs: 0, lg: 0 }, minWidth: 0, scrollMarginTop: '112px' }}>
            <HideTermsContext.Provider value={true}>
              <ActivePool asset={asset} />
            </HideTermsContext.Provider>
          </Box>
          <Box sx={{ order: { xs: 1, lg: 0 }, display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <Box id="sec-info" sx={{ scrollMarginTop: '112px' }}><EventInfoCard /></Box>
            <AboutEventCard />
            <Box id="sec-activity" sx={{ scrollMarginTop: '112px' }}><LiveActivityCard /></Box>
          </Box>
        </Box>
      </Box>

      <MobileSectionNav />

      <WelcomeFundModal
        open={fund.open}
        status={fund.status}
        onClose={() => {
          const wasFunded = fund.status === 'funded';
          setFund((f) => ({ ...f, open: false }));
          if (wasFunded) maybeOpenTutorial(); // new account → walk them through it
        }}
        onRetry={() => runJoin(true)}
      />

      <CryptoTour run={tutorialOpen} steps={TOUR_STEPS} onClose={closeTutorial} />
    </Box>
  );
}
