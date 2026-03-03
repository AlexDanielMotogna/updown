'use client';

import { Box } from '@mui/material';

const LOCAL_COINS: Record<string, string> = {
  BTC: '/coins/btc-coin.png',
  ETH: '/coins/eth-coin.png',
  SOL: '/coins/sol-coin.png',
};

interface AssetIconProps {
  asset: string;
  size?: number;
}

export function AssetIcon({ asset, size = 28 }: AssetIconProps) {
  const src = LOCAL_COINS[asset.toUpperCase()] ?? `https://app.pacifica.fi/imgs/tokens/${asset}.svg`;

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
