'use client';

import { Box, Typography } from '@mui/material';

/**
 * Crypto Predictions event page. Placeholder scaffold (P0) — the real 3-column
 * layout (weekly leaderboard · pool cards + TradingView charts · info banners) and
 * navbar (PNL, balance, wallet, profile) land in P2/P3.
 * See docs/PLAN-CRYPTO-PREDICTIONS.md.
 */
export default function CryptoPredictionsPage() {
  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#05080b', color: '#e8ecef', flexDirection: 'column', gap: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: '1.4rem' }}>Crypto Predictions</Typography>
      <Typography sx={{ color: '#8a938e', fontSize: '0.9rem' }}>Coming together — event page under construction.</Typography>
    </Box>
  );
}
