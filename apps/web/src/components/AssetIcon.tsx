'use client';

import { Box } from '@mui/material';

interface AssetIconProps {
  asset: string;
  size?: number;
}

export function AssetIcon({ asset, size = 28 }: AssetIconProps) {
  const src = `https://app.pacifica.fi/imgs/tokens/${asset}.svg`;

  return (
    <Box
      component="img"
      src={src}
      alt={asset}
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        objectFit: 'cover',
      }}
    />
  );
}
