'use client';

import { Container } from '@mui/material';
import { AppShell, LeaderboardTable } from '@/components';

export default function LeaderboardPage() {
  return (
    <AppShell>
      <Container maxWidth={false} sx={{ px: { xs: 2, md: 3 } }}>
        <LeaderboardTable />
      </Container>
    </AppShell>
  );
}
