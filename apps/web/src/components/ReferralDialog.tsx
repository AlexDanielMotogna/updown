'use client';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  CircularProgress,
} from '@mui/material';
import { PeopleOutline } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface ReferralDialogProps {
  open: boolean;
  referrerWallet: string;
  loading: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function ReferralDialog({
  open,
  referrerWallet,
  loading,
  onAccept,
  onDecline,
}: ReferralDialogProps) {
  const t = useThemeTokens();
  return (
    <Dialog
      open={open}
      onClose={onDecline}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle sx={{ textAlign: 'center', pt: 4, pb: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mb: 2 }}>
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              bgcolor: withAlpha(t.gain, 0.09),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PeopleOutline sx={{ fontSize: 28, color: t.gain }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: t.text.primary }}>
          You&apos;ve been invited!
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ textAlign: 'center', px: 4 }}>
        <Typography sx={{ color: t.text.bright, fontSize: '0.85rem', mb: 2 }}>
          Referred by{' '}
          <Box component="span" sx={{ color: t.text.primary, fontWeight: 600 }}>
            {referrerWallet}
          </Box>
        </Typography>
        <Typography sx={{ color: t.text.tertiary, fontSize: '0.8rem' }}>
          Your referrer earns a small commission from platform fees at no extra cost to you.
        </Typography>
      </DialogContent>

      <DialogActions sx={{ justifyContent: 'center', gap: 1.5, px: 4, pb: 4 }}>
        <Button
          onClick={onDecline}
          disabled={loading}
          sx={{
            color: 'text.secondary',
            textTransform: 'none',
            fontWeight: 600,
            fontSize: '0.8rem',
            borderRadius: '2px',
            px: 3,
            '&:hover': { color: t.text.primary, bgcolor: t.border.subtle },
          }}
        >
          No thanks
        </Button>
        <Button
          variant="contained"
          onClick={onAccept}
          disabled={loading}
          sx={{
            bgcolor: t.gain,
            color: t.text.contrast,
            fontWeight: 700,
            textTransform: 'none',
            fontSize: '0.8rem',
            borderRadius: '2px',
            px: 4,
            '&:hover': { bgcolor: t.gain, filter: 'brightness(1.15)' },
            '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
          }}
        >
          {loading ? <CircularProgress size={18} sx={{ color: t.text.contrast }} /> : 'Accept'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
