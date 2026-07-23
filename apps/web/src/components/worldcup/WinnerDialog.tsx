'use client';

import { useState } from 'react';
import { Dialog, Box, Typography, TextField, Button, IconButton } from '@mui/material';
import { EmojiEventsOutlined, Close, Telegram } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { WC_NEON_GREEN } from '@/lib/worldcup';
import type { WorldCupWinningDto } from '@/lib/api';

export const WC_TELEGRAM_HANDLE = 'updown_official';
export const WC_TELEGRAM_URL = 'https://t.me/updown_official';
export const WC_X_HANDLE = 'Official_UpDown';
export const WC_X_URL = 'https://x.com/Official_UpDown';

function XLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

/**
 * Prize dialog for World Cup raffle winners. Auto-opened by the parent when the
 * signed-in user has an unclaimed win. Two ways to collect: message us on
 * Telegram (primary), or provide a Solana address to be paid to.
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

  const matchLabels = shown.map((w) => (w.homeTeam && w.awayTeam ? `${w.homeTeam} vs ${w.awayTeam}` : 'your match'));
  const roundLabel = shown[0]?.round ?? null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          bgcolor: t.bg.surface,
          border: `1px solid ${t.border.subtle}`,
          borderTop: `3px solid ${WC_NEON_GREEN}`,
          overflow: 'hidden',
        },
      }}
    >
      <Box sx={{ position: 'relative', p: { xs: 3, md: 3.5 } }}>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ position: 'absolute', top: 10, right: 10, color: t.text.tertiary }}
        >
          <Close sx={{ fontSize: 18 }} />
        </IconButton>

        {/* Header */}
        <Box
          sx={{
            width: 44, height: 44, borderRadius: 1.5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            bgcolor: withAlpha(WC_NEON_GREEN, 0.12), border: `1px solid ${withAlpha(WC_NEON_GREEN, 0.35)}`, mb: 2,
          }}
        >
          <EmojiEventsOutlined sx={{ fontSize: 24, color: WC_NEON_GREEN }} />
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '1.3rem', letterSpacing: '-0.01em', color: t.text.primary }}>
          You won a prize
        </Typography>
        <Typography sx={{ fontSize: '0.85rem', color: t.text.secondary, mt: 0.75, lineHeight: 1.5 }}>
          You correctly predicted {matchLabels.join(', ')}
          {roundLabel ? ` (${roundLabel})` : ''}. Choose how you would like to receive your reward.
        </Typography>

        {/* Primary: Telegram */}
        <Button
          fullWidth
          variant="contained"
          disableElevation
          startIcon={<Telegram />}
          href={WC_TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            mt: 2.5, mb: 1, py: 1.1, fontWeight: 700, fontSize: '0.9rem', textTransform: 'none', borderRadius: 1.5,
            bgcolor: '#229ED9', color: '#fff', '&:hover': { bgcolor: '#1c8ec2' },
          }}
        >
          Contact us on Telegram
        </Button>
        {/* Secondary: X */}
        <Button
          fullWidth
          variant="outlined"
          startIcon={<XLogo />}
          href={WC_X_URL}
          target="_blank"
          rel="noopener noreferrer"
          sx={{
            py: 0.9, fontWeight: 600, fontSize: '0.85rem', textTransform: 'none', borderRadius: 1.5,
            color: t.text.primary, borderColor: t.border.subtle,
            '&:hover': { borderColor: t.text.tertiary, bgcolor: t.hover.light },
          }}
        >
          Follow us on X
        </Button>
        <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary, textAlign: 'center', mt: 1 }}>
          Message @{WC_TELEGRAM_HANDLE} on Telegram to arrange your payout.
        </Typography>

        {/* Divider */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, my: 2.25 }}>
          <Box sx={{ flex: 1, height: '1px', bgcolor: t.border.subtle }} />
          <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, fontWeight: 600, letterSpacing: '0.08em' }}>OR</Typography>
          <Box sx={{ flex: 1, height: '1px', bgcolor: t.border.subtle }} />
        </Box>

        {/* Secondary: wallet */}
        {shown.map((w) => {
          const value = edits[w.matchId] ?? w.payoutWallet ?? '';
          const busy = claimingMatchId === w.matchId;
          const valid = value.trim().length >= 32 && value.trim().length <= 50;
          return (
            <Box key={w.matchId} sx={{ mb: 0.5 }}>
              <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.secondary, mb: 0.9 }}>
                {w.claimed ? 'Payout address (editable until paid)' : 'Get paid directly to a Solana address'}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1, alignItems: { xs: 'stretch', sm: 'center' }, flexDirection: { xs: 'column', sm: 'row' } }}>
                <TextField
                  value={value}
                  onChange={(e) => setEdits((s) => ({ ...s, [w.matchId]: e.target.value }))}
                  placeholder="Your Solana address"
                  size="small"
                  fullWidth
                  spellCheck={false}
                  sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.68rem', fontFamily: 'monospace', bgcolor: withAlpha('#000', 0.2), borderRadius: 1.5 } }}
                />
                <Button
                  variant="contained"
                  disableElevation
                  disabled={busy || !valid}
                  onClick={() => onClaim(w.matchId, value.trim())}
                  sx={{
                    flexShrink: 0, px: 2.5, height: 32, minHeight: 32, borderRadius: 1.5, textTransform: 'none', fontWeight: 700, fontSize: '0.8rem',
                    bgcolor: WC_NEON_GREEN, color: '#08130b', '&:hover': { bgcolor: WC_NEON_GREEN, filter: 'brightness(1.06)' },
                    '&.Mui-disabled': { bgcolor: withAlpha(WC_NEON_GREEN, 0.25), color: withAlpha('#08130b', 0.5) },
                  }}
                >
                  {busy ? 'Saving' : w.claimed ? 'Update' : 'Submit'}
                </Button>
              </Box>
            </Box>
          );
        })}
      </Box>
    </Dialog>
  );
}
