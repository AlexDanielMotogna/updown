'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Drawer, IconButton } from '@mui/material';
import { motion, AnimatePresence } from 'framer-motion';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import CloseIcon from '@mui/icons-material/Close';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR, INTERVAL_TAG_IMAGES, INTERVAL_LABELS } from '@/lib/constants';
import { AssetIcon } from './AssetIcon';

const MAX_VISIBLE = 12;

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLORS: Record<string, string> = {
  REGISTERING: UP_COLOR,
  ACTIVE: ACCENT_COLOR,
  COMPLETED: 'rgba(255,255,255,0.35)',
};

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
  const { data } = usePools({ limit: 50 });
  const pools = (data?.data ?? []).filter(
    (p) => (p.status === 'RESOLVED' || p.status === 'CLAIMABLE') &&
           p.totalPool !== '0'
  ).slice(0, MAX_VISIBLE);

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
      {/* Tab bar — split 50/50 like Hellcase */}
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
        {/* ─── Pools tab ─── */}
        {sidebarTab === 'pools' && (
          <>
            {pools.length === 0 && (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  No resolved pools yet
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            <AnimatePresence>
            {pools.map((pool, i) => {
              const isNew = newIds.has(pool.id);
              return (
              <motion.div
                key={pool.id}
                initial={isNew ? { opacity: 0, scale: 0.96, y: -10 } : false}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30, delay: isNew ? i * 0.05 : 0 }}
                layout
              >
              <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <Box
                  sx={{
                    px: 2,
                    py: 1.5,
                    bgcolor: '#0D1219',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                    '&:hover': { background: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <AssetIcon asset={pool.asset} size={22} />
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                        {pool.asset}/USD
                      </Typography>
                    </Box>
                    <Box
                      component="img"
                      src={INTERVAL_TAG_IMAGES[pool.interval] || '/assets/hourly-tag.png'}
                      alt={INTERVAL_LABELS[pool.interval] || pool.interval}
                      sx={{ height: { xs: 32, md: 36 }, imageRendering: '-webkit-optimize-contrast' }}
                    />
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                    <Box
                      component="img"
                      src={pool.winner === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'}
                      alt=""
                      sx={{ width: 14, height: 14 }}
                    />
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR }}>
                      {pool.winner} WINS
                    </Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: GAIN_COLOR, ml: 'auto' }}>
                      {formatUSDC(pool.totalPool)}
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                    {timeAgo(pool.endTime)}
                  </Typography>
                </Box>
              </Link>
              </motion.div>
              );
            })}
            </AnimatePresence>
            </Box>
          </>
        )}

        {/* ─── Tournaments tab ─── */}
        {sidebarTab === 'tournaments' && (
          <>
            {tournaments.length === 0 && (
              <Box sx={{ p: 2, textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
                  No tournaments yet
                </Typography>
              </Box>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {tournaments.map((t) => {
                const filled = t.participantCount ?? t._count?.participants ?? 0;
                const pot = (Number(t.entryFee) * t.size / 1_000_000).toFixed(2);
                const statusColor = STATUS_COLORS[t.status] || 'rgba(255,255,255,0.35)';
                return (
                  <Link key={t.id} href={`/tournament/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                    <Box
                      sx={{
                        px: 2,
                        py: 1.5,
                        bgcolor: '#0D1219',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                        '&:hover': { background: 'rgba(255,255,255,0.04)' },
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5 }}>
                        <Box
                          component="img"
                          src={`/tournaments/tournament-${t.asset.toLowerCase()}.png`}
                          alt={t.asset}
                          sx={{ width: 22, height: 22, objectFit: 'contain' }}
                        />
                        <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.name}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                        <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: statusColor }}>
                          {t.status === 'REGISTERING' ? 'Open' : t.status === 'ACTIVE' ? 'Live' : 'Ended'}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: GAIN_COLOR }}>
                          ${pot}
                        </Typography>
                      </Box>
                      <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                        {filled}/{t.size} players · Round {t.currentRound}/{t.totalRounds}
                      </Typography>
                    </Box>
                  </Link>
                );
              })}
            </Box>
          </>
        )}
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

      {/* Mobile toggle — slim tab on left edge */}
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

      {/* Mobile drawer — slides from left */}
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
