'use client';

import { Box, Typography, Dialog, CircularProgress } from '@mui/material';
import { CheckCircle, ErrorOutline } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
export type FundStatus = 'funding' | 'funded' | 'error';

/**
 * First-load welcome + auto-fund feedback for the Crypto Predictions event.
 * The mint takes a couple of seconds and used to happen silently; this makes
 * it visible: a spinner while crediting, then a confirmation of the test USDC.
 */
export function WelcomeFundModal({ open, status, amount = 1000, onClose, onRetry }: {
  open: boolean;
  status: FundStatus;
  amount?: number;
  onClose: () => void;
  onRetry?: () => void;
}) {
  const t = useThemeTokens();
  const amountStr = amount.toLocaleString();

  return (
    <Dialog
      open={open}
      onClose={status === 'funded' ? onClose : undefined}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${CYAN}33`, overflow: 'hidden' } }}
    >
      <Box sx={{ p: 3, textAlign: 'center' }}>
        {status === 'funding' && (
          <>
            <CircularProgress size={40} sx={{ color: CYAN, mb: 2 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: t.text.primary, mb: 0.75 }}>Setting up your account</Typography>
            <Typography sx={{ fontSize: '0.85rem', color: t.text.secondary, lineHeight: 1.5 }}>
              Crediting <b style={{ color: CYAN }}>{amountStr} test USDC</b> (plus a little SOL for fees) so you can start predicting. This takes a few seconds.
            </Typography>
          </>
        )}

        {status === 'funded' && (
          <>
            <Box sx={{ display: 'flex', justifyContent: 'center', mb: 1.5 }}>
              <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Box component="img" src="/token/Token_16px_Gold.png" alt="" sx={{ width: 44, height: 44 }} />
                <CheckCircle sx={{ position: 'absolute', bottom: -2, right: -6, fontSize: 20, color: t.gain, bgcolor: t.bg.surface, borderRadius: '50%' }} />
              </Box>
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', color: t.text.primary, mb: 0.5 }}>You&apos;re in!</Typography>
            <Typography sx={{ fontSize: '1.4rem', fontWeight: 900, color: CYAN, mb: 0.75, fontVariantNumeric: 'tabular-nums' }}>+{amountStr} test USDC</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: t.text.secondary, lineHeight: 1.5, mb: 2.5 }}>
              Added to your wallet to start predicting. This is a free testnet event with play money, not real funds.
            </Typography>
            <Box component="button" onClick={onClose} sx={{ width: '100%', py: 1.25, borderRadius: 1, border: 'none', cursor: 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.03em', '&:hover': { filter: 'brightness(1.05)' } }}>
              START PREDICTING
            </Box>
          </>
        )}

        {status === 'error' && (
          <>
            <ErrorOutline sx={{ fontSize: 42, color: t.error, mb: 1.5 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '1.1rem', color: t.text.primary, mb: 0.75 }}>Couldn&apos;t fund your account</Typography>
            <Typography sx={{ fontSize: '0.82rem', color: t.text.secondary, lineHeight: 1.5, mb: 2.5 }}>
              Something went wrong crediting your test USDC. You can retry, or just reload the page.
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Box component="button" onClick={onClose} sx={{ flex: 1, py: 1.1, borderRadius: 1, border: `1px solid ${t.border.medium}`, cursor: 'pointer', bgcolor: 'transparent', color: t.text.secondary, fontWeight: 700, fontSize: '0.85rem' }}>
                Close
              </Box>
              {onRetry && (
                <Box component="button" onClick={onRetry} sx={{ flex: 1, py: 1.1, borderRadius: 1, border: 'none', cursor: 'pointer', bgcolor: CYAN, color: '#04121a', fontWeight: 800, fontSize: '0.85rem' }}>
                  Retry
                </Box>
              )}
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}
