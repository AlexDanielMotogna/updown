'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Drawer, IconButton } from '@mui/material';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { usePools } from '@/hooks/usePools';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { useLiveScores } from '@/hooks/useLiveScores';
import { useCategoryMap } from '@/hooks/useCategories';
import { PoolsSidebarList } from './sidebar/PoolsSidebarList';
import { TournamentSidebarList } from './tournament/TournamentSidebarList';

const MAX_VISIBLE = 12;

export function LiveResultsSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebarTab, _setSidebarTab] = useState<'pools' | 'tournaments'>('pools');
  const setSidebarTab = (tab: 'pools' | 'tournaments') => { _setSidebarTab(tab); localStorage.setItem('sidebar-tab', tab); };

  // Tournaments data
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetchTournaments();
        if (!cancelled && res.success && res.data) setTournaments(res.data);
      } catch { /* ignore */ }
    }
    load();
    const iv = setInterval(load, 15_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === '1') setCollapsed(true);
    const savedTab = localStorage.getItem('sidebar-tab');
    if (savedTab === 'tournaments') _setSidebarTab('tournaments');
  }, []);
  const liveScores = useLiveScores();
  const categoryMap = useCategoryMap();
  const { data } = usePools({ limit: 50 });
  const pools = (() => {
    const all = data?.data ?? [];
    // Active sports pools with live scores go first
    const activeSports = all.filter(p => p.poolType === 'SPORTS' && p.status === 'ACTIVE' && (
      (p.matchId && liveScores.has(p.matchId)) ||
      (p.homeTeam && liveScores.has(p.homeTeam.toLowerCase().replace(/[^a-z0-9]/g, '')))
    ));
    // Then resolved/claimable pools
    const resolved = all.filter(p => (p.status === 'RESOLVED' || p.status === 'CLAIMABLE') && p.totalPool !== '0');
    // Deduplicate
    const seen = new Set<string>();
    const combined: typeof all = [];
    for (const p of [...activeSports, ...resolved]) {
      if (!seen.has(p.id)) { seen.add(p.id); combined.push(p); }
    }
    return combined.slice(0, MAX_VISIBLE);
  })();

  // Track known pool IDs to detect genuinely new arrivals
  const knownIdsRef = useRef<Set<string>>(new Set());
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const freshIds = new Set<string>();
    for (const pool of pools) {
      if (!knownIdsRef.current.has(pool.id)) {
        freshIds.add(pool.id);
        knownIdsRef.current.add(pool.id);
      }
    }
    if (freshIds.size > 0 && freshIds.size <= 3) {
      setNewIds(freshIds);
      const t = setTimeout(() => setNewIds(new Set()), 2800);
      return () => clearTimeout(t);
    }
  }, [pools]);

  const sidebarContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Tab bar */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { key: 'pools' as const, icon: <LeaderboardIcon sx={{ fontSize: 18 }} />, color: GAIN_COLOR },
          { key: 'tournaments' as const, icon: <EmojiEventsIcon sx={{ fontSize: 18 }} />, color: ACCENT_COLOR },
        ].map(({ key, icon, color }) => (
          <Box
            key={key}
            onClick={() => setSidebarTab(key)}
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              py: 1.25,
              cursor: 'pointer',
              color: sidebarTab === key ? color : 'rgba(255,255,255,0.2)',
              borderBottom: sidebarTab === key ? `2px solid ${color}` : '2px solid transparent',
              transition: 'all 0.15s ease',
              '&:hover': { color, bgcolor: 'rgba(255,255,255,0.02)' },
            }}
          >
            {icon}
          </Box>
        ))}
      </Box>
      {/* Close / collapse buttons */}
      <Box sx={{ position: 'absolute', top: 4, right: 4, zIndex: 1 }}>
        <IconButton
          onClick={() => setMobileOpen(false)}
          size="small"
          sx={{ display: { xs: 'flex', lg: 'none' }, color: 'rgba(255,255,255,0.2)', p: 0.25, '&:hover': { color: '#fff' } }}
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
        <IconButton
          onClick={() => { setCollapsed(true); localStorage.setItem('sidebar-collapsed', '1'); }}
          size="small"
          sx={{ display: { xs: 'none', lg: 'flex' }, color: 'rgba(255,255,255,0.2)', p: 0.25, '&:hover': { color: '#fff' } }}
        >
          <ChevronLeftIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </Box>

      <Box
        sx={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative',
          maskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, black 85%, transparent 100%)',
        }}
      >
        {sidebarTab === 'pools' && <PoolsSidebarList pools={pools} newIds={newIds} liveScores={liveScores} categoryMap={categoryMap} />}
        {sidebarTab === 'tournaments' && <TournamentSidebarList tournaments={tournaments} />}
      </Box>
    </Box>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'block' },
          width: collapsed ? 28 : 220,
          flexShrink: 0,
          position: 'sticky',
          top: 64,
          height: 'calc(100vh - 64px)',
          background: '#0B0F14',
          transition: 'width 0.2s ease',
          overflow: 'hidden',
        }}
      >
        {collapsed ? (
          <Box
            onClick={() => { setCollapsed(false); localStorage.setItem('sidebar-collapsed', '0'); }}
            sx={{
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.5,
              cursor: 'pointer',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
              transition: 'background 0.15s ease',
            }}
          >
            <ChevronRightIcon sx={{ fontSize: 16, color: GAIN_COLOR }} />
            <Typography
              sx={{
                fontSize: '0.5rem',
                fontWeight: 700,
                color: GAIN_COLOR,
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                letterSpacing: '0.1em',
              }}
            >
              LIVE
            </Typography>
          </Box>
        ) : (
          sidebarContent
        )}
      </Box>

      {/* Mobile toggle */}
      <Box
        onClick={() => setMobileOpen(!mobileOpen)}
        sx={{
          display: { xs: 'flex', lg: 'none' },
          position: 'fixed',
          top: '50%',
          left: 0,
          transform: 'translateY(-50%)',
          zIndex: 99,
          bgcolor: '#0D1219',
          borderRight: '1px solid rgba(255,255,255,0.08)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          borderTopRightRadius: 8,
          borderBottomRightRadius: 8,
          cursor: 'pointer',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.5,
          py: 1.5,
          px: 0.5,
          transition: 'background 0.15s ease',
          '&:hover': { bgcolor: 'rgba(255,255,255,0.06)' },
        }}
      >
        {mobileOpen ? (
          <ChevronLeftIcon sx={{ fontSize: 16, color: GAIN_COLOR }} />
        ) : (
          <ChevronRightIcon sx={{ fontSize: 16, color: GAIN_COLOR }} />
        )}
        <Typography
          sx={{
            fontSize: '0.5rem',
            fontWeight: 700,
            color: GAIN_COLOR,
            writingMode: 'vertical-rl',
            textOrientation: 'mixed',
            letterSpacing: '0.1em',
          }}
        >
          LIVE
        </Typography>
      </Box>

      {/* Mobile drawer */}
      <Drawer
        anchor="left"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        sx={{
          display: { xs: 'block', lg: 'none' },
          '& .MuiDrawer-paper': {
            width: 280,
            backgroundColor: '#0B0F14 !important',
            backgroundImage: 'none',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          },
          '& .MuiBackdrop-root': {
            bgcolor: 'rgba(0,0,0,0.6)',
          },
        }}
      >
        {sidebarContent}
      </Drawer>
    </>
  );
}
