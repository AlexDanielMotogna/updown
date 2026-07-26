'use client';

import { useState } from 'react';
import { Box, Typography, Drawer, IconButton } from '@mui/material';
import { Close, ShowChart, AccessTime, EmojiEvents, InfoOutlined } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { CryptoBetPanel } from './CryptoBetPanel';
import { PoolCountdown } from './PoolCountdown';
import { usePools } from '@/hooks/usePools';
import { useThemeTokens } from '@/app/providers';
import { USDC_DIVISOR } from '@/lib/format';
import type { Pool } from '@/lib/api';

const NAME: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };
const fmtUsd = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const NAV = [
  { id: 'sec-predict', label: 'Chart', Icon: ShowChart },
  { id: 'sec-activity', label: 'Activity', Icon: AccessTime },
  { id: 'sec-leaderboard', label: 'Ranking', Icon: EmojiEvents },
  { id: 'sec-info', label: 'Info', Icon: InfoOutlined },
];

/**
 * Fixed mobile dock: a diagonal UP/DOWN "Place order" bar (always on screen so a
 * prediction is one tap away) over a section nav row. Tapping a side opens a
 * bottom sheet with the full bet form (reuses CryptoBetPanel), side preselected.
 */
export function MobilePredictBar({ asset }: { asset: string }) {
  const t = useThemeTokens();
  const { data } = usePools({ type: 'CRYPTO', asset, interval: '5m', status: 'JOINING' }, { refetchInterval: 3_000, staleTime: 2_000 });
  const pool: Pool | undefined = data?.data?.[0];
  const [sheet, setSheet] = useState<'UP' | 'DOWN' | null>(null);

  const strikeStr = pool?.strikePrice ? fmtUsd(Number(pool.strikePrice) / USDC_DIVISOR) : '—';
  const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const half = (s: 'UP' | 'DOWN') => {
    const up = s === 'UP';
    // Diagonal seam: UP is wider at the top, DOWN wider at the bottom.
    const clip = up ? 'polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%)' : 'polygon(18px 0, 100% 0, 100% 100%, 0 100%)';
    return (
      <Box
        component="button"
        onClick={() => pool && setSheet(s)}
        disabled={!pool}
        sx={{
          flex: 1, border: 'none', cursor: pool ? 'pointer' : 'default', clipPath: clip, bgcolor: up ? t.up : t.down,
          // Darken the app hue slightly so white text stays legible on the light cyan-green.
          backgroundImage: 'linear-gradient(rgba(0,0,0,0.34), rgba(0,0,0,0.34))',
          color: '#fff', fontFamily: 'inherit', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          py: 1, opacity: pool ? 1 : 0.55, transition: 'filter 0.15s', '&:active': { filter: 'brightness(1.15)' },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
          <Box component="img" src={up ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt="" sx={{ width: 18, height: 18 }} />
          <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.02em' }}>{s}</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, mt: 0.1 }}>Place order</Typography>
        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.78)', mt: 0.1, fontVariantNumeric: 'tabular-nums' }}>Strike {strikeStr}</Typography>
      </Box>
    );
  };

  return (
    <>
      <Box sx={{ display: { xs: 'block', lg: 'none' }, position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 96, bgcolor: t.bg.app, boxShadow: '0 -6px 20px rgba(0,0,0,0.4)' }}>
        {/* Diagonal UP / DOWN place-order bar */}
        <Box sx={{ display: 'flex', gap: '3px', px: 1, pt: 1, pb: 0.75 }}>
          {half('UP')}
          {half('DOWN')}
        </Box>
        {/* Section nav */}
        <Box sx={{ display: 'flex', height: 46, borderTop: `1px solid ${t.border.subtle}` }}>
          {NAV.map(({ id, label, Icon }) => (
            <Box key={id} onClick={() => go(id)} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.15, cursor: 'pointer', color: t.text.secondary, '&:active': { color: '#5FD8EF' } }}>
              <Icon sx={{ fontSize: 18 }} />
              <Typography sx={{ fontSize: '0.58rem', fontWeight: 600 }}>{label}</Typography>
            </Box>
          ))}
        </Box>
      </Box>

      <Drawer
        anchor="bottom"
        open={!!sheet && !!pool}
        onClose={() => setSheet(null)}
        PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: '16px 16px 0 0', maxHeight: '90vh', backgroundImage: 'none' } }}
      >
        {pool && sheet && (
          <Box sx={{ p: 2 }}>
            <Box sx={{ width: 36, height: 4, borderRadius: 2, bgcolor: t.border.medium, mx: 'auto', mb: 1.5 }} />
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AssetIcon asset={asset} size={26} />
                <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: t.text.primary }}>{NAME[asset] ?? asset}</Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', ml: 1 }}>
                  <Typography sx={{ fontSize: '0.6rem', color: t.text.tertiary, lineHeight: 1 }}>Ends in</Typography>
                  <PoolCountdown endTime={pool.endTime} plain />
                </Box>
              </Box>
              <IconButton onClick={() => setSheet(null)} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 20 }} /></IconButton>
            </Box>
            <CryptoBetPanel key={`${sheet}-${pool.id}`} pool={pool} initialSide={sheet} />
          </Box>
        )}
      </Drawer>
    </>
  );
}
