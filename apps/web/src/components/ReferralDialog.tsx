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
import { GAIN_COLOR } from '@/lib/constants';

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
              bgcolor: `${GAIN_COLOR}18`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <PeopleOutline sx={{ fontSize: 28, color: GAIN_COLOR }} />
          </Box>
        </Box>
        <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
          You&apos;ve been invited!
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ textAlign: 'center', px: 4 }}>
        <Typography sx={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem', mb: 2 }}>
          Referred by{' '}
          <Box component="span" sx={{ color: '#fff', fontWeight: 600 }}>
            {referrerWallet}
          </Box>
        </Typography>
        <Typography sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem' }}>
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
            '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)' },
          }}
        >
          No thanks
        </Button>
        <Button
          variant="contained"
          onClick={onAccept}
          disabled={loading}
          sx={{
            bgcolor: GAIN_COLOR,
            color: '#000',
            fontWeight: 700,
            textTransform: 'none',
            fontSize: '0.8rem',
            borderRadius: '2px',
            px: 4,
            '&:hover': { bgcolor: GAIN_COLOR, filter: 'brightness(1.15)' },
            '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
          }}
        >
          {loading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : 'Accept'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
