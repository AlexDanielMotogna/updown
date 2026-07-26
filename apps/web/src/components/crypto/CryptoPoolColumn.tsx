'use client';

import { useRef, useState } from 'react';
import { Box, Skeleton, Typography } from '@mui/material';
import { PlaceBetCard } from '@/components/pool/PlaceBetCard';
import { InlineChart } from '@/components/pool/InlineChart';
import { PoolCountdown } from './PoolCountdown';
import { usePools } from '@/hooks/usePools';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useDeposit } from '@/hooks/useTransactions';
import { useThemeTokens } from '@/app/providers';
import type { Pool, PoolDetail } from '@/lib/api';

const ASSET_NAME: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };

/**
 * One asset's live 5-min pool: the real on-chain bet card (reused PlaceBetCard +
 * useDeposit) paired with its price chart (reused InlineChart). Same mechanic as the
 * main app — nothing bespoke. Polls so the card auto-advances to the next round.
 */
export function CryptoPoolColumn({ asset }: { asset: string }) {
  const t = useThemeTokens();
  // Poll: when the current round ends/resolves, the next JOINING pool appears and
  // the card swaps to it (no more staring at "determining winner").
  const { data, isLoading } = usePools(
    { type: 'CRYPTO', asset, interval: '5m', status: 'JOINING' },
    { refetchInterval: 3_000, staleTime: 2_000 },
  );
  const pool: Pool | undefined = data?.data?.[0];

  const { deposit, state: txState } = useDeposit();
  const [side, setSide] = useState<'UP' | 'DOWN'>('UP');
  const betFormRef = useRef<HTMLDivElement | null>(null);
  const { getPrice } = usePriceStream([asset]);
  const live = getPrice(asset);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* Header: asset + live countdown */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box component="img" src={`/coins/${asset.toLowerCase()}-coin.png`} alt={asset} sx={{ width: 22, height: 22 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: t.text.primary }}>{ASSET_NAME[asset] ?? asset}</Typography>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>· 5m</Typography>
        </Box>
        {pool && <PoolCountdown endTime={pool.endTime} />}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(300px, 360px) 1fr' }, gap: 2, alignItems: 'stretch' }}>
      <Box>
        {isLoading && !pool ? (
          <Skeleton variant="rounded" height={300} sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
        ) : !pool ? (
          <Box sx={{ height: 300, borderRadius: 2, border: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
            <Typography sx={{ color: t.text.tertiary, fontSize: '0.85rem', textAlign: 'center' }}>No open {asset} pool right now. The next 5-min round opens shortly.</Typography>
          </Box>
        ) : (
          <PlaceBetCard
            pool={pool as PoolDetail}
            selectedSide={side}
            onSelectSide={setSide}
            onBet={(s, a) => { deposit(pool.id, s, a).catch(() => { /* toast handled in hook */ }); }}
            txState={txState}
            betFormRef={betFormRef}
          />
        )}
      </Box>
      <Box sx={{ minHeight: 300, borderRadius: 2, border: `1px solid ${t.border.subtle}`, overflow: 'hidden', bgcolor: t.bg.surface }}>
        {pool ? (
          <InlineChart asset={asset} livePrice={live} strikePrice={pool.strikePrice} />
        ) : (
          <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Skeleton variant="rounded" width="90%" height="80%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />
          </Box>
        )}
      </Box>
      </Box>
    </Box>
  );
}
