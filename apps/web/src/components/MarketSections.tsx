'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ChevronRight, ShowChart, SportsSoccer } from '@mui/icons-material';
import { getIcon } from '@/lib/icon-registry';
import { useThemeTokens } from '@/app/providers';
import { MarketCard } from './MarketCard';
import type { Pool } from '@/lib/api';
import { kindOf } from '@/lib/poolKind';
import type { CategoryConfig } from '@/hooks/useCategories';
import type { LiveScore } from '@/hooks/useLiveScores';

const PER_SECTION = 4;

type UserBet = { side: string; isWinner: boolean | null; betId?: string; claimed?: boolean; refunded?: boolean };

interface Props {
  pools: Pool[];
  categoryMap: Map<string, CategoryConfig>;
  liveScores: Map<string, LiveScore>;
  userBetByPoolId: Map<string, UserBet>;
  onClaim: (poolId: string, betId: string) => void;
  onSeeAll: (typeKey: string) => void;
  onCardClick: (pool: Pool) => void;
}

/**
 * Kalshi-style home: pools grouped into category sections (Crypto, Sports, each
 * PM category), each with a header ("Category →") and a 2-column grid of the top
 * markets in that category. "See all" switches to that category's tab.
 */
export function MarketSections({ pools, categoryMap, liveScores, userBetByPoolId, onClaim, onSeeAll, onCardClick }: Props) {
  const t = useThemeTokens();

  const grouped = new Map<string, Pool[]>();
  for (const p of pools) {
    const k = kindOf(p);
    const key = k === 'crypto' ? 'CRYPTO' : k === 'pm' ? p.league! : 'SPORTS';
    const arr = grouped.get(key);
    if (arr) arr.push(p);
    else grouped.set(key, [p]);
  }

  const sortPools = (a: Pool, b: Pool) => (b.betCount - a.betCount) || (Number(b.totalPool) - Number(a.totalPool));

  // Ordered section keys: Crypto, Sports, then PM categories (config order).
  const sectionKeys: string[] = [];
  if (grouped.has('CRYPTO')) sectionKeys.push('CRYPTO');
  if (grouped.has('SPORTS')) sectionKeys.push('SPORTS');
  for (const [code, cat] of categoryMap) {
    if (code.startsWith('PM_') && cat.enabled && grouped.has(code)) sectionKeys.push(code);
  }

  const meta = (key: string): { label: string; color: string; icon: ReactNode } => {
    if (key === 'CRYPTO') return { label: 'Crypto', color: t.up, icon: <ShowChart sx={{ fontSize: 18 }} /> };
    if (key === 'SPORTS') return { label: 'Sports', color: t.draw, icon: <SportsSoccer sx={{ fontSize: 18 }} /> };
    const cat = categoryMap.get(key);
    const Icon = getIcon(cat?.iconKey);
    return { label: cat?.label || key, color: cat?.color || t.prediction, icon: Icon ? <Icon sx={{ fontSize: 18 }} /> : null };
  };

  if (sectionKeys.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography sx={{ color: t.text.dimmed, fontSize: '0.9rem' }}>No markets available right now</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: { xs: 3, md: 4 }, mb: 6 }}>
      {sectionKeys.map((key) => {
        const m = meta(key);
        const list = grouped.get(key)!.slice().sort(sortPools).slice(0, PER_SECTION);
        return (
          <Box key={key}>
            <Box
              onClick={() => onSeeAll(key)}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, mb: 1.5, cursor: 'pointer', '&:hover .seeall': { color: t.text.primary } }}
            >
              <Box sx={{ color: m.color, display: 'flex' }}>{m.icon}</Box>
              <Typography sx={{ fontSize: '1.05rem', fontWeight: 800, color: t.text.primary }}>{m.label}</Typography>
              <ChevronRight className="seeall" sx={{ fontSize: 20, color: t.text.quaternary, transition: 'color 0.15s' }} />
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: { xs: 1.5, md: 2 } }}>
              {list.map((pool) => (
                <MarketCard
                  key={pool.id}
                  pool={pool}
                  category={pool.league ? categoryMap.get(pool.league) : undefined}
                  liveScore={pool.matchId ? liveScores.get(pool.matchId) : undefined}
                  userBet={userBetByPoolId.get(pool.id)}
                  onClaim={onClaim}
                  onClick={() => onCardClick(pool)}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
