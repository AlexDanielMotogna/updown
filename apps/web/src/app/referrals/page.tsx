'use client';

import { Box, Container, Typography } from '@mui/material';
import { AppShell, ConnectWalletButton } from '@/components';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { ReferralDashboard } from '@/components/ReferralDashboard';

export default function ReferralsPage() {
  const { connected, walletAddress } = useWalletBridge();

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ py: { xs: 3, md: 5 }, px: { xs: 2, md: 3 } }}>
        {!connected ? (
          <Box sx={{ textAlign: 'center', py: 12 }}>
            <Typography sx={{ color: 'text.secondary', fontWeight: 400, mb: 3, fontSize: '1rem' }}>
              Connect your wallet to view your referrals
            </Typography>
            <ConnectWalletButton variant="page" />
          </Box>
        ) : (
          <ReferralDashboard walletAddress={walletAddress!} />
        )}
      </Container>
    </AppShell>
  );
}
