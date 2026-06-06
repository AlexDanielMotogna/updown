'use client';

import { Box } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';

/** UP coin icon. Picks the nearest asset (16/32/48px) for crisp rendering. */
export function UpIcon({ size = 16, sx }: { size?: number; sx?: SxProps<Theme> }) {
  const file = size <= 16 ? 'Token_16px_Gold.png' : size <= 32 ? 'Token_32px_Gold.png' : 'Token_48px_Gold.png';
  return (
    <Box
      component="img"
      src={`/token/${file}`}
      alt="UP"
      sx={{ width: size, height: size, display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...sx }}
    />
  );
}
