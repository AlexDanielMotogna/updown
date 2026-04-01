'use client';

import { Box, Typography } from '@mui/material';
import { PeopleOutline } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface ReferralBannerProps {
  referrerWallet: string;
}

export function ReferralBanner({ referrerWallet }: ReferralBannerProps) {
  const t = useThemeTokens();
  return (
    <Box
      sx={{
        bgcolor: withAlpha(t.gain, 0.03),
        borderBottom: `1px solid ${withAlpha(t.gain, 0.13)}`,
        px: { xs: 1.5, md: 3 },
        py: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 0.75,
      }}
    >
      <PeopleOutline sx={{ fontSize: 14, color: t.gain }} />
      <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.8rem' }, color: t.text.strong }}>
        Invited by{' '}
        <Box component="span" sx={{ color: t.text.primary, fontWeight: 600 }}>
          {referrerWallet}
        </Box>
        {' '}— connect wallet to accept
      </Typography>
    </Box>
  );
}
