'use client';

import { useRef, useEffect, useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { AnimatePresence } from 'framer-motion';
import type { Pool } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { PoolRow } from './pool/PoolRow';

interface PoolTableProps {
  pools: Pool[];
  userBetByPoolId: Map<string, { side: 'UP' | 'DOWN' | 'DRAW'; isWinner: boolean | null }>;
  getPrice: (asset: string) => string | null;
  isPlaceholderData?: boolean;
  popularPoolIds?: Set<string>;
  alwaysShowView?: boolean;
  onPoolClick?: (pool: Pool) => void;
}

export function PoolTable({ pools, userBetByPoolId, getPrice, isPlaceholderData, popularPoolIds, alwaysShowView, onPoolClick }: PoolTableProps) {
  const t = useThemeTokens();
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
    // Only animate if 1-3 new pools trickle in (WebSocket),
    // not bulk loads (page load, tab switch)
    if (freshIds.size > 0 && freshIds.size <= 3) {
      setNewIds(freshIds);
      const t = setTimeout(() => setNewIds(new Set()), 2800);
      return () => clearTimeout(t);
    }
  }, [pools]);

  return (
    <Box
      sx={{
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        opacity: isPlaceholderData ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      {/* Table header (desktop only) */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '100px 2fr 1fr 1fr 1fr 1fr 0.7fr 1fr 0.4fr',
          pr: 2,
          pl: 0,
          py: 1,
          bgcolor: t.bg.surfaceAlt,
        }}
      >
        {[
          { label: '', tip: '' },
          { label: 'Asset', tip: 'Cryptocurrency and pool timeframe' },
          { label: 'Countdown', tip: 'Time remaining before the pool locks' },
          { label: 'Distribution', tip: 'How USDC is split between UP and DOWN sides' },
          { label: 'Pool Size', tip: 'Total USDC staked by all players' },
          { label: 'Odds', tip: 'Current payout multiplier if your side wins' },
          { label: 'Players', tip: 'Number of participants in the pool' },
          { label: 'Action', tip: '' },
          { label: 'Share', tip: '' },
        ].map((h, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.4, ...(h.label === 'Action' && { justifyContent: 'flex-start' }) }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
              {h.label}
            </Typography>
            {h.tip && (
              <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                <InfoOutlined sx={{ fontSize: 11, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>

      {/* Rows */}
      <AnimatePresence mode="popLayout">
        {pools.map((pool, i) => (
          <PoolRow
            key={pool.id}
            pool={pool}
            userBet={userBetByPoolId.get(pool.id)}
            getPrice={getPrice}
            index={i}
            isNew={newIds.has(pool.id)}
            isPopular={popularPoolIds?.has(pool.id)}
            alwaysShowView={alwaysShowView}
            onClick={onPoolClick ? () => onPoolClick(pool) : undefined}
          />
        ))}
      </AnimatePresence>

      {pools.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
          <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
            No pools found with current filters
          </Typography>
        </Box>
      )}
    </Box>
  );
}
