'use client';

import { useEffect, useMemo, useState } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { Circle } from '@mui/icons-material';
import Link from 'next/link';
import { usePools } from '@/hooks';
import { AssetIcon } from '@/components/AssetIcon';
import { INTERVAL_LABELS } from '@/lib/constants';
import { getAssetName } from '@/lib/assets';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import {
  connectSocket,
  getSocket,
  subscribePool,
  unsubscribePool,
} from '@/lib/socket';

interface Props {
  currentPoolId: string;
  /** Cap on rows shown - Polymarket renders 4. */
  limit?: number;
}

/** Interval pills - every row in the sidebar is scoped to exactly one
 *  duration so the user can compare apples to apples. Ordered shortest-first
 *  to match the chart controls elsewhere in the app. */
const INTERVAL_FILTERS = [
  { value: '3m', label: '3m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
] as const;

type IntervalFilter = typeof INTERVAL_FILTERS[number]['value'];

interface PoolUpdatedPayload {
  id: string;
  totalUp: string;
  totalDown: string;
  totalDraw?: string;
}

/**
 * Right-rail crypto pool list shown under the Place Bet card. Sorted by
 * total volume so the busiest market is on top, filtered by interval, and
 * live-reordered as new bets land via the `pool:updated` WS event.
 */
export function ActiveCryptoPoolsSidebar({ currentPoolId, limit = 4 }: Props) {
  const t = useThemeTokens();
  const [interval, setInterval] = useState<IntervalFilter>('5m');

  // Pull live crypto pools - API filters by `type=CRYPTO` and we narrow to
  // currently-bettable statuses. We over-fetch (limit 30) so the interval
  // filter has enough pools to pick from after slicing.
  const { data, isLoading } = usePools({
    type: 'CRYPTO',
    status: 'JOINING,ACTIVE',
    limit: 30,
  });

  // ── Live volumes via WS ─────────────────────────────────────────────
  // Map of poolId → totalPool delta we've observed since fetch. Updated by
  // `pool:updated` events from the server; merged into the sort below so
  // rows reorder the instant a bet lands instead of waiting on a refetch.
  const [liveVolumes, setLiveVolumes] = useState<Map<string, number>>(() => new Map());

  // Filter + sort + cap. Live volumes override pool.totalPool when present
  // so the list reorders as bets arrive; falls back to the fetched value
  // for any pool we haven't seen an update for yet.
  const pools = useMemo(() => {
    const all = data?.data ?? [];
    return all
      .filter((p) => p.id !== currentPoolId)
      .filter((p) => p.interval === interval)
      .map((p) => ({ ...p, _vol: liveVolumes.get(p.id) ?? Number(p.totalPool || 0) }))
      .sort((a, b) => b._vol - a._vol)
      .slice(0, limit);
  }, [data, currentPoolId, interval, limit, liveVolumes]);

  // Subscribe to every visible pool's WS room so the server pushes
  // pool:updated events. We also subscribe to the next slice (up to the
  // over-fetched 30) so a quick reorder from an off-list pool can still
  // bring it onto the screen without a refetch.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const all = data?.data ?? [];
    const watch = all
      .filter((p) => p.id !== currentPoolId)
      .filter((p) => p.interval === interval)
      .slice(0, Math.max(limit * 2, 10))
      .map((p) => p.id);
    const sock = getSocket();
    connectSocket();
    watch.forEach(subscribePool);
    const onUpdate = (d: PoolUpdatedPayload) => {
      const up = Number(d.totalUp || 0);
      const down = Number(d.totalDown || 0);
      const draw = Number(d.totalDraw || 0);
      setLiveVolumes((prev) => {
        const next = new Map(prev);
        next.set(d.id, up + down + draw);
        return next;
      });
    };
    sock.on('pool:updated', onUpdate);
    return () => {
      sock.off('pool:updated', onUpdate);
      watch.forEach(unsubscribePool);
    };
  }, [data, currentPoolId, interval, limit]);

  // Filter pills are always visible so the user can change context even
  // when the current filter has no matches. Skeleton only on first load.
  const filterRow = (
    <Box sx={{ display: 'flex', gap: 0.5, mb: 3, px: 0.25 }}>
      {INTERVAL_FILTERS.map((opt) => {
        const active = opt.value === interval;
        return (
          <Box
            key={opt.value}
            component="button"
            type="button"
            onClick={() => setInterval(opt.value)}
            sx={{
              // Natural width so the pill hugs its label instead of stretching
              // across the row, with a min-width so all four end up the same
              // size visually.
              minWidth: 52,
              px: 1.5,
              py: 1.05,
              border: 'none',
              borderRadius: 1.25,
              // Inherit the app's Satoshi font; native <button> would otherwise
              // fall back to the OS sans-serif and read inconsistent next to
              // the rest of the card.
              fontFamily: 'inherit',
              fontSize: '0.9rem',
              fontWeight: 800,
              lineHeight: 1,
              bgcolor: active ? withAlpha(t.accent, 0.14) : t.hover.light,
              color: active ? t.accent : t.text.primary,
              cursor: 'pointer',
              transition: 'all 0.12s',
              '&:hover': { bgcolor: active ? withAlpha(t.accent, 0.15) : t.hover.medium },
            }}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ mt: 6 }}>
      {filterRow}
      {isLoading && pools.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
          {Array.from({ length: limit }).map((_, i) => (
            <Skeleton key={i} variant="rounded" height={56} sx={{ bgcolor: t.hover.light, borderRadius: 1.5 }} />
          ))}
        </Box>
      ) : pools.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3, px: 1 }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.tertiary }}>
            No {interval} markets right now
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.6 }}>
          {pools.map((p) => (
            <PoolRow key={p.id} pool={p} />
          ))}
        </Box>
      )}
    </Box>
  );
}

// ─── Pool row ───────────────────────────────────────────────────────────────

function PoolRow({ pool }: { pool: { id: string; asset: string; interval: string; totalUp: string; totalDown: string } }) {
  const t = useThemeTokens();
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const leadingSide = upPct >= 50 ? 'Up' : 'Down';
  const leadingPct = upPct >= 50 ? upPct : 100 - upPct;
  const leadingColor = upPct >= 50 ? t.up : t.down;
  const intervalLabel = INTERVAL_LABELS[pool.interval] || pool.interval;

  return (
    <Link href={`/pool/${pool.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
          px: 1.25,
          py: 1,
          borderRadius: 1.5,
          cursor: 'pointer',
          transition: 'background 0.12s',
          '&:hover': { bgcolor: t.hover.light },
        }}
      >
        <AssetIcon asset={pool.asset} size={32} />
        <Typography
          sx={{
            flex: 1,
            minWidth: 0,
            fontSize: '0.85rem',
            fontWeight: 700,
            color: t.text.primary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            lineHeight: 1.3,
          }}
        >
          {getAssetName(pool.asset)} Up or Down - {intervalLabel}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
          <Circle sx={{ fontSize: 8, color: leadingColor }} />
          <Box sx={{ textAlign: 'right' }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {leadingPct}%
            </Typography>
            <Typography sx={{ fontSize: '0.65rem', fontWeight: 700, color: leadingColor, lineHeight: 1 }}>
              {leadingSide}
            </Typography>
          </Box>
        </Box>
      </Box>
    </Link>
  );
}
