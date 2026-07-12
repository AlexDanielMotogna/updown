'use client';

import { useState } from 'react';
import { Dialog, Box, Typography, TextField, Button, IconButton } from '@mui/material';
import { EmojiEvents, Close, Telegram } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupWinningDto } from '@/lib/api';

export const WC_TELEGRAM_HANDLE = 'AlexDanielUpdown';
export const WC_TELEGRAM_URL = `https://t.me/${WC_TELEGRAM_HANDLE}`;

/**
 * Aggressive prize popup for World Cup raffle winners. Auto-opened by the parent
 * when the signed-in user has an unclaimed win. Two ways to collect: message us
 * on Telegram (primary), or drop a Solana address to be paid to.
 */
export function WinnerDialog({
  open,
  onClose,
  winnings,
  onClaim,
  claimingMatchId,
}: {
  open: boolean;
  onClose: () => void;
  winnings: WorldCupWinningDto[];
  onClaim: (matchId: string, wallet: string) => void;
  claimingMatchId: string | null;
}) {
  const t = useThemeTokens();
  const [edits, setEdits] = useState<Record<string, string>>({});

  const unclaimed = winnings.filter((w) => !w.claimed);
  const shown = unclaimed.length > 0 ? unclaimed : winnings;
  if (shown.length === 0) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 3,
          border: `1.5px solid ${withAlpha(WC_NEON_GREEN, 0.6)}`,
          backgroundImage: `linear-gradient(180deg, ${withAlpha(WC_NEON_GREEN, 0.16)} 0%, ${t.bg.surface} 55%)`,
          bgcolor: t.bg.surface,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ position: 'relative', p: { xs: 2.5, md: 3 } }}>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 8, right: 8, color: t.text.tertiary }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>

        {/* Trophy + headline */}
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              bgcolor: withAlpha(WC_NEON_GREEN, 0.18), border: `1px solid ${withAlpha(WC_NEON_GREEN, 0.5)}`, mb: 1.25,
            }}
          >
            <EmojiEvents sx={{ fontSize: 30, color: WC_NEON_GREEN }} />
          </Box>
          <Typography sx={{ fontWeight: 900, fontSize: '1.5rem', letterSpacing: '-0.02em', color: t.text.primary }}>
            You won! 🎉
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: t.text.secondary, mt: 0.5 }}>
            {shown.map((w) => (w.homeTeam && w.awayTeam ? `${w.homeTeam} vs ${w.awayTeam}` : 'your match')).join(', ')}
            {' '}— you nailed the score. Time to collect your prize.
          </Typography>
        </Box>

        {/* Primary: Telegram */}
        <Button
          fullWidth
          variant="contained"
          startIcon={<Telegram />}
          href={WC_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            mb: 1, py: 1.1, fontWeight: 800, fontSize: '0.9rem', textTransform: 'none',
            bgcolor: '#229ED9', color: '#fff', '&:hover': { bgcolor: '#229ED9', filter: 'brightness(1.08)' },
          }}
        >
          Message us on Telegram
        </Button>
        <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center', mb: 2 }}>
          Contact @{WC_TELEGRAM_HANDLE} to arrange your prize.
        </Typography>

        {/* Secondary: wallet claim */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.25 }}>
          <Box sx={{ flex: 1, height: '1px', bgcolor: t.border.subtle }} />
          <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, fontWeight: 700, letterSpacing: '0.05em' }}>OR</Typography>
          <Box sx={{ flex: 1, height: '1px', bgcolor: t.border.subtle }} />
        </Box>

        {shown.map((w) => {
          const value = edits[w.matchId] ?? w.payoutWallet ?? '';
          const busy = claimingMatchId === w.matchId;
          const valid = value.trim().length >= 32 && value.trim().length <= 50;
          return (
            <Box key={w.matchId} sx={{ mb: 1 }}>
              <Typography sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 0.75, textAlign: 'center' }}>
                {w.claimed ? 'We got your address. You can update it below until we pay.' : 'Drop your Solana address to get paid directly.'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, flexDirection: { xs: 'column', sm: 'row' } }}>
                <TextField
                  value={value}
                  onChange={(e) => setEdits((s) => ({ ...s, [w.matchId]: e.target.value }))}
                  placeholder="Your Solana address"
                  size="small"
                  fullWidth
                  spellCheck={false}
                  sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.78rem', fontFamily: 'monospace', bgcolor: withAlpha('#000', 0.25) } }}
                />
                <Button
                  variant="contained"
                  disabled={busy || !valid}
                  onClick={() => onClaim(w.matchId, value.trim())}
                  sx={{
                    flexShrink: 0, bgcolor: WC_NEON_GREEN, color: '#08130b', fontWeight: 800, textTransform: 'none',
                    '&:hover': { bgcolor: WC_NEON_GREEN, filter: 'brightness(1.08)' },
                    '&.Mui-disabled': { bgcolor: withAlpha(WC_NEON_GREEN, 0.3), color: withAlpha('#08130b', 0.5) },
                  }}
                >
                  {busy ? 'Saving...' : w.claimed ? 'Update' : 'Claim'}
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}
