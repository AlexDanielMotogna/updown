'use client';

import { Box, Typography, Grid } from '@mui/material';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

interface OddsDisplayProps {
  oddsUp: string;
  oddsDown: string;
}

export function OddsDisplay({ oddsUp, oddsDown }: OddsDisplayProps) {
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
              borderRadius: 1,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.65rem' }}
            >
              UP MULTIPLIER
            </Typography>
            <Typography
              variant="h3"
              sx={{ color: UP_COLOR, fontWeight: 300, mt: 0.5, fontSize: { xs: '1.75rem', md: undefined } }}
            >
              {oddsUp}x
            </Typography>
          </Box>
        </Grid>
        <Grid item xs={6}>
          <Box
            sx={{
              p: { xs: 2, md: 3 },
              borderRadius: 1,
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
            }}
          >
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '0.65rem' }}
            >
              DOWN MULTIPLIER
            </Typography>
            <Typography
              variant="h3"
              sx={{ color: DOWN_COLOR, fontWeight: 300, mt: 0.5, fontSize: { xs: '1.75rem', md: undefined } }}
            >
              {oddsDown}x
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
}
