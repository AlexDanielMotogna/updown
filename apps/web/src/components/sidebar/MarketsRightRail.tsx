'use client';

import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { Close, LocalFireDepartment, BarChart, FiberNew } from '@mui/icons-material';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchTrendingPools, fetchPools, type Pool } from '@/lib/api';
import { INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';

const ASSET_NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };

function poolTitle(p: Pool): string {
  if (p.poolType !== 'SPORTS') return `${ASSET_NAMES[p.asset] || p.asset} ${INTERVAL_LABELS[p.interval] || p.interval}`;
  if (p.awayTeam) return `${p.homeTeam} vs ${p.awayTeam}`;
  return p.homeTeam || 'Market';
}

function leadPct(p: Pool): number | null {
  const u = Number(p.totalUp), d = Number(p.totalDown), dr = Number(p.totalDraw);
  const tot = u + d + dr;
  if (tot === 0) return null;
  return Math.max(...[u, d, dr].map(x => Math.round((x / tot) * 100)));
}

function compactUsd(base: string): string {
  const v = Number(base) / 1_000_000;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function MarketsRightRail({ onClose }: { onClose?: () => void }) {
  const t = useThemeTokens();
  const router = useRouter();

  const { data: trendingRes } = useQuery({
    queryKey: ['trending-pools'],
    queryFn: fetchTrendingPools,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const { data: activeRes } = useQuery({
    queryKey: ['rail-active'],
    queryFn: () => fetchPools({ status: 'JOINING,ACTIVE', limit: 150 }),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const active = activeRes?.data ?? [];
  const trending = (trendingRes?.data ?? []).slice(0, 6);
  const highestVol = [...active].sort((a, b) => Number(b.totalPool) - Number(a.totalPool)).slice(0, 6);
  const newest = [...active].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6);

  const go = (p: Pool) => router.push(p.poolType !== 'SPORTS' ? `/pool/${p.id}` : `/match/${p.id}`);

  const List = ({ title, icon, color, pools, metric }: { title: string; icon: ReactNode; color: string; pools: Pool[]; metric: (p: Pool) => string | null }) => {
    if (pools.length === 0) return null;
    return (
      <Box sx={{ mb: 2.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, mb: 1 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 800, color: t.text.primary }}>{title}</Typography>
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          {pools.map((p, i) => {
            const m = metric(p);
            return (
              <Box
                key={p.id}
                onClick={() => go(p)}
                sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.6, px: 0.5, borderRadius: 1, cursor: 'pointer', '&:hover': { bgcolor: t.hover.default } }}
              >
                <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.text.dimmed, width: 14, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{i + 1}</Typography>
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.76rem', fontWeight: 500, color: t.text.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {poolTitle(p)}
                </Typography>
                {m && (
                  <Typography sx={{ fontSize: '0.74rem', fontWeight: 700, color: t.text.primary, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{m}</Typography>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', py: 2, px: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Markets
        </Typography>
        {onClose && (
          <Box component="button" onClick={onClose} sx={{ background: 'none', border: 'none', cursor: 'pointer', p: 0.25, display: 'flex', color: t.text.dimmed, '&:hover': { color: t.text.primary } }}>
            <Close sx={{ fontSize: 16 }} />
          </Box>
        )}
      </Box>

      <List title="Trending" icon={<LocalFireDepartment sx={{ fontSize: 15 }} />} color={t.accent} pools={trending} metric={(p) => { const v = leadPct(p); return v != null ? `${v}%` : null; }} />
      <List title="Highest volume" icon={<BarChart sx={{ fontSize: 15 }} />} color={t.gain} pools={highestVol} metric={(p) => compactUsd(p.totalPool)} />
      <List title="New" icon={<FiberNew sx={{ fontSize: 16 }} />} color={t.up} pools={newest} metric={(p) => { const v = leadPct(p); return v != null ? `${v}%` : null; }} />
    </Box>
  );
}
