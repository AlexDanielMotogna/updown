'use client';

import { useState, useMemo } from 'react';
import { Box, Typography, TextField, InputAdornment } from '@mui/material';
import { Search } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { PoolPositionRow, PoolPositionRowSkeleton, type PoolPosition } from './PoolPositionRow';
import type { Bet } from '@/lib/api';

type SubTab = 'active' | 'closed';

interface PositionsTabProps {
  bets: Bet[];
  betsLoading: boolean;
  claimingBetId: string | null;
  onClaim: (poolId: string, betId: string) => void;
}

/**
 * Polymarket-style positions view: two sub-tabs (Activa / Cerrado) with a
 * search box and the column-headed table of position rows.
 *
 * Activa  = bets on pools still open (JOINING / ACTIVE / UPCOMING).
 * Cerrado = bets on pools that have resolved (RESOLVED / CLAIMABLE), regardless
 *           of whether the user has actually claimed yet.
 */
export function PositionsTab({ bets, betsLoading, claimingBetId, onClaim }: PositionsTabProps) {
  const t = useThemeTokens();
  const [sub, setSub] = useState<SubTab>('active');
  const [query, setQuery] = useState('');

  // Group bets by pool so a hedger doesn't see two rows for the same
  // market. Preserves insertion order (newest pool first because the bets
  // list comes back ordered by createdAt desc).
  const positions = useMemo(() => {
    const map = new Map<string, PoolPosition>();
    for (const bet of bets) {
      const existing = map.get(bet.pool.id);
      if (existing) existing.bets.push(bet);
      else map.set(bet.pool.id, { poolId: bet.pool.id, pool: bet.pool, bets: [bet] });
    }
    return [...map.values()];
  }, [bets]);

  const { active, closed } = useMemo(() => {
    const a: PoolPosition[] = [];
    const c: PoolPosition[] = [];
    for (const p of positions) {
      const open = p.pool.status === 'JOINING' || p.pool.status === 'ACTIVE' || p.pool.status === 'UPCOMING';
      if (open) a.push(p); else c.push(p);
    }
    return { active: a, closed: c };
  }, [positions]);

  const shown = sub === 'active' ? active : closed;
  const filtered = useMemo(() => {
    if (!query.trim()) return shown;
    const q = query.toLowerCase();
    return shown.filter(p => {
      const asset = p.pool.asset?.toLowerCase() ?? '';
      const home = p.pool.homeTeam?.toLowerCase() ?? '';
      const away = p.pool.awayTeam?.toLowerCase() ?? '';
      return asset.includes(q) || home.includes(q) || away.includes(q);
    });
  }, [shown, query]);

  const subTabSx = (active: boolean) => ({
    px: 2.5, py: 0.85,
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    color: active ? t.text.primary : t.text.tertiary,
    bgcolor: active ? t.bg.surfaceAlt : 'transparent',
    border: `1px solid ${active ? t.border.medium : 'transparent'}`,
    borderRadius: '6px',
    transition: 'all 0.15s ease',
    '&:hover': { color: t.text.primary },
  });

  return (
    <Box>
      {/* Sub-tabs + search bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
        <Box sx={{ display: 'flex', gap: 0.5, p: 0.4, bgcolor: t.bg.surface, borderRadius: '8px', border: `1px solid ${t.border.subtle}` }}>
          <Box onClick={() => setSub('active')} sx={subTabSx(sub === 'active')}>Active</Box>
          <Box onClick={() => setSub('closed')} sx={subTabSx(sub === 'closed')}>Closed</Box>
        </Box>
        <TextField
          placeholder="Search positions"
          value={query}
          onChange={e => setQuery(e.target.value)}
          size="small"
          sx={{
            flex: 1, minWidth: 200, maxWidth: 360,
            '& .MuiOutlinedInput-root': {
              fontSize: '0.85rem', bgcolor: t.bg.surface,
              '& fieldset': { borderColor: t.border.subtle },
              '&:hover fieldset': { borderColor: t.border.medium },
            },
          }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search sx={{ fontSize: 18, color: t.text.quaternary }} />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      {/* Column headers (desktop only). Active shows a scenario split instead
          of a single payout; Closed leads with the net-result chip. */}
      <Box sx={{
        display: { xs: 'none', md: 'grid' },
        gridTemplateColumns: sub === 'active'
          ? '1fr 120px 200px 40px'
          : '150px 1fr 110px 150px 40px',
        gap: 2, px: 2, py: 1, mb: 0.5,
        borderBottom: `1px solid ${t.border.subtle}`,
      }}>
        {sub !== 'active' && (
          <Typography sx={{ fontSize: '0.7rem', color: t.text.secondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Result</Typography>
        )}
        <Typography sx={{ fontSize: '0.7rem', color: t.text.secondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>Market</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: t.text.secondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Stake</Typography>
        <Typography sx={{ fontSize: '0.7rem', color: t.text.secondary, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>
          {sub === 'active' ? 'PnL if win' : 'Payout'}
        </Typography>
        <Box />
      </Box>

      {/* Table body */}
      {betsLoading ? (
        <Box>
          {[1, 2, 3, 4].map(i => <PoolPositionRowSkeleton key={i} />)}
        </Box>
      ) : filtered.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
          <Typography sx={{ color: t.text.tertiary, fontSize: '0.9rem' }}>
            {query.trim()
              ? 'No matches for your search'
              : sub === 'active'
              ? 'No active positions - open one from the markets page'
              : 'No closed positions yet'}
          </Typography>
        </Box>
      ) : (
        <Box>
          {filtered.map(pos => (
            <PoolPositionRow
              key={pos.poolId}
              position={pos}
              onClaim={onClaim}
              isClaiming={claimingBetId != null}
              claimingBetId={claimingBetId}
            />
          ))}
        </Box>
      )}
    </Box>
  );
}
