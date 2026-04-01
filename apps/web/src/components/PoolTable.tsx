'use client';

import { useRef, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { AnimatePresence, motion } from 'framer-motion';
import type { Pool } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';
import { CryptoPoolCard } from './pool/CryptoPoolCard';

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
    if (freshIds.size > 0 && freshIds.size <= 3) {
      setNewIds(freshIds);
      const t = setTimeout(() => setNewIds(new Set()), 2800);
      return () => clearTimeout(t);
    }
  }, [pools]);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
        gap: { xs: 1.5, md: 2 },
        opacity: isPlaceholderData ? 0.5 : 1,
        transition: 'opacity 0.2s ease',
      }}
    >
      <AnimatePresence mode="popLayout">
        {pools.map((pool, i) => (
          <motion.div
            key={pool.id}
            initial={newIds.has(pool.id) ? { opacity: 0, y: 10 } : false}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, delay: newIds.has(pool.id) ? i * 0.05 : 0 }}
            layout
          >
            <CryptoPoolCard
              pool={pool}
              userBet={userBetByPoolId.get(pool.id)}
              getPrice={getPrice}
              isNew={newIds.has(pool.id)}
              isPopular={popularPoolIds?.has(pool.id)}
              alwaysShowView={alwaysShowView}
              onClick={onPoolClick ? () => onPoolClick(pool) : undefined}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {pools.length === 0 && (
        <Box sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 8, px: 4 }}>
          <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
            No pools found with current filters
          </Typography>
        </Box>
      )}
    </Box>
  );
}
