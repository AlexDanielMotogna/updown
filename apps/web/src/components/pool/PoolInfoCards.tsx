'use client';

import { Box, Typography } from '@mui/material';
import { ShowChart } from '@mui/icons-material';
import { formatUSDC, formatPrice } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

interface PoolInfoCardsProps {
  livePrice: string | null;
  priceFlash: 'up' | 'down' | null;
  strikePrice: string | null;
  totalUp: string;
  totalDown: string;
  onChartOpen: () => void;
}

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
      <Box>
        <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>{label}</Typography>
        {children}
      </Box>
    </Box>
  );
}

export function PoolInfoCards({ livePrice, priceFlash, strikePrice, totalUp, totalDown, onChartOpen }: PoolInfoCardsProps) {
  return (
    <Box sx={{ bgcolor: '#0D1219' }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' },
            gap: 0.5,
          }}
        >
          {/* Live Price */}
          <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center', gridColumn: { xs: 'span 2', sm: 'span 1' } }}>
            <Box>
              <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>Live Price</Typography>
              <Typography
                sx={{
                  fontSize: { xs: '1.1rem', md: '1.3rem' },
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: priceFlash === 'up' ? UP_COLOR : priceFlash === 'down' ? DOWN_COLOR : '#fff',
                  transition: 'color 0.15s ease',
                }}
              >
                {livePrice
                  ? `$${Number(livePrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : ''}
              </Typography>
            </Box>
          </Box>

          <InfoCard label="Strike Price">
            <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {strikePrice ? formatPrice(strikePrice) : ''}
            </Typography>
          </InfoCard>

          <InfoCard label="UP Pool">
            <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: UP_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {formatUSDC(totalUp)}
            </Typography>
          </InfoCard>

          <InfoCard label="DOWN Pool">
            <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: DOWN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
              {formatUSDC(totalDown)}
            </Typography>
          </InfoCard>

          {/* View Chart */}
          <Box
            onClick={onChartOpen}
            sx={{
              bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.1)',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: 'rgba(255,255,255,0.2)' },
              transition: 'all 0.2s ease',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShowChart sx={{ fontSize: 20, color: '#fff' }} />
              <Typography sx={{ fontSize: { xs: '0.8rem', md: '0.9rem' }, fontWeight: 700, color: '#fff' }}>View Chart</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
