'use client';

import { useState } from 'react';
import { Box, Typography, TextField, Button } from '@mui/material';
import { EmojiEvents } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupWinningDto } from '@/lib/api';

/**
 * In-app prize banner for World Cup raffle winners. Shows one card per win with a
 * field to enter the Solana address the prize should be paid to. Claimed wins
 * stay editable (the winner can fix a wrong address) until the prize is paid out.
 */
export function WinnerBanner({
  winnings,
  onClaim,
  claimingMatchId,
}: {
  winnings: WorldCupWinningDto[];
  onClaim: (matchId: string, wallet: string) => void;
  claimingMatchId: string | null;
}) {
  const t = useThemeTokens();
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (winnings.length === 0) return null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {winnings.map((w) => {
        const label = w.homeTeam && w.awayTeam ? `${w.homeTeam} vs ${w.awayTeam}` : 'your match';
        const value = edits[w.matchId] ?? w.payoutWallet ?? '';
        const busy = claimingMatchId === w.matchId;
        const valid = value.trim().length >= 32 && value.trim().length <= 50;

        return (
          <Box
            key={w.matchId}
            sx={{
              borderRadius: 2,
              p: { xs: 1.75, md: 2.25 },
              border: `1px solid ${withAlpha(WC_NEON_GREEN, 0.5)}`,
              background: `linear-gradient(180deg, ${withAlpha(WC_NEON_GREEN, 0.14)} 0%, ${withAlpha(WC_NEON_GREEN, 0.04)} 100%)`,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
              <EmojiEvents sx={{ fontSize: 20, color: WC_NEON_GREEN }} />
              <Typography sx={{ fontWeight: 800, fontSize: '0.95rem', color: t.text.primary }}>
                You won! {label}
                {w.round ? ` · ${w.round}` : ''}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: '0.8rem', color: t.text.secondary, mb: 1.25 }}>
              {w.claimed
                ? 'Your claim is in. We will send your prize to the wallet below. You can update it until it is paid.'
                : 'Congrats! Enter your Solana wallet address to receive your prize.'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
              <TextField
                value={value}
                onChange={(e) => setEdits((s) => ({ ...s, [w.matchId]: e.target.value }))}
                placeholder="Your Solana address"
                size="small"
                fullWidth
                spellCheck={false}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    fontSize: '0.8rem',
                    fontFamily: 'monospace',
                    bgcolor: withAlpha('#000', 0.25),
                  },
                }}
              />
              <Button
                variant="contained"
                disabled={busy || !valid}
                onClick={() => onClaim(w.matchId, value.trim())}
                sx={{
                  flexShrink: 0,
                  bgcolor: WC_NEON_GREEN,
                  color: '#08130b',
                  fontWeight: 800,
                  '&:hover': { bgcolor: WC_NEON_GREEN, filter: 'brightness(1.08)' },
                  '&.Mui-disabled': { bgcolor: withAlpha(WC_NEON_GREEN, 0.3), color: withAlpha('#08130b', 0.5) },
                }}
              >
                {busy ? 'Saving...' : w.claimed ? 'Update' : 'Claim prize'}
              </Button>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
