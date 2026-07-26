'use client';

import { Box, Typography } from '@mui/material';
import { ShowChart } from '@mui/icons-material';
import { AssetIcon } from '@/components/AssetIcon';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useThemeTokens } from '@/app/providers';

const ASSETS = ['BTC', 'ETH', 'SOL'];
const PAIR: Record<string, string> = { BTC: 'BTC / USD', ETH: 'ETH / USD', SOL: 'SOL / USD' };
const CYAN = '#5FD8EF';
const fmtUsd = (n: number | null) => (n != null ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

/** Left-column markets list. Clicking a row switches the center's active asset. */
export function MarketsCard({ active, onSelect }: { active: string; onSelect: (a: string) => void }) {
  const t = useThemeTokens();
  const { getPrice } = usePriceStream(ASSETS);

  return (
    <Box sx={{ borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, color: CYAN }}>
        <ShowChart sx={{ fontSize: 18 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.82rem', letterSpacing: '0.05em', color: t.text.primary }}>MARKETS</Typography>
      </Box>
      {ASSETS.map((a) => {
        const p = getPrice(a);
        const price = p ? Number(p) : null;
        const sel = active === a;
        return (
          <Box key={a} onClick={() => onSelect(a)} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, cursor: 'pointer', borderBottom: `1px solid ${t.border.subtle}`, borderLeft: `2px solid ${sel ? CYAN : 'transparent'}`, bgcolor: sel ? `${CYAN}0d` : 'transparent', '&:hover': { bgcolor: t.hover.light } }}>
            <AssetIcon asset={a} size={30} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.primary }}>{PAIR[a]}</Typography>
              <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{fmtUsd(price)}</Typography>
            </Box>
            <Box sx={{ px: 0.75, py: 0.25, borderRadius: 1, bgcolor: t.hover.medium }}><Typography sx={{ fontSize: '0.62rem', fontWeight: 700, color: t.text.tertiary }}>Rapid 5m</Typography></Box>
          </Box>
        );
      })}
    </Box>
  );
}
