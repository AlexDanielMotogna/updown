'use client';

import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { darkTokens as t } from '@/lib/theme';
import { AdminLogin } from './components/AdminLogin';
import { ADMIN_AUTH_EXPIRED_EVENT, verifyKey } from './lib/adminApi';
import { ToastProvider } from './ui';
import { SystemHealth } from './components/SystemHealth';
import { PoolManagement } from './components/PoolManagement';
import { FinancialOverview } from './components/FinancialOverview';
import { UserOverview } from './components/UserOverview';
import { EventLog } from './components/EventLog';
import { ManualActions } from './components/ManualActions';
import { TournamentManagement } from './components/TournamentManagement';
import { CategoryManagement } from './components/CategoryManagement';
import { PayoutManagement } from './components/PayoutManagement';
import { MatchExplorer } from './components/MatchExplorer';

const TABS = ['Health', 'Pools', 'Payouts', 'Finance', 'Users', 'Events', 'Actions', 'Tournaments', 'Categories', 'Matches'] as const;

export default function AdminPage() {
  // `null` = haven't checked yet (initial mount), `true`/`false` = verified.
  // We re-verify the cached key against the backend on mount instead of
  // trusting that "key exists in sessionStorage" means "key is still valid"
  // — the previous behaviour left admins staring at error toasts in every
  // tab after a key rotation. See PLAN-ADMIN-REFACTOR.md Phase 1 #16.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const cached = sessionStorage.getItem('admin-key');
    if (!cached) {
      setAuthed(false);
      return;
    }
    let cancelled = false;
    verifyKey(cached).then(ok => {
      if (cancelled) return;
      if (!ok) {
        sessionStorage.removeItem('admin-key');
        setAuthed(false);
      } else {
        setAuthed(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Listen for the 401 auto-logout event fired by adminApi when any
  // mutation/query hits an expired key mid-session. Kicks the user back
  // to the login form once instead of letting every tab spin forever
  // throwing AdminAuthExpiredError. See Phase 1 #15.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => setAuthed(false);
    window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, handler);
  }, []);

  if (authed === null) {
    // Brief verification flash on mount. No spinner — the admin shell
    // shouldn't blink full-screen for a single 50ms re-verify call.
    return null;
  }

  if (!authed) {
    return <AdminLogin onLogin={() => setAuthed(true)} />;
  }

  const handleLogout = () => {
    sessionStorage.removeItem('admin-key');
    setAuthed(false);
  };

  return (
    // ToastProvider is part of Phase 2's primitives module — wraps the
    // whole admin shell so any tab can call useToast()/useMutationFeedback()
    // without remounting its own provider. Phase 3 tabs adopt it.
    <ToastProvider>
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
          {tab === 2 && <PayoutManagement />}
          {tab === 3 && <FinancialOverview />}
          {tab === 4 && <UserOverview />}
          {tab === 5 && <EventLog />}
          {tab === 6 && <ManualActions />}
          {tab === 7 && <TournamentManagement />}
          {tab === 8 && <CategoryManagement />}
          {tab === 9 && <MatchExplorer />}
        </Box>
      </Box>
    </ToastProvider>
  );
}
