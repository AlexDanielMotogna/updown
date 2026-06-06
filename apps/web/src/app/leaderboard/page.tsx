'use client';

import { Container } from '@mui/material';
import { AppShell, LeaderboardBoards, ReferralLeaderboard, MilestoneProgress } from '@/components';

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Container maxWidth={false} sx={{ maxWidth: 1400, px: { xs: 2, md: 3 }, pt: { xs: 2, md: 3 } }}>
        <MilestoneProgress />
        <LeaderboardBoards />
        <ReferralLeaderboard />
      </Container>
    </AppShell>
  );
}
