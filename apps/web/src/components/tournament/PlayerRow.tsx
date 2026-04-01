'use client';

import { Box, Typography, Avatar } from '@mui/material';
import { getAvatarUrl } from '@/lib/constants';
import { truncate, formatPrice, formatScore } from './tournament-utils';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

export function PlayerRow({
  wallet,
  prediction,
  distance,
  isWinner,
  isLoser,
  isPending,
  isSports,
  score,
  fixtureCount,
  isMe,
}: {
  wallet: string | null;
  prediction: string | null;
  distance: string | null;
  isWinner: boolean;
  isLoser: boolean;
  isPending: boolean;
  isSports?: boolean;
  score?: number | null;
  fixtureCount?: number;
  isMe?: boolean;
}) {
  const t = useThemeTokens();

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
        bgcolor: isWinner ? withAlpha(t.up, 0.03) : isMe ? withAlpha(t.predict, 0.06) : 'transparent',
        opacity: isLoser ? 0.35 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Win indicator bar */}
      {isWinner && (
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: t.up }} />
      )}
      {/* "You" indicator bar */}
      {isMe && !isWinner && (
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: t.accent }} />
      )}

      {/* Avatar */}
      {wallet ? (
        <Avatar
          src={getAvatarUrl(wallet)}
          sx={{ width: 22, height: 22, flexShrink: 0, border: isMe ? `2px solid ${t.accent}` : 'none' }}
        />
      ) : (
        <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: t.hover.default, flexShrink: 0 }} />
      )}

      {/* Wallet address */}
      <Typography
        sx={{
          flex: 1,
          fontSize: '0.8rem',
          fontWeight: isWinner || isMe ? 700 : 500,
          color: isMe ? t.accent : isWinner ? t.text.primary : wallet ? t.text.vivid : t.border.emphasis,
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {isMe ? 'You' : truncate(wallet)}
      </Typography>

      {/* Prediction + distance/score */}
      {prediction ? (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.primary, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {isSports ? formatScore(score, fixtureCount || 0) : formatPrice(prediction)}
          </Typography>
          {distance && !isSports && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isWinner ? t.up : t.down, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {distance}
            </Typography>
          )}
        </Box>
      ) : isPending && wallet ? (
        <Typography sx={{ fontSize: '0.7rem', color: t.text.muted, flexShrink: 0 }}>
          --
        </Typography>
      ) : null}
    </Box>
  );
}
