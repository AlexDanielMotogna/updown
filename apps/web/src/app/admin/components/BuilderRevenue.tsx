'use client';

import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, StatCard, LoadingState, EmptyState, ErrorState, Label, POLL_MEDIUM_MS } from '../ui';

interface BuilderRevenueData {
  configured: boolean;
  hlOk?: boolean;
  builderAddress?: string;
  feeRatePct?: number;
  builderRevenueUsd?: number;
  unclaimedUsd?: number;
  claimedUsd?: number;
  volumeUsd?: number;
  trades?: number;
  traders?: number;
  estimatedFromVolumeUsd?: number;
}

const usd = (n: number, dp = 2) =>
  `${n < 0 ? '-' : ''}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: dp })}`;

/**
 * Trading-terminal builder-code revenue. Shows ONLY what our builder code earns
 * (the per-order builder fee that goes 100% to us), NOT HyperLiquid's full fees.
 * Source: HL referral state `builderRewards` + routed-volume context from our
 * trade_fills. See apps/api/src/routes/admin/builder-revenue.ts.
 */
export function BuilderRevenue() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-builder-revenue'],
    queryFn: () => adminFetch<{ data: BuilderRevenueData }>('/builder-revenue'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  if (isLoading) return <LoadingState variant="block" />;
  if (error) return <ErrorState title="Couldn’t load builder revenue" message={(error as Error).message} details={error} onRetry={() => refetch()} />;

  const d = data?.data;
  if (!d?.configured) {
    return (
      <SectionCard title="Trading Terminal — Builder Revenue">
        <EmptyState title="Builder code not configured" hint="Set HYPERLIQUID_BUILDER_ADDRESS + HYPERLIQUID_BUILDER_FEE to track builder-code earnings." />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Trading Terminal — Builder Revenue"
      subtitle="Only the builder-code fee we earn on each trade (goes 100% to us) — not HyperLiquid's full trading fees. Live from HL referral state."
      accentColor={t.gain}
    >
      {!d.hlOk && (
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, bgcolor: `${t.warning}18`, color: t.warning, fontSize: '0.8rem' }}>
          Couldn’t reach HyperLiquid just now — revenue figures may be stale (volume/trades are from our DB).
        </Box>
      )}

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 1.5 }}>
        <StatCard label="Builder Revenue (total)" value={usd(d.builderRevenueUsd ?? 0)} color={t.gain} trend="up" hint="HL builderRewards — what the builder code has earned, all-time." />
        <StatCard label="Unclaimed" value={usd(d.unclaimedUsd ?? 0)} hint="Earned but not yet claimed on HL." />
        <StatCard label="Claimed" value={usd(d.claimedUsd ?? 0)} hint="Already claimed to the builder wallet." />
        <StatCard label="Fee Rate" value={`${(d.feeRatePct ?? 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}%`} hint="Per-order builder fee we charge (HYPERLIQUID_BUILDER_FEE)." />

        <StatCard label="Volume Routed" value={usd(d.volumeUsd ?? 0, 0)} hint="Total notional traded through our terminal (from trade_fills)." />
        <StatCard label="Trades" value={(d.trades ?? 0).toLocaleString()} hint="Fills routed through the terminal." />
        <StatCard label="Traders" value={(d.traders ?? 0).toLocaleString()} hint="Distinct HL accounts that traded via the terminal." />
        <StatCard label="Est. from Volume" value={usd(d.estimatedFromVolumeUsd ?? 0)} hint="Sanity check: routed volume × fee rate. Should track the HL total." />
      </Box>

      {d.builderAddress && (
        <Box sx={{ mt: 2 }}>
          <Label>Builder address</Label>
          <Box sx={{ fontFamily: 'monospace', fontSize: '0.78rem', color: t.text.secondary, wordBreak: 'break-all' }}>{d.builderAddress}</Box>
        </Box>
      )}
    </SectionCard>
  );
}
