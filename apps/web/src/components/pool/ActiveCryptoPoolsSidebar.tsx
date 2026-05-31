'use client';

import { useMemo } from 'react';
import { Box, Typography, Skeleton } from '@mui/material';
import { Circle } from '@mui/icons-material';
import Link from 'next/link';
import { usePools } from '@/hooks';
import { AssetIcon } from '@/components/AssetIcon';
import { INTERVAL_LABELS } from '@/lib/constants';
import { getAssetName, getAssetTint } from '@/lib/assets';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  currentPoolId: string;
  /** Cap on rows shown — Polymarket renders 4. */
  limit?: number;
}

/**
 * Right-rail "Active crypto pools" list shown under the Place Bet card,
 * Polymarket-style: ranked by total volume (highest first) so the user lands
 * on the busiest market when they click out.
 */
export function ActiveCryptoPoolsSidebar({ currentPoolId, limit = 4 }: Props) {
  const t = useThemeTokens();
  // Pull live crypto pools — the API filters by `type=CRYPTO` and we narrow
  // to currently-bettable statuses. Sorting happens client-side because the
  // backend doesn't expose a volume sort.
  const { data, isLoading } = usePools({
    type: 'CRYPTO',
    status: 'JOINING,ACTIVE',
    limit: 30,
  });

  const pools = useMemo(() => {
    const all = data?.data ?? [];
    return all
      .filter(p => p.id !== currentPoolId)
      .map(p => ({ ...p, _vol: Number(p.totalPool || 0) }))
      .sort((a, b) => b._vol - a._vol)
      .slice(0, limit);
  }, [data, currentPoolId, limit]);

  if (isLoading && pools.length === 0) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mt: 2 }}>
        {Array.from({ length: limit }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={48} sx={{ bgcolor: t.hover.light, borderRadius: 1 }} />
        ))}
      </Box>
    );
  }

  if (pools.length === 0) return null;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography
        sx={{
          fontSize: '0.62rem',
          fontWeight: 700,
          color: t.text.quaternary,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          mb: 1,
          px: 0.5,
        }}
      >
        More crypto markets
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {pools.map(p => {
          const tint = getAssetTint(p.asset, t.accent);
          const totalUp = Number(p.totalUp);
          const totalDown = Number(p.totalDown);
          const total = totalUp + totalDown;
          const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
          // Leading side label + percent — matches the "49% Up" / "12% Up"
          // tag on the right of each Polymarket sidebar row.
          const leadingSide = upPct >= 50 ? 'Up' : 'Down';
          const leadingPct = upPct >= 50 ? upPct : 100 - upPct;
          const leadingColor = upPct >= 50 ? t.up : t.down;
          const intervalLabel = INTERVAL_LABELS[p.interval] || p.interval;
          return (
            <Link
              key={p.id}
              href={`/pool/${p.id}`}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 1,
                  py: 0.75,
                  borderRadius: 1,
                  cursor: 'pointer',
                  transition: 'background 0.12s',
                  '&:hover': { bgcolor: t.hover.light },
                }}
              >
                <Box
                  sx={{
                    width: 28,
                    height: 28,
                    borderRadius: 1,
                    bgcolor: withAlpha(tint, 0.85),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <AssetIcon asset={p.asset} size={18} />
                </Box>
                <Typography
                  sx={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: t.text.primary,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {getAssetName(p.asset)} Up or Down — {intervalLabel}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, flexShrink: 0 }}>
                  <Circle sx={{ fontSize: 7, color: leadingColor }} />
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography sx={{ fontSize: '0.78rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                      {leadingPct}%
                    </Typography>
                    <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: leadingColor, lineHeight: 1 }}>
                      {leadingSide}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Link>
          );
        })}
      </Box>
    </Box>
  );
}
