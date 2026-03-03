'use client';

import { useState, useRef, useEffect } from 'react';
import { Box, Typography, Chip, Fab } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import LeaderboardIcon from '@mui/icons-material/Leaderboard';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR } from '@/lib/constants';
import { AssetIcon } from './AssetIcon';

const MAX_VISIBLE = 12;

const INTERVAL_LABELS: Record<string, string> = {
  '1m': 'Turbo 1m',
  '5m': 'Rapid 5m',
  '15m': 'Short 15m',
  '1h': 'Hourly',
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function LiveResultsSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data } = usePools({ limit: 50 });
  const pools = (data?.data ?? []).filter(
    (p) => (p.status === 'RESOLVED' || p.status === 'CLAIMABLE') &&
           p.totalPool !== '0' // BUG-13: Hide empty pools with no bets
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
    // Only animate if 1-3 new results trickle in (not bulk load/refresh)
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
      }}
    >
      <Box sx={{ px: 2, py: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LeaderboardIcon
            sx={{
              fontSize: 16,
              color: GAIN_COLOR,
            }}
          />
          <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: '0.08em' }}>
            LIVE RESULTS
          </Typography>
        </Box>
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
        {pools.length === 0 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              No resolved pools yet
            </Typography>
          </Box>
        )}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {pools.map((pool) => {
          const isNew = newIds.has(pool.id);
          return (
          <Link key={pool.id} href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                bgcolor: '#0D1219',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                ...(isNew && {
                  animation: 'newResult 2.6s cubic-bezier(0.22, 1, 0.36, 1) both',
                  '@keyframes newResult': {
                    '0%': { opacity: 0, transform: 'scale(0.96) translateY(-10px)' },
                    '60%': { opacity: 1 },
                    '100%': { opacity: 1, transform: 'scale(1) translateY(0)' },
                  },
                }),
                '&:hover': {
                  background: 'rgba(255,255,255,0.04)',
                },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AssetIcon asset={pool.asset} size={22} />
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    {pool.asset}/USD
                  </Typography>
                </Box>
                <Chip
                  label={INTERVAL_LABELS[pool.interval] || pool.interval}
                  size="small"
                  sx={{
                    height: 18,
                    fontSize: '0.6rem',
                    fontWeight: 500,
                    bgcolor: 'rgba(255,255,255,0.06)',
                    color: 'text.secondary',
                    borderRadius: '2px',
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                {pool.winner === 'UP' ? (
                  <TrendingUp sx={{ fontSize: 14, color: UP_COLOR }} />
                ) : (
                  <TrendingDown sx={{ fontSize: 14, color: DOWN_COLOR }} />
                )}
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR,
                  }}
                >
                  {pool.winner} WINS
                </Typography>
                <Typography
                  sx={{
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: GAIN_COLOR,
                    ml: 'auto',
                  }}
                >
                  {formatUSDC(pool.totalPool)}
                </Typography>
              </Box>
              <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary' }}>
                {timeAgo(pool.endTime)}
              </Typography>
            </Box>
          </Link>
          );
        })}
        </Box>
      </Box>
    </Box>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <Box
        sx={{
          display: { xs: 'none', lg: 'block' },
          width: 220,
          flexShrink: 0,
          position: 'sticky',
          top: 64,
          height: 'calc(100vh - 64px)',
          background:'#0B0F14',
        }}
      >
        {sidebarContent}
      </Box>

      {/* Mobile FAB */}
      <Fab
        size="small"
        onClick={() => setMobileOpen(!mobileOpen)}
        sx={{
          display: { xs: 'flex', lg: 'none' },
          position: 'fixed',
          bottom: 80,
          left: 16,
          zIndex: 99,
          bgcolor: '#111820',
          border: 'none',
          color: 'text.primary',
          fontSize: '0.7rem',
          fontWeight: 600,
          width: 48,
          height: 48,
          '&:hover': { bgcolor: '#1a2230' },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <LeaderboardIcon sx={{ fontSize: 14, color: GAIN_COLOR }} />
          <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, lineHeight: 1 }}>LIVE</Typography>
        </Box>
      </Fab>

      {/* Mobile bottom sheet */}
      {mobileOpen && (
        <Box
          onClick={() => setMobileOpen(false)}
          sx={{
            display: { xs: 'block', lg: 'none' },
            position: 'fixed',
            inset: 0,
            zIndex: 98,
            bgcolor: 'rgba(0,0,0,0.5)',
          }}
        >
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              maxHeight: '60vh',
              bgcolor: '#080C11',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 0,
            }}
          >
            {sidebarContent}
          </Box>
        </Box>
      )}
    </>
  );
}
