'use client';

import { Box, Skeleton, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { InlineChart } from '@/components/pool/InlineChart';
import { BetFlash } from '@/components/BetFlash';
import { CryptoBetPanel } from './CryptoBetPanel';
import { PoolCountdown } from './PoolCountdown';
import { usePools } from '@/hooks/usePools';
import { useBetFlash } from '@/hooks/useBetFlash';
import { usePoolWeighting } from '@/hooks/usePoolWeighting';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useQuery } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { USDC_DIVISOR } from '@/lib/format';
import { fetchBets, type Pool } from '@/lib/api';

const CYAN = '#5FD8EF';
const NAME: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };
const fmtUsd = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Center panel: the currently-selected asset's live 5-min pool + chart + bet panel. */
export function ActivePool({ asset }: { asset: string }) {
  const t = useThemeTokens();
  const { data } = usePools({ type: 'CRYPTO', asset, interval: '5m', status: 'JOINING' }, { refetchInterval: 3_000, staleTime: 2_000 });
  const pool: Pool | undefined = data?.data?.[0];
  const { getPrice } = usePriceStream([asset]);
  const { walletAddress } = useWalletBridge();
  const betFlashes = useBetFlash(pool?.id);
  const { data: weighting } = usePoolWeighting(pool?.id, pool?.status === 'JOINING');
  const { data: myBets } = useQuery({
    queryKey: ['crypto-pool-mybets', pool?.id, walletAddress],
    queryFn: () => fetchBets(walletAddress!, { limit: 30 }),
    enabled: !!pool && !!walletAddress,
    refetchInterval: 5_000,
    select: (r) => r.data,
  });
  const live = getPrice(asset);
  const liveNum = live ? Number(live) : null;
  const strike = pool?.strikePrice ? Number(pool.strikePrice) / USDC_DIVISOR : null;

  // Pool depth + volume + bets, and the user's own position on this pool.
  const totalVol = pool ? (Number(pool.totalUp) + Number(pool.totalDown)) / USDC_DIVISOR : 0;
  const betsCount = weighting?.betsCount ?? 0;
  const mine = (myBets ?? []).filter((b) => b.poolId === pool?.id);
  const myUp = mine.filter((b) => b.side === 'UP').reduce((s, b) => s + Number(b.amount), 0) / USDC_DIVISOR;
  const myDown = mine.filter((b) => b.side === 'DOWN').reduce((s, b) => s + Number(b.amount), 0) / USDC_DIVISOR;

  const priceStat = (label: string, value: string, color: string, tip: string) => (
    <Box>
      <Tooltip arrow title={tip}>
        <Typography sx={{ fontSize: { xs: '0.66rem', md: '0.72rem' }, color: t.text.tertiary, cursor: 'help', display: 'inline-block', borderBottom: `1px dotted ${t.border.medium}` }}>{label}</Typography>
      </Tooltip>
      <Typography sx={{ fontWeight: 600, fontSize: { xs: '0.9rem', md: '1.05rem' }, color, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );

  return (
    <Box sx={{ borderRadius: 1.25, bgcolor: t.bg.surface, p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column' }}>
      {/* Header (order 0) */}
      <Box data-tour="round" sx={{ order: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 2, mb: { xs: 1.5, md: 2 }, flexWrap: 'wrap' }}>
        <Box sx={{ width: { xs: '100%', md: 'auto' } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AssetIcon asset={asset} size={30} />
            <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.98rem', md: '1.25rem' }, color: t.text.primary }}>{NAME[asset] ?? asset}</Typography>
            <Tooltip arrow title="Predict UP or DOWN on where the price closes vs the strike when the 5-minute round ends. Winners split the losing pool; earlier predictions carry more weight.">
              <InfoOutlined sx={{ fontSize: 16, color: t.text.tertiary, cursor: 'help' }} />
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: { xs: 2, md: 3 }, mt: { xs: 1, md: 1.5 } }}>
            {priceStat('Current Price', liveNum != null ? fmtUsd(liveNum) : '—', CYAN, 'The live market price right now.')}
            {priceStat('Strike Price', strike != null ? fmtUsd(strike) : '—', t.gold, 'The reference price set when the round opened. You win UP if the price closes above it, DOWN if below.')}
            {/* Countdown inline with the price stats on mobile (its own top-right block on desktop) */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, ml: 'auto' }}>
              <Tooltip arrow title="Time left to predict in this round.">
                <Typography sx={{ fontSize: { xs: '0.66rem', md: '0.72rem' }, color: t.text.tertiary, cursor: 'help', display: 'inline-block', borderBottom: `1px dotted ${t.border.medium}` }}>Ends in</Typography>
              </Tooltip>
              {pool ? <PoolCountdown endTime={pool.endTime} plain /> : <Typography sx={{ fontWeight: 600, fontSize: '0.9rem', color: t.text.tertiary }}>—</Typography>}
            </Box>
          </Box>
        </Box>
        <Box sx={{ display: { xs: 'none', md: 'block' }, textAlign: 'right' }}>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, mb: 0.25 }}>Round ends in</Typography>
          {pool ? <PoolCountdown endTime={pool.endTime} big /> : <Typography sx={{ fontWeight: 900, fontSize: '2rem', color: t.text.tertiary }}>—</Typography>}
        </Box>
      </Box>

      {/* Chart */}
      <Box sx={{ order: 1, position: 'relative', borderRadius: 1, overflow: 'hidden', mb: 2.5 }}>
        {pool ? (
          <>
            <InlineChart asset={asset} livePrice={live} strikePrice={pool.strikePrice} height={{ xs: 220, md: 280 }} staticChart background={t.bg.surface} />
            <BetFlash flashes={betFlashes} variant="chart-bottom-left" />
          </>
        ) : (
          <Box sx={{ height: 280, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Skeleton variant="rounded" width="95%" height="85%" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} /></Box>
        )}
      </Box>

      {/* Pool stats (Kalshi/Polymarket style): total volume + predictions + your position */}
      {pool && (
        <Box sx={{ order: 2, mb: { xs: 0, lg: 2 }, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, flexWrap: 'wrap' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <Box>
              <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Volume</Typography>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(totalVol)}</Typography>
            </Box>
            <Box>
              <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Predictions</Typography>
              <Typography sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>{betsCount}</Typography>
            </Box>
          </Box>
          {(myUp > 0 || myDown > 0) && (
            <Box sx={{ textAlign: 'right' }}>
              <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your position</Typography>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>
                {myUp > 0 && <Box component="span" sx={{ color: t.up }}>UP {fmtUsd(myUp)}</Box>}
                {myUp > 0 && myDown > 0 && <Box component="span" sx={{ color: t.text.tertiary }}> · </Box>}
                {myDown > 0 && <Box component="span" sx={{ color: t.down }}>DOWN {fmtUsd(myDown)}</Box>}
              </Typography>
            </Box>
          )}
        </Box>
      )}

      {/* Bet panel — desktop only; on mobile the fixed dock + bottom sheet handle betting */}
      <Box sx={{ order: 3, display: { xs: 'none', lg: 'block' } }}>
        {pool ? (
          <CryptoBetPanel pool={pool} />
        ) : (
          <Box sx={{ textAlign: 'center', py: 3 }}><Typography sx={{ color: t.text.tertiary, fontSize: '0.9rem' }}>Waiting for the next {asset} round to open…</Typography></Box>
        )}
      </Box>
    </Box>
  );
}
