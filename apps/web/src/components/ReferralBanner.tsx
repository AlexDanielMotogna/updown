'use client';

import { Box, Typography } from '@mui/material';
import { PeopleOutline } from '@mui/icons-material';
import { GAIN_COLOR } from '@/lib/constants';

interface ReferralBannerProps {
  referrerWallet: string;
}

export function ReferralBanner({ referrerWallet }: ReferralBannerProps) {
  return (
    <Box
      sx={{
        bgcolor: `${GAIN_COLOR}08`,
        borderBottom: `1px solid ${GAIN_COLOR}20`,
        px: { xs: 1.5, md: 3 },
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
      }}
    >
      <PeopleOutline sx={{ fontSize: 14, color: GAIN_COLOR }} />
      <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, color: 'rgba(255,255,255,0.6)' }}>
        Invited by{' '}
        <Box component="span" sx={{ color: '#fff', fontWeight: 600 }}>
          {referrerWallet}
        </Box>
        {' '}— connect wallet to accept
      </Typography>
    </Box>
  );
}
