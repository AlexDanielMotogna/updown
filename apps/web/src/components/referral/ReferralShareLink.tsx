'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { ContentCopy, CheckCircle, InfoOutlined } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

export interface ReferralShareLinkProps {
  referralUrl: string;
  copied: boolean;
  onCopy: () => void;
}

export function ReferralShareLink({ referralUrl, copied, onCopy }: ReferralShareLinkProps) {
  const t = useThemeTokens();
  const tooltipSlotProps = {
    tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } },
    arrow: { sx: { color: t.bg.tooltip } },
  } as const;
  return (
    <Box sx={{ bgcolor: t.bg.surfaceAlt }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            bgcolor: t.hover.light,
            borderRadius: 2,
            px: { xs: 1.5, md: 2.5 },
            py: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
            <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: t.text.tertiary, lineHeight: 1 }}>
              Your Referral Link
            </Typography>
            <Tooltip title="Share this link with friends. You earn 20% of platform fees from their bets" arrow placement="top" slotProps={tooltipSlotProps}>
              <InfoOutlined sx={{ fontSize: 12, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
            <Typography
              sx={{
                fontSize: { xs: '0.8rem', md: '0.85rem' },
                fontWeight: 600,
                color: t.text.primary,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {referralUrl || '...'}
            </Typography>
            <Box
              component="button"
              onClick={onCopy}
              sx={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                p: 0,
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
                color: copied ? t.gain : t.text.dimmed,
                '&:hover': { color: t.text.primary },
                transition: 'color 0.15s',
              }}
            >
              {copied ? <CheckCircle sx={{ fontSize: 13 }} /> : <ContentCopy sx={{ fontSize: 13 }} />}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
