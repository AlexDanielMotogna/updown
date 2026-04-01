'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AnimatedValue } from '../AnimatedValue';

export interface PayoutPreviewProps {
  amountNum: number;
  potentialOdds: number;
  potentialPayout: number;
  estimatedCoins: number;
  sideColor: string;
}

export function PayoutPreview({
  amountNum,
  potentialOdds,
  potentialPayout,
  estimatedCoins,
  sideColor,
}: PayoutPreviewProps) {
  const t = useThemeTokens();

  const tooltipSlotProps = {
    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } },
    arrow: { sx: { color: t.bg.tooltip } },
  };

  const infoIconSx = {
    fontSize: 11,
    color: t.text.muted,
    cursor: 'help' as const,
    '&:hover': { color: t.text.secondary },
    transition: 'color 0.15s',
  };

  return (
    <AnimatePresence>
      {amountNum > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          style={{ overflow: 'hidden' }}
        >
          <Box
            sx={{
              px: 1.5,
              py: 1,
              mb: 1.5,
              borderRadius: 0,
              background: t.bg.surfaceAlt,
              borderTop: `1px solid ${withAlpha(t.gain, 0.19)}`,
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Stake</Typography>
                <Tooltip title="USDC amount you are placing on this prediction" arrow placement="left" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={infoIconSx} />
                </Tooltip>
              </Box>
              <Typography sx={{ fontWeight: 400, fontSize: '0.75rem' }}>
                ${amountNum.toFixed(2)}
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Odds</Typography>
                <Tooltip title="Current payout multiplier. Changes in real-time as other players bet" arrow placement="left" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={infoIconSx} />
                </Tooltip>
              </Box>
              <Typography sx={{ color: sideColor, fontWeight: 500, fontSize: '0.75rem' }}>
                <AnimatedValue value={potentialOdds} suffix="x" duration={0.4} />
              </Typography>
            </Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Payout</Typography>
                <Tooltip title="Estimated USDC you receive if your side wins (before fees)" arrow placement="left" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={infoIconSx} />
                </Tooltip>
              </Box>
              <Typography sx={{ fontWeight: 600, color: t.gain, fontSize: '0.75rem' }}>
                <AnimatedValue value={potentialPayout} prefix="$" suffix=" USDC" duration={0.4} />
              </Typography>
            </Box>
            {estimatedCoins > 0 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.5 }}>
                <Typography sx={{ color: t.accent, fontWeight: 500, fontSize: '0.65rem' }}>
                  +~{estimatedCoins.toFixed(2)} UP
                </Typography>
                <Tooltip title="Estimated UP Coins earned when you claim a winning bet. Multiplied by your level" arrow placement="right" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={infoIconSx} />
                </Tooltip>
              </Box>
            )}
          </Box>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
