'use client';

import Avatar from '@mui/material/Avatar';
import { Box, Typography, Tooltip, Button } from '@mui/material';
import { InfoOutlined, OpenInNew } from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { getAvatarUrl, GAIN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { USDC_DIVISOR, getExplorerTxUrl } from '@/lib/format';

const tooltipSlotProps = {
  tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } },
  arrow: { sx: { color: '#1a1f2e' } },
} as const;

export interface EarningsTabProps {
  earnings: Array<{
    id: string;
    referredWallet: string;
    createdAt: string;
    commissionAmount: string;
    paid: boolean;
    paidTx: string | null;
  }> | null;
}

export function EarningsTab({ earnings }: EarningsTabProps) {
  if (!earnings || earnings.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, px: 4 }}>
        <Typography color="text.secondary" sx={{ fontSize: '1rem' }}>
          No earnings yet. Commissions appear when your referrals place bets.
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
          gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 0.8fr',
          px: 2,
          py: 1,
          bgcolor: '#0D1219',
        }}
      >
        {[
          { label: 'From', tip: 'Wallet of the referred user who generated this commission', align: 'flex-start' },
          { label: 'Date', tip: 'When the commission was earned', align: 'flex-start' },
          { label: 'Commission', tip: '1% of the bet amount', align: 'flex-start' },
          { label: 'Status', tip: 'Whether the commission has been paid out', align: 'flex-start' },
          { label: 'Tx', tip: 'Payout transaction on Solana Explorer', align: 'flex-end' },
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
        {earnings.map((e, i) => (
          <motion.div
            key={e.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02, type: 'spring', stiffness: 300, damping: 30 }}
            layout
          >
            {/* Desktop row */}
            <Box
              sx={{
                display: { xs: 'none', md: 'grid' },
                gridTemplateColumns: '2fr 1.5fr 1fr 0.8fr 0.8fr',
                alignItems: 'center',
                px: 2,
                py: 0,
                minHeight: 56,
                bgcolor: '#0D1219',
                transition: 'background 0.15s ease',
                '&:hover': { background: 'rgba(255,255,255,0.04)' },
              }}
            >
              {/* From */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                <Avatar
                  src={getAvatarUrl(e.referredWallet)}
                  alt={e.referredWallet}
                  sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.referredWallet.slice(0, 4)}...{e.referredWallet.slice(-4)}
                </Typography>
              </Box>

              {/* Date */}
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
              </Typography>

              {/* Commission */}
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                ${(Number(e.commissionAmount) / USDC_DIVISOR).toFixed(2)}
              </Typography>

              {/* Status */}
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 20,
                  px: 1,
                  borderRadius: '2px',
                  bgcolor: e.paid ? `${GAIN_COLOR}18` : `${ACCENT_COLOR}18`,
                  width: 'fit-content',
                }}
              >
                <Typography sx={{ fontSize: '0.6rem', fontWeight: 600, color: e.paid ? GAIN_COLOR : ACCENT_COLOR }}>
                  {e.paid ? 'PAID' : 'PENDING'}
                </Typography>
              </Box>

              {/* Tx */}
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 0.75 }}>
                {e.paidTx ? (
                  <Button
                    component="a"
                    href={getExplorerTxUrl(e.paidTx)}
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
            </Box>

            {/* Mobile card */}
            <Box
              sx={{
                display: { xs: 'block', md: 'none' },
                bgcolor: '#0D1219',
                p: 2,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1.5, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <Avatar
                  src={getAvatarUrl(e.referredWallet)}
                  alt={e.referredWallet}
                  sx={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}
                />
                <Typography
                  sx={{
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: '#fff',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {e.referredWallet.slice(0, 6)}...{e.referredWallet.slice(-4)}
                </Typography>
                <Box
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 20,
                    px: 1,
                    borderRadius: '2px',
                    bgcolor: e.paid ? `${GAIN_COLOR}18` : `${ACCENT_COLOR}18`,
                  }}
                >
                  <Typography sx={{ fontSize: '0.55rem', fontWeight: 600, color: e.paid ? GAIN_COLOR : ACCENT_COLOR }}>
                    {e.paid ? 'PAID' : 'PENDING'}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, pt: 1.5 }}>
                <Box>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 500, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(e.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                    Date
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right' }}>
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                    ${(Number(e.commissionAmount) / USDC_DIVISOR).toFixed(2)}
                  </Typography>
                  <Typography sx={{ fontSize: '0.6rem', color: 'text.secondary', textTransform: 'uppercase' }}>
                    Commission
                  </Typography>
                </Box>
              </Box>
              {e.paidTx && (
                <Box sx={{ pt: 1.5 }}>
                  <Button
                    component="a"
                    href={getExplorerTxUrl(e.paidTx)}
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
