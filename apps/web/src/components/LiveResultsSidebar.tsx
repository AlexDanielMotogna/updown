'use client';

import { useState } from 'react';
import { Box, Typography, Chip, Fab } from '@mui/material';
import { TrendingUp, TrendingDown, FiberManualRecord } from '@mui/icons-material';
import Link from 'next/link';
import { usePools } from '@/hooks/usePools';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR } from '@/lib/constants';
import { AssetIcon } from './AssetIcon';

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
  const { data } = usePools({ status: 'RESOLVED', limit: 20 });
  const pools = data?.data ?? [];

  const sidebarContent = (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FiberManualRecord
            sx={{
              fontSize: 8,
              color: GAIN_COLOR,
              animation: 'pulse 2s infinite',
              '@keyframes pulse': {
                '0%': { opacity: 1 },
                '50%': { opacity: 0.4 },
                '100%': { opacity: 1 },
              },
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
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255,255,255,0.08) transparent',
          '&::-webkit-scrollbar': { width: 4 },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 2,
          },
        }}
      >
        {pools.length === 0 && (
          <Box sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>
              No resolved pools yet
            </Typography>
          </Box>
        )}
        {pools.map((pool, i) => (
          <Link key={pool.id} href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <Box
              sx={{
                px: 2,
                py: 1.5,
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                borderLeft: `3px solid ${pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR}`,
                cursor: 'pointer',
                transition: 'background 0.15s ease',
                animation: `slideDown 0.3s ease ${i * 50}ms both`,
                '@keyframes slideDown': {
                  from: { opacity: 0, transform: 'translateY(-8px)' },
                  to: { opacity: 1, transform: 'translateY(0)' },
                },
                '&:hover': {
                  background: 'rgba(255,255,255,0.03)',
                },
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <AssetIcon asset={pool.asset} size={16} />
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
        ))}
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
          borderRight: '1px solid rgba(255,255,255,0.06)',
          background: '#0D1218',
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
          border: '1px solid rgba(255,255,255,0.1)',
          color: 'text.primary',
          fontSize: '0.7rem',
          fontWeight: 600,
          width: 48,
          height: 48,
          '&:hover': { bgcolor: '#1a2230' },
        }}
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.25 }}>
          <FiberManualRecord sx={{ fontSize: 8, color: GAIN_COLOR, animation: 'pulse 2s infinite' }} />
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
              bgcolor: '#0D1218',
              borderTop: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '12px 12px 0 0',
            }}
          >
            {sidebarContent}
          </Box>
        </Box>
      )}
    </>
  );
}
