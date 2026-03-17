'use client';

import { useRef, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { AnimatePresence } from 'framer-motion';
import type { Pool } from '@/lib/api';
import { PoolRow } from './pool/PoolRow';

interface PoolTableProps {
  pools: Pool[];
  userBetByPoolId: Map<string, { side: 'UP' | 'DOWN'; isWinner: boolean | null }>;
  getPrice: (asset: string) => string | null;
  isPlaceholderData?: boolean;
  popularPoolIds?: Set<string>;
}

export function PoolTable({ pools, userBetByPoolId, getPrice, isPlaceholderData, popularPoolIds }: PoolTableProps) {
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
          gridTemplateColumns: '110px minmax(180px, 2fr) 110px 140px 100px 110px 60px 150px',
          pr: 2,
          pl: 0,
          py: 1,
          bgcolor: '#0D1219',
        }}
      >
        {['', 'Asset', 'Countdown', 'Distribution', 'Pool Size', 'Odds', 'Players', 'Action'].map((h, i) => (
          <Typography key={i} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
            {h}
          </Typography>
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
