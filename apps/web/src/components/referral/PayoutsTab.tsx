'use client';

import { Box, Typography, Tooltip, Button } from '@mui/material';
import { InfoOutlined, OpenInNew } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { GAIN_COLOR } from '@/lib/constants';
import { USDC_DIVISOR, getExplorerTxUrl } from '@/lib/format';

const tooltipSlotProps = {
  tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } },
  arrow: { sx: { color: '#1a1f2e' } },
} as const;

export interface PayoutsTabProps {
  payouts: Array<{
    id: string;
    amount: string;
    txSignature: string | null;
    createdAt: string;
  }> | null;
}

export function PayoutsTab({ payouts }: PayoutsTabProps) {
  if (!payouts || payouts.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
        <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
          No payouts yet. Claim your earnings when balance reaches $1.
        </Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        borderRadius: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '3px',
        mb: 4,
      }}
    >
      {/* Header - desktop only */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '1fr 1fr 1fr',
          px: 2,
          py: 1,
          bgcolor: '#0D1219',
        }}
      >
        {[
          { label: 'Amount', tip: 'USDC paid out', align: 'flex-start' },
          { label: 'Transaction', tip: 'On-chain transaction signature', align: 'flex-start' },
          { label: 'Date', tip: 'When the payout was processed', align: 'flex-end' },
        ].map((h) => (
          <Box key={h.label} sx={{ display: 'flex', alignItems: 'center', justifyContent: h.align, gap: 0.4 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
              {h.label}
            </Typography>
            <Tooltip title={h.tip} arrow placement="top" slotProps={tooltipSlotProps}>
              <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
            </Tooltip>
          </Box>
        ))}
      </Box>

      {/* Rows */}
      <AnimatePresence mode="popLayout">
        {payouts.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
            layout
          >
            {/* Desktop row */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '1fr 1fr 1fr',
                alignItems: 'center',
                px: 2,
                py: 0,
                minHeight: 56,
                bgcolor: '#0D1219',
                transition: 'background 0.15s ease',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
              }}
            >
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                ${(Number(p.amount) / USDC_DIVISOR).toFixed(2)}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                {p.txSignature ? (
                  <Button
                    component="a"
                    href={getExplorerTxUrl(p.txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{
                      minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                      textTransform: 'none', gap: 0.5,
                      '&:hover': { color: '#FFFFFF' },
                    }}
                  >
                    Payout <OpenInNew sx={{ fontSize: 12 }} />
                  </Button>
                ) : (
                  <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.15)' }}>—</Typography>
                )}
              </Box>
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', textAlign: 'right' }}>
                {new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </Typography>
            </Box>

            {/* Mobile card */}
            <Box sx={{ display: { xs: 'block', md: 'none' }, bgcolor: '#0D1219', p: 2 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                  ${(Number(p.amount) / USDC_DIVISOR).toFixed(2)}
                </Typography>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 500, color: 'text.secondary' }}>
                  {new Date(p.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </Typography>
              </Box>
              {p.txSignature && (
                <Box sx={{ pt: 1.5 }}>
                  <Button
                    component="a"
                    href={getExplorerTxUrl(p.txSignature)}
                    target="_blank"
                    rel="noopener noreferrer"
                    size="small"
                    sx={{
                      minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', color: 'text.secondary',
                      textTransform: 'none', gap: 0.5,
                      '&:hover': { color: '#FFFFFF' },
                    }}
                  >
                    Payout <OpenInNew sx={{ fontSize: 12 }} />
                  </Button>
                </Box>
              )}
            </Box>
          </motion.div>
        ))}
      </AnimatePresence>
    </Box>
  );
}
