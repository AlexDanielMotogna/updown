'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { formatUSDC, formatPrice, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';
import { AnimatedValue } from '@/components/AnimatedValue';
import { Countdown } from '@/components/Countdown';

interface PoolInfoCardsProps {
  livePrice: string | null;
  priceFlash: 'up' | 'down' | null;
  strikePrice: string | null;
  finalPrice: string | null;
  status: string;
  totalUp: string;
  totalDown: string;
  endTime?: string;
}

const INFO_TOOLTIPS: Record<string, string> = {
  'Live Price': 'Current market price from Pacifica, updated in real-time. The number next to it shows the difference from the strike price',
  'Result In': 'Time until the pool closes and the winner is determined',
  'Status': 'Current pool state in its lifecycle',
  'Strike Price': 'Price captured when the pool opened. Final price must beat this for UP to win',
  'Strike → Final': 'Opening price vs closing price. Higher = UP wins, lower = DOWN wins',
  'UP Pool': 'Total USDC staked by players predicting the price will go UP',
  'DOWN Pool': 'Total USDC staked by players predicting the price will go DOWN',
};

function InfoCard({ label, children }: { label: string; children: React.ReactNode }) {
  const tip = INFO_TOOLTIPS[label];
  return (
    <Box sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
      <Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
          <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
            {label}
          </Typography>
          {tip && (
            <Tooltip title={tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
              <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
            </Tooltip>
          )}
        </Box>
        {children}
      </Box>
    </Box>
  );
}

export function PoolInfoCards({ livePrice, priceFlash, strikePrice, finalPrice, status, totalUp, totalDown, endTime }: PoolInfoCardsProps) {
  const isResolved = status === 'RESOLVED' || status === 'CLAIMABLE';
  const wentUp = finalPrice && strikePrice ? Number(finalPrice) > Number(strikePrice) : null;
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
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>Live Price</Typography>
                {livePrice && strikePrice && (() => {
                  const delta = Number(livePrice) - Number(strikePrice) / USDC_DIVISOR;
                  const isUp = delta >= 0;
                  return (
                    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
                      <Box component="img" src={isUp ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png'} alt="" sx={{ width: 12, height: 12 }} />
                      <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.7rem' }, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: isUp ? UP_COLOR : DOWN_COLOR, lineHeight: 1 }}>
                        {Math.abs(delta).toFixed(2)}
                      </Typography>
                    </Box>
                  );
                })()}
                <Tooltip title={INFO_TOOLTIPS['Live Price']} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                  <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', ml: 'auto', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
              <Typography
                component="span"
                sx={{
                  fontSize: { xs: '1.1rem', md: '1.3rem' },
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: priceFlash === 'up' ? UP_COLOR : priceFlash === 'down' ? DOWN_COLOR : '#fff',
                  transition: 'color 0.15s ease',
                }}
              >
                {livePrice
                  ? <AnimatedValue value={Number(livePrice)} prefix="$" duration={0.4} />
                  : ''}
              </Typography>
            </Box>
          </Box>

          {/* Countdown */}
          {endTime && (status === 'JOINING' || status === 'ACTIVE') ? (
            <InfoCard label="Result In">
              <Countdown targetDate={endTime} compact compactFontSize={{ xs: '1.1rem', md: '1.3rem' }} />
            </InfoCard>
          ) : (
            <InfoCard label="Status">
              <Typography sx={{ fontSize: { xs: '0.85rem', md: '0.95rem' }, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                {status === 'RESOLVED' ? 'Resolved' : status === 'CLAIMABLE' ? 'Claimable' : status === 'UPCOMING' ? 'Soon' : 'Ended'}
              </Typography>
            </InfoCard>
          )}

          <InfoCard label={isResolved && finalPrice ? 'Strike → Final' : 'Strike Price'}>
            {isResolved && finalPrice ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.1rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>
                  {formatPrice(strikePrice)}
                </Typography>
                <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.1rem' }, color: 'text.secondary' }}>→</Typography>
                <Typography sx={{ fontSize: { xs: '0.95rem', md: '1.1rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: wentUp ? UP_COLOR : DOWN_COLOR }}>
                  {formatPrice(finalPrice)}
                </Typography>
              </Box>
            ) : (
              <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {strikePrice ? formatPrice(strikePrice) : ''}
              </Typography>
            )}
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

        </Box>
      </Box>
    </Box>
  );
}
