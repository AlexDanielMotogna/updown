'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { ContentCopy, CheckCircle, InfoOutlined } from '@mui/icons-material';
import { GAIN_COLOR } from '@/lib/constants';

const tooltipSlotProps = {
  tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } },
  arrow: { sx: { color: '#1a1f2e' } },
} as const;

export interface ReferralShareLinkProps {
  referralUrl: string;
  copied: boolean;
  onCopy: () => void;
}

export function ReferralShareLink({ referralUrl, copied, onCopy }: ReferralShareLinkProps) {
  return (
    <Box sx={{ bgcolor: '#0D1219' }}>
      <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
        <Box
          sx={{
            bgcolor: 'rgba(255,255,255,0.03)',
            borderRadius: 2,
            px: { xs: 1.5, md: 2.5 },
            py: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.25, minHeight: 12 }}>
            <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', lineHeight: 1 }}>
              Your Referral Link
            </Typography>
            <Tooltip title="Share this link with friends. You earn 20% of platform fees from their bets" arrow placement="top" slotProps={tooltipSlotProps}>
              <InfoOutlined sx={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
            </Tooltip>
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.5 }}>
            <Typography
              sx={{
                fontSize: { xs: '0.8rem', md: '0.85rem' },
                fontWeight: 600,
                color: '#fff',
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
                color: copied ? GAIN_COLOR : 'rgba(255,255,255,0.3)',
                '&:hover': { color: '#fff' },
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
