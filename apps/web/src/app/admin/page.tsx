'use client';

import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { darkTokens as t } from '@/lib/theme';
import { AdminLogin } from './components/AdminLogin';
import { SystemHealth } from './components/SystemHealth';
import { PoolManagement } from './components/PoolManagement';
import { FinancialOverview } from './components/FinancialOverview';
import { UserOverview } from './components/UserOverview';
import { EventLog } from './components/EventLog';
import { ManualActions } from './components/ManualActions';
import { TournamentManagement } from './components/TournamentManagement';
import { CategoryManagement } from './components/CategoryManagement';

const TABS = ['Health', 'Pools', 'Finance', 'Users', 'Events', 'Actions', 'Tournaments', 'Categories'] as const;

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('admin-key')) {
      setAuthed(true);
    }
  }, []);

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin-key');
    setAuthed(false);
  };

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: t.bg.app, p: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5" fontWeight={600}>UpDown Admin</Typography>
        <Button size="small" startIcon={<LogoutIcon />} onClick={handleLogout} sx={{ color: 'text.secondary' }}>
          Logout
        </Button>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3, borderBottom: `1px solid ${t.border.medium}` }}>
        {TABS.map(label => <Tab key={label} label={label} />)}
      </Tabs>

      <Box>
        {tab === 0 && <SystemHealth />}
        {tab === 1 && <PoolManagement />}
        {tab === 2 && <FinancialOverview />}
        {tab === 3 && <UserOverview />}
        {tab === 4 && <EventLog />}
        {tab === 5 && <ManualActions />}
        {tab === 6 && <TournamentManagement />}
        {tab === 7 && <CategoryManagement />}
      </Box>
    </Box>
  );
}
