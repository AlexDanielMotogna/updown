'use client';

import { Box, Typography, Grid } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

interface OddsDisplayProps {
  oddsUp: string;
  oddsDown: string;
}

export function OddsDisplay({ oddsUp, oddsDown }: OddsDisplayProps) {
  const t = useThemeTokens();
  return (
    <Box sx={{ mb: 4 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        CURRENT ODDS
      </Typography>
      <Grid container spacing={2}>
        <Grid item xs={6}>
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 0,
              background: t.hover.default,
              border: 'none',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: t.text.secondary, fontSize: '0.65rem' }}
            >
              UP MULTIPLIER
            </Typography>
            <Typography
              variant="h3"
              sx={{ color: t.up, fontWeight: 300, mt: 0.5, fontSize: { xs: '1.75rem', md: undefined } }}
            >
              {oddsUp}x
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 0,
              background: t.hover.default,
              border: 'none',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: t.text.secondary, fontSize: '0.65rem' }}
            >
              DOWN MULTIPLIER
            </Typography>
            <Typography
              variant="h3"
              sx={{ color: t.down, fontWeight: 300, mt: 0.5, fontSize: { xs: '1.75rem', md: undefined } }}
            >
              {oddsDown}x
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
