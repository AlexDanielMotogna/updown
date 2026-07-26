'use client';

import { Box, Typography } from '@mui/material';
import { AssetIcon } from '@/components/AssetIcon';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useThemeTokens } from '@/app/providers';

const ASSETS = ['BTC', 'ETH', 'SOL'];
const CYAN = '#5FD8EF';
const fmtUsd = (n: number | null) => (n != null ? `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—');

/**
 * Compact horizontal market switcher for mobile — sticky under the navbar so
 * changing BTC/ETH/SOL is one tap without scrolling to the Markets card.
 */
export function MarketTabs({ active, onSelect }: { active: string; onSelect: (a: string) => void }) {
  const t = useThemeTokens();
  const { getPrice } = usePriceStream(ASSETS);

  return (
    <Box data-tour="markets" sx={{ display: 'flex', gap: '6px' }}>
      {ASSETS.map((a) => {
        const p = getPrice(a);
        const price = p ? Number(p) : null;
        const sel = active === a;
        return (
          <Box
            key={a}
            onClick={() => onSelect(a)}
            sx={{
              flex: 1, minWidth: 0, cursor: 'pointer', textAlign: 'center', py: 0.75, px: 0.5, borderRadius: 1,
              border: `1px solid ${sel ? CYAN : t.border.subtle}`,
              bgcolor: sel ? `${CYAN}14` : t.bg.surface,
              transition: 'all 0.15s',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5 }}>
              <AssetIcon asset={a} size={16} />
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 800, color: sel ? CYAN : t.text.primary }}>{a}</Typography>
            </Box>
            <Typography sx={{ fontSize: '0.62rem', color: t.text.secondary, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fmtUsd(price)}</Typography>
          </Box>
        );
      })}
    </Box>
  );
}
