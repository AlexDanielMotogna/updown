'use client';

import { useMemo, useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography, Button } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import { darkTokens as t } from '@/lib/theme';
import { AdminLogin } from './components/AdminLogin';
import { ADMIN_AUTH_EXPIRED_EVENT, verifyKey } from './lib/adminApi';
import { ToastProvider } from './ui';
import { SystemHealth } from './components/SystemHealth';
import { PoolManagement } from './components/PoolManagement';
import { ZombiePools } from './components/ZombiePools';
import { FinancialOverview } from './components/FinancialOverview';
import { UserOverview } from './components/UserOverview';
import { EventLog } from './components/EventLog';
import { ManualActions } from './components/ManualActions';
import { TournamentManagement } from './components/TournamentManagement';
import { CategoryManagement } from './components/CategoryManagement';
import { PayoutManagement } from './components/PayoutManagement';
import { MatchExplorer } from './components/MatchExplorer';
import { PmExplorer } from './components/PmExplorer';
import { ResolutionMetrics } from './components/ResolutionMetrics';
import { GrowthOverview } from './components/GrowthOverview';
import { ResolutionInspector } from './components/ResolutionInspector';

const TABS = ['Health', 'Resolution', 'Pools', 'Zombies', 'Payouts', 'Finance', 'Users', 'Events', 'Actions', 'Tournaments', 'Matches', 'Predictions', 'Categories', 'Growth', 'Inspect'] as const;

// Detect which environment the admin is pointing at, so a single misclick
// between the dev / prod browser tabs is obvious. Reads NEXT_PUBLIC_ENV
// if explicitly set; otherwise infers from NEXT_PUBLIC_API_URL.
// Phase 6 polish — see PLAN-ADMIN-REFACTOR.md §Phase 6.
type EnvKind = 'LOCAL' | 'DEV' | 'PROD' | 'UNKNOWN';
function detectEnv(): EnvKind {
  const explicit = (process.env.NEXT_PUBLIC_ENV || '').toUpperCase();
  if (explicit === 'LOCAL' || explicit === 'DEV' || explicit === 'PROD') return explicit;
  const api = (process.env.NEXT_PUBLIC_API_URL || '').toLowerCase();
  if (!api) return 'UNKNOWN';
  if (api.includes('localhost') || api.includes('127.0.0.1')) return 'LOCAL';
  if (api.includes('dev') || api.includes('staging') || api.includes('railway.app')) return 'DEV';
  return 'PROD';
}

const ENV_COLORS: Record<EnvKind, string> = {
  LOCAL: '#60A5FA',
  DEV: '#F59E0B',
  PROD: '#EF4444',
  UNKNOWN: '#6B7280',
};

export default function AdminPage() {
  // `null` = haven't checked yet (initial mount), `true`/`false` = verified.
  // We re-verify the cached key against the backend on mount instead of
  // trusting that "key exists in sessionStorage" means "key is still valid"
  // — the previous behaviour left admins staring at error toasts in every
  // tab after a key rotation. See PLAN-ADMIN-REFACTOR.md Phase 1 #16.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState(0);
  const env = useMemo<EnvKind>(() => detectEnv(), []);

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

  // Cross-tab session sync. Phase 6 polish.
  //
  // sessionStorage is per-tab, so admin-key lives in each tab independently.
  // The `storage` event still fires for sessionStorage writes in other
  // browsing contexts that share the same origin/window — modern browsers
  // route it both ways. When another tab clears the key (logout) we drop
  // back to the login screen; when another tab adopts a fresh key we
  // re-verify silently and stay in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key !== 'admin-key' || e.storageArea !== sessionStorage) return;
      if (e.newValue === null) {
        // Other tab logged out — mirror it.
        setAuthed(false);
        return;
      }
      // Other tab logged in — re-verify the new value before adopting.
      const next = e.newValue;
      void verifyKey(next).then(ok => {
        if (!ok) return;
        try { sessionStorage.setItem('admin-key', next); } catch { /* read-only */ }
        setAuthed(true);
      });
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
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
      <Box sx={{ minHeight: '100vh', bgcolor: t.bg.app, p: { xs: 1.5, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <Typography variant="h5" fontWeight={600} sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
              UpDown Admin
            </Typography>
            {/* Environment badge — gives an at-a-glance signal so the
                operator never confuses the LOCAL tab with the PROD tab
                during a multi-deploy session. */}
            <Box
              sx={{
                fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.06em',
                px: 0.75, py: 0.25, borderRadius: 1,
                bgcolor: `${ENV_COLORS[env]}22`,
                color: ENV_COLORS[env],
                border: `1px solid ${ENV_COLORS[env]}55`,
              }}
            >
              {env}
            </Box>
          </Box>
          <Button size="small" startIcon={<LogoutIcon />} onClick={handleLogout} sx={{ color: 'text.secondary' }}>
            Logout
          </Button>
        </Box>

        <Tabs
          value={tab}
          onChange={(_, v) => setTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 3, borderBottom: `1px solid ${t.border.medium}` }}
        >
          {TABS.map(label => <Tab key={label} label={label} />)}
        </Tabs>

        <Box>
          {tab === 0 && <SystemHealth />}
          {tab === 1 && <ResolutionMetrics />}
          {tab === 2 && <PoolManagement />}
          {tab === 3 && <ZombiePools />}
          {tab === 4 && <PayoutManagement />}
          {tab === 5 && <FinancialOverview />}
          {tab === 6 && <UserOverview />}
          {tab === 7 && <EventLog />}
          {tab === 8 && <ManualActions />}
          {tab === 9 && <TournamentManagement />}
          {tab === 10 && <MatchExplorer />}
          {tab === 11 && <PmExplorer />}
          {tab === 12 && <CategoryManagement />}
          {tab === 13 && <GrowthOverview />}
          {tab === 14 && <ResolutionInspector />}
        </Box>
      </Box>
    </ToastProvider>
  );
}
