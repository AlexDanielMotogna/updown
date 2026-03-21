'use client';

import { Container } from '@mui/material';
import { AppShell, LeaderboardTable } from '@/components';

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Container maxWidth="xl">
        <LeaderboardTable />
      </Container>
    </AppShell>
  );
}
