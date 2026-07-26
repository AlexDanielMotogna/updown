'use client';

import { Box, Skeleton, Typography } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { InlineChart } from '@/components/pool/InlineChart';
import { CryptoBetPanel } from './CryptoBetPanel';
import { PoolCountdown } from './PoolCountdown';
import { usePools } from '@/hooks/usePools';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useThemeTokens } from '@/app/providers';
import { USDC_DIVISOR } from '@/lib/format';
import type { Pool } from '@/lib/api';

const CYAN = '#5FD8EF';
const PAIR: Record<string, string> = { BTC: 'Bitcoin / USD', ETH: 'Ethereum / USD', SOL: 'Solana / USD' };
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Center panel: the currently-selected asset's live 5-min pool + chart + bet panel. */
export function ActivePool({ asset }: { asset: string }) {
  const t = useThemeTokens();
  const { data } = usePools({ type: 'CRYPTO', asset, interval: '5m', status: 'JOINING' }, { refetchInterval: 3_000, staleTime: 2_000 });
  const pool: Pool | undefined = data?.data?.[0];
  const { getPrice } = usePriceStream([asset]);
  const live = getPrice(asset);
  const liveNum = live ? Number(live) : null;
  const strike = pool?.strikePrice ? Number(pool.strikePrice) / USDC_DIVISOR : null;

  const priceStat = (label: string, value: string, color: string) => (
    <Box>
      <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>{label}</Typography>
      <Typography sx={{ fontWeight: 600, fontSize: '1.05rem', color, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );

  return (
    <Box sx={{ borderRadius: 1.25, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.surface, p: { xs: 2, md: 3 } }}>
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssetIcon asset={asset} size={30} />
            <Typography sx={{ fontWeight: 700, fontSize: { xs: '1.1rem', md: '1.25rem' }, color: t.text.primary }}>{PAIR[asset] ?? asset}</Typography>
            <Box sx={{ px: 1, py: 0.3, borderRadius: 1, bgcolor: t.hover.medium }}><Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.text.secondary }}>Rapid 5m</Typography></Box>
            <InfoOutlined sx={{ fontSize: 16, color: t.text.tertiary }} />
          </Box>
          <Box sx={{ display: 'flex', gap: 3, mt: 1.5 }}>
            {priceStat('Current Price', liveNum != null ? fmtUsd(liveNum) : '—', CYAN)}
            {priceStat('Strike Price', strike != null ? fmtUsd(strike) : '—', t.gold)}
          </Box>
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mb: 0.25 }}>Round ends in</Typography>
          {pool ? <PoolCountdown endTime={pool.endTime} big /> : <Typography sx={{ fontWeight: 900, fontSize: '2rem', color: t.text.tertiary }}>—</Typography>}
        </Box>
      </Box>

      {/* Chart */}
      <Box sx={{ mb: 2.5, borderRadius: 1, overflow: 'hidden' }}>
        {pool ? (
          <InlineChart asset={asset} livePrice={live} strikePrice={pool.strikePrice} height={{ xs: 220, md: 280 }} staticChart background={t.bg.surface} />
        ) : (
          <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Skeleton variant="rounded" width="95%" height="85%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} /></Box>
        )}
      </Box>

      {/* Bet panel */}
      {pool ? (
        <CryptoBetPanel pool={pool} />
      ) : (
        <Box sx={{ textAlign: 'center', py: 3 }}><Typography sx={{ color: t.text.tertiary, fontSize: '0.9rem' }}>Waiting for the next {asset} round to open…</Typography></Box>
      )}
    </Box>
  );
}
