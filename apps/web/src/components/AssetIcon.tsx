'use client';

import { Box } from '@mui/material';

interface AssetIconProps {
  asset: string;
  size?: number;
}

export function AssetIcon({ asset, size = 20 }: AssetIconProps) {
  return (
    <Box
      component="img"
      src={`https://app.pacifica.fi/imgs/tokens/${asset}.svg`}
      alt={asset}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
      }}
    />
  );
}
