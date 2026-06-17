'use client';

import { useMemo, useState, useEffect, type ComponentType } from 'react';
import dynamic from 'next/dynamic';
import { Box, Typography, Button, Drawer, IconButton } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import { darkTokens as t } from '@/lib/theme';
import { AdminSidebar } from './components/AdminSidebar';
import { AdminLogin } from './components/AdminLogin';
import { ADMIN_AUTH_EXPIRED_EVENT, verifyKey } from './lib/adminApi';
import { ToastProvider, LoadingState } from './ui';
import { SystemHealth } from './components/SystemHealth';
import { NeedsAttention } from './components/NeedsAttention';
import { FinanceSection } from './components/FinanceSection';
import { UserOverview } from './components/UserOverview';
import { EventLog } from './components/EventLog';
import { ManualActions } from './components/ManualActions';
import { ResolutionMetrics } from './components/ResolutionMetrics';

// Code-split the heaviest tab components (each pulls big MUI tables / forms):
// they only render when their tab is opened, so deferring them out of the
// initial admin bundle is a pure win. Admin is client-only behind auth, so
// ssr:false is safe. Loading flashes a small spinner via the shared LoadingState.
// next/dynamic requires its options to be an inline object literal (the SWC
// plugin parses them statically), so the { ssr, loading } block is repeated per
// call rather than shared via a const.
const PoolManagement = dynamic(() => import('./components/PoolManagement').then(m => m.PoolManagement), { ssr: false, loading: () => <LoadingState /> });
const TournamentManagement = dynamic(() => import('./components/TournamentManagement').then(m => m.TournamentManagement), { ssr: false, loading: () => <LoadingState /> });
const CategoryManagement = dynamic(() => import('./components/CategoryManagement').then(m => m.CategoryManagement), { ssr: false, loading: () => <LoadingState /> });
const MatchExplorer = dynamic(() => import('./components/MatchExplorer').then(m => m.MatchExplorer), { ssr: false, loading: () => <LoadingState /> });
const PmExplorer = dynamic(() => import('./components/PmExplorer').then(m => m.PmExplorer), { ssr: false, loading: () => <LoadingState /> });
import { GrowthOverview } from './components/GrowthOverview';
import { ResolutionInspector } from './components/ResolutionInspector';
import { ResolutionSuggestions } from './components/ResolutionSuggestions';
import { LiquidityBot } from './components/LiquidityBot';

// Grouped navigation (Phase 1 of PLAN-ADMIN-RESTRUCTURE): the flat 17-tab bar
// becomes 5 sidebar groups. Components are unchanged — only relocated. Later
// phases merge Finance+Payouts, unify the stuck-pool queues under Pools, and
// dissolve Actions into contextual buttons + Health/System.
type NavEntry = { id: string; label: string; Component: ComponentType };
const NAV_GROUPS: { group: string; items: NavEntry[] }[] = [
  { group: 'Monitor', items: [
    { id: 'health', label: 'Health', Component: SystemHealth },
    { id: 'finance', label: 'Finance', Component: FinanceSection },
    { id: 'users', label: 'Users', Component: UserOverview },
    { id: 'events', label: 'Events', Component: EventLog },
  ] },
  { group: 'Pools', items: [
    { id: 'pools', label: 'Browse', Component: PoolManagement },
    { id: 'attention', label: 'Needs Attention', Component: NeedsAttention },
  ] },
  { group: 'Resolution', items: [
    { id: 'metrics', label: 'Metrics', Component: ResolutionMetrics },
    { id: 'inspector', label: 'Inspector', Component: ResolutionInspector },
    { id: 'review', label: 'Review', Component: ResolutionSuggestions },
  ] },
  { group: 'Markets', items: [
    { id: 'sports', label: 'Sports', Component: MatchExplorer },
    { id: 'predictions', label: 'Predictions', Component: PmExplorer },
    { id: 'tournaments', label: 'Tournaments', Component: TournamentManagement },
    { id: 'categories', label: 'Categories', Component: CategoryManagement },
    { id: 'actions', label: 'Actions', Component: ManualActions },
  ] },
  { group: 'Economy', items: [
    { id: 'growth', label: 'Growth', Component: GrowthOverview },
    { id: 'liquidity', label: 'Liquidity', Component: LiquidityBot },
  ] },
];

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items);
const SIDEBAR_GROUPS = NAV_GROUPS.map(g => ({ group: g.group, items: g.items.map(({ id, label }) => ({ id, label })) }));
const ACTIVE_TAB_KEY = 'admin-active-tab';

