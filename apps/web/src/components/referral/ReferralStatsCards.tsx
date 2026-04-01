'use client';

import { Box, Typography, Tooltip, Button, CircularProgress } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

export interface ReferralStatsCardsProps {
  totalReferrals: number;
  totalEarned: number;
  unpaidBalance: number;
  canClaim: boolean;
  claiming: boolean;
  onClaim: () => void;
}

export function ReferralStatsCards({
  totalReferrals,
  totalEarned,
  unpaidBalance,
  canClaim,
  claiming,
  onClaim,
}: ReferralStatsCardsProps) {
  const t = useThemeTokens();
  const tooltipSlotProps = {
    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } },
    arrow: { sx: { color: t.bg.tooltip } },
  } as const;
  return (
    <Box sx={{ bgcolor: t.bg.surfaceAlt, border: t.surfaceBorder, boxShadow: t.surfaceShadow }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
            gap: 0.5,
          }}
        >
          {/* Total Referrals */}
          <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: t.text.tertiary, lineHeight: 1 }}>
                  Total Referrals
                </Typography>
                <Tooltip title="Users who accepted your referral link" arrow placement="top" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={{ fontSize: 12, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
              <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
                {totalReferrals}
              </Typography>
            </Box>
          </Box>

          {/* Total Earned */}
          <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: t.text.tertiary, lineHeight: 1 }}>
                  Total Earned
                </Typography>
                <Tooltip title="Total commissions earned from all referred users" arrow placement="top" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={{ fontSize: 12, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
              <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: t.gain, fontVariantNumeric: 'tabular-nums' }}>
                ${totalEarned.toFixed(2)}
              </Typography>
            </Box>
          </Box>

          {/* Unpaid Balance */}
          <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
            <Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
                <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: t.text.tertiary, lineHeight: 1 }}>
                  Unpaid Balance
                </Typography>
                <Tooltip title="Commissions available to claim. Minimum $1 USDC" arrow placement="top" slotProps={tooltipSlotProps}>
                  <InfoOutlined sx={{ fontSize: 12, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
                </Tooltip>
              </Box>
              <Typography sx={{ fontSize: { xs: '1.1rem', md: '1.3rem' }, fontWeight: 700, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
                ${unpaidBalance.toFixed(2)}
              </Typography>
            </Box>
          </Box>

          {/* Claim Button Card */}
          <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: { xs: 1.5, md: 2.5 }, py: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unpaidBalance > 0 ? (
              <Button
                variant="contained"
                onClick={onClaim}
                disabled={!canClaim || claiming}
                sx={{
                  bgcolor: canClaim ? t.gain : t.border.default,
                  color: canClaim ? '#000' : 'text.secondary',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  borderRadius: '2px',
                  textTransform: 'none',
                  px: 3,
                  py: 0.75,
                  width: '100%',
                  '&:hover': { bgcolor: canClaim ? t.gain : undefined, filter: canClaim ? 'brightness(1.15)' : undefined },
                  '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
                }}
              >
                {claiming ? (
                  <CircularProgress size={18} sx={{ color: t.text.contrast }} />
                ) : canClaim ? (
                  `Claim $${unpaidBalance.toFixed(2)}`
                ) : (
                  'Min $1.00'
                )}
              </Button>
            ) : (
              <Typography sx={{ fontSize: '0.8rem', color: t.text.muted, fontWeight: 500 }}>
                No balance
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
