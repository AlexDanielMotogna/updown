'use client';

import { Box, Typography, Button } from '@mui/material';
import { EmojiEventsOutlined } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupWinningDto } from '@/lib/api';

/**
 * Slim, persistent prize reminder shown once the winner closes the popup. Clicking
 * it reopens the full claim dialog (Telegram + wallet). Stays until the prize is
 * paid, so an unclaimed win never gets lost.
 */
export function WinnerBanner({
  winnings,
  onOpen,
}: {
  winnings: WorldCupWinningDto[];
  onOpen: () => void;
}) {
  const t = useThemeTokens();
  if (winnings.length === 0) return null;

  const anyUnclaimed = winnings.some((w) => !w.claimed);

  return (
    <Box
      onClick={onOpen}
      sx={{
        display: 'flex', alignItems: 'center', gap: 1.25, cursor: 'pointer',
        borderRadius: 2, px: 2, py: 1.25,
        border: `1px solid ${t.border.subtle}`,
        borderLeft: `3px solid ${WC_NEON_GREEN}`,
        bgcolor: withAlpha(WC_NEON_GREEN, 0.06),
        transition: 'background-color 0.15s',
        '&:hover': { bgcolor: withAlpha(WC_NEON_GREEN, 0.1) },
      }}
    >
      <EmojiEventsOutlined sx={{ fontSize: 20, color: WC_NEON_GREEN, flexShrink: 0 }} />
      <Typography sx={{ flex: 1, fontWeight: 600, fontSize: '0.85rem', color: t.text.primary }}>
        {anyUnclaimed
          ? `You won ${winnings.length > 1 ? `${winnings.length} prizes` : 'a prize'}. Claim your reward.`
          : 'Your prize claim is in. Tap to review.'}
      </Typography>
      <Button
        variant="contained"
        size="small"
        disableElevation
        onClick={(e) => { e.stopPropagation(); onOpen(); }}
        sx={{
          flexShrink: 0, bgcolor: WC_NEON_GREEN, color: '#08130b', fontWeight: 700, textTransform: 'none', borderRadius: 1.5,
          '&:hover': { bgcolor: WC_NEON_GREEN, filter: 'brightness(1.06)' },
        }}
      >
        {anyUnclaimed ? 'Claim' : 'Review'}
      </Button>
    </Box>
  );
}
