'use client';

import { Box, Container, Typography } from '@mui/material';
import { AppShell, ConnectWalletButton } from '@/components';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useThemeTokens } from '@/app/providers';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { STORE_UI_ENABLED } from '@/lib/features';
import { UpIcon } from '@/components/UpIcon';
import { StreakSaverCard } from '@/components/profile/StreakSaverCard';
import { BoostStore } from '@/components/profile/BoostStore';
import { CosmeticsGrid } from '@/components/store/CosmeticsGrid';

/**
 * /store — the single place to SPEND UP Coins. Buying only; equipping/using what
 * you own happens in the profile Inventory (backpack). Organized into sections.
 */
export default function StorePage() {
  const t = useThemeTokens();
  const { connected, walletAddress } = useWalletBridge();
  const { data: profile } = useUserProfile();
  const coins = profile ? Number(profile.coinsBalance) / UP_COINS_DIVISOR : 0;

  // Dev-only feature: in production the Store is hidden (no nav links point here;
  // this guards a direct visit).
  if (!STORE_UI_ENABLED) {
    return (
      <AppShell centered>
        <Container maxWidth={false} sx={{ maxWidth: 1100, py: 10, px: { xs: 2, md: 3 }, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>The Store is not available yet.</Typography>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell centered>
      <Container maxWidth={false} sx={{ maxWidth: 1100, py: { xs: 3, md: 4 }, px: { xs: 2, md: 3 } }}>
        {!connected || !walletAddress ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography sx={{ color: 'text.secondary', mb: 3 }}>Connect your wallet to open the Store</Typography>
            <ConnectWalletButton variant="page" />
          </Box>
        ) : (
          <>
            {/* Header: title + balance */}
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3, flexWrap: 'wrap', gap: 1 }}>
              <Typography sx={{ fontSize: '1.4rem', fontWeight: 800, color: t.text.primary }}>Store</Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: 1.5, py: 0.8, borderRadius: 1, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}` }}>
                <UpIcon size={16} />
                <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
                  {coins.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Typography>
                <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, ml: 0.3 }}>UP Coins</Typography>
              </Box>
            </Box>

            {/* Boosts */}
            <BoostStore walletAddress={walletAddress} profile={profile} />

            {/* Streak savers */}
            <StreakSaverCard walletAddress={walletAddress} profile={profile} />

            {/* Cosmetics */}
            <Box sx={{ mb: 4, p: 2, borderRadius: 1.5, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}` }}>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary, mb: 1.5 }}>Cosmetics</Typography>
              <CosmeticsGrid mode="buy" walletAddress={walletAddress} profile={profile} />
            </Box>
          </>
        )}
      </Container>
    </AppShell>
  );
}
