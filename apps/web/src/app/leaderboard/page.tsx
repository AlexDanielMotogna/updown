'use client';

import { Container } from '@mui/material';
import { AppShell, LeaderboardBoards, ReferralLeaderboard } from '@/components';

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Container maxWidth={false} sx={{ maxWidth: 1200, px: { xs: 2, md: 3 } }}>
        <LeaderboardBoards />
        <ReferralLeaderboard />
      </Container>
    </AppShell>
  );
}
