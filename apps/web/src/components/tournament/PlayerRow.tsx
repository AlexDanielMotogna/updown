'use client';

import { Box, Typography, Avatar } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, getAvatarUrl } from '@/lib/constants';
import { truncate, formatPrice } from './tournament-utils';

export function PlayerRow({
  wallet,
  prediction,
  distance,
  isWinner,
  isLoser,
  isPending,
}: {
  wallet: string | null;
  prediction: string | null;
  distance: string | null;
  isWinner: boolean;
  isLoser: boolean;
  isPending: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        height: 40,
        position: 'relative',
        bgcolor: isWinner ? `${UP_COLOR}08` : 'transparent',
        opacity: isLoser ? 0.35 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Win indicator bar */}
      {isWinner && (
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: UP_COLOR }} />
      )}

      {/* Avatar */}
      {wallet ? (
        <Avatar
          src={getAvatarUrl(wallet)}
          sx={{ width: 22, height: 22, flexShrink: 0 }}
        />
      ) : (
        <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
      )}

      {/* Wallet address */}
      <Typography
        sx={{
          flex: 1,
          fontSize: '0.8rem',
          fontWeight: isWinner ? 700 : 500,
          color: isWinner ? '#fff' : wallet ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)',
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {truncate(wallet)}
      </Typography>

      {/* Prediction + distance */}
      {prediction ? (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {formatPrice(prediction)}
          </Typography>
          {distance && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isWinner ? UP_COLOR : DOWN_COLOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {distance}
            </Typography>
          )}
        </Box>
      ) : isPending && wallet ? (
        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
          --
        </Typography>
      ) : null}
    </Box>
  );
}
