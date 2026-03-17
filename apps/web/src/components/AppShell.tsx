'use client';

import { Box } from '@mui/material';
import { Header } from './Header';
import { LiveResultsSidebar } from './LiveResultsSidebar';
import { RewardPopup } from './RewardPopup';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: { xs: '72px', lg: 0 } }}>
      <Header />
      <RewardPopup />
      <Box sx={{ display: 'flex', bgcolor: '#0B0F14' }}>
        <LiveResultsSidebar />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