// Detect which environment the admin is pointing at, so a single misclick
// between the dev / prod browser tabs is obvious. Reads NEXT_PUBLIC_ENV
// if explicitly set; otherwise infers from NEXT_PUBLIC_API_URL.
// Phase 6 polish - see PLAN-ADMIN-REFACTOR.md §Phase 6.
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
  // - the previous behaviour left admins staring at error toasts in every
  // tab after a key rotation. See PLAN-ADMIN-REFACTOR.md Phase 1 #16.
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [activeId, setActiveId] = useState<string>('health');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const env = useMemo<EnvKind>(() => detectEnv(), []);

  // Restore the last-open section across reloads (stable id, not a numeric index).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = sessionStorage.getItem(ACTIVE_TAB_KEY);
    if (saved && ALL_ITEMS.some(i => i.id === saved)) setActiveId(saved);
  }, []);

  const selectTab = (id: string) => {
    setActiveId(id);
    setMobileNavOpen(false);
    try { sessionStorage.setItem(ACTIVE_TAB_KEY, id); } catch { /* read-only */ }
  };

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
  // browsing contexts that share the same origin/window - modern browsers
  // route it both ways. When another tab clears the key (logout) we drop
  // back to the login screen; when another tab adopts a fresh key we
  // re-verify silently and stay in sync.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: StorageEvent) => {
      if (e.key !== 'admin-key' || e.storageArea !== sessionStorage) return;
      if (e.newValue === null) {
        // Other tab logged out - mirror it.
        setAuthed(false);
        return;
      }
      // Other tab logged in - re-verify the new value before adopting.
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
    // Brief verification flash on mount. No spinner - the admin shell
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

  const ActiveComponent = (ALL_ITEMS.find(i => i.id === activeId) ?? ALL_ITEMS[0]).Component;

  return (
    // ToastProvider is part of Phase 2's primitives module - wraps the
    // whole admin shell so any tab can call useToast()/useMutationFeedback()
    // without remounting its own provider. Phase 3 tabs adopt it.
    <ToastProvider>
      <Box sx={{ minHeight: '100vh', bgcolor: t.bg.app, p: { xs: 1.5, sm: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, gap: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, minWidth: 0 }}>
            <IconButton onClick={() => setMobileNavOpen(true)} size="small" sx={{ display: { md: 'none' }, color: t.text.secondary, mr: -0.5 }}>
              <MenuIcon />
            </IconButton>
            <Typography variant="h5" fontWeight={600} sx={{ fontSize: { xs: '1.05rem', sm: '1.25rem' } }}>
              UpDown Admin
            </Typography>
            {/* Environment badge - gives an at-a-glance signal so the
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

        <Box sx={{ display: 'flex', gap: { xs: 0, md: 3 } }}>
          {/* Desktop sidebar */}
          <Box
            sx={{
              display: { xs: 'none', md: 'block' },
              width: 210, flexShrink: 0,
              borderRight: `1px solid ${t.border.medium}`,
              alignSelf: 'flex-start',
              position: 'sticky', top: 12,
              maxHeight: 'calc(100vh - 90px)', overflowY: 'auto',
            }}
          >
            <AdminSidebar groups={SIDEBAR_GROUPS} activeId={activeId} onSelect={selectTab} />
          </Box>

          {/* Mobile drawer */}
          <Drawer
            open={mobileNavOpen}
            onClose={() => setMobileNavOpen(false)}
            sx={{ display: { md: 'none' } }}
            PaperProps={{ sx: { bgcolor: t.bg.surface, width: 250, borderRight: `1px solid ${t.border.medium}` } }}
          >
            <Box sx={{ px: 1.5, pt: 1.5, fontSize: '0.8rem', fontWeight: 700, color: t.text.secondary }}>Navigation</Box>
            <AdminSidebar groups={SIDEBAR_GROUPS} activeId={activeId} onSelect={selectTab} />
          </Drawer>

          {/* Active section */}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <ActiveComponent />
          </Box>
        </Box>
      </Box>
    </ToastProvider>
  );
}
