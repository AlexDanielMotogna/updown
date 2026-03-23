'use client';

import { useState } from 'react';
import { Box, Typography, TextField, Button, CircularProgress } from '@mui/material';
import { DOWN_COLOR } from '@/lib/constants';
import { submitTournamentPrediction } from '@/lib/api';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { PREDICT_COLOR } from './tournament-utils';

export function PredictionInput({
  matchId,
  tournamentId,
  currentPrice,
  onSubmitted,
}: {
  matchId: string;
  tournamentId: string;
  currentPrice: string | null;
  onSubmitted: () => void;
}) {
  const { walletAddress } = useWalletBridge();
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!walletAddress || !price) return;
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) {
      setError('Enter a valid price');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitTournamentPrediction(tournamentId, matchId, walletAddress, num);
      if (res.success) {
        onSubmitted();
      } else {
        setError(res.error?.message || 'Failed to submit');
      }
    } catch {
      setError('Failed to submit prediction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ px: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Price prediction"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          inputProps={{ step: 'any', min: 0 }}
          sx={{
            flex: 1,
            '& .MuiInputBase-root': { height: 28, fontSize: '0.72rem', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '4px' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
            '& .MuiInputBase-input': { color: '#fff', py: 0.5, px: 1 },
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <Button
          size="small"
          variant="contained"
          disabled={submitting || !price}
          onClick={handleSubmit}
          sx={{
            minWidth: 0,
            px: 1.5,
            py: 0.5,
            height: 28,
            fontSize: '0.65rem',
            fontWeight: 700,
            bgcolor: PREDICT_COLOR,
            color: '#fff',
            textTransform: 'none',
            borderRadius: 0,
            '&:hover': { bgcolor: PREDICT_COLOR, filter: 'brightness(1.15)' },
            '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
          }}
        >
          {submitting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : 'Predict'}
        </Button>
      </Box>
      {currentPrice && !price && (
        <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>
          Current: ${Number(currentPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </Typography>
      )}
      {error && (
        <Typography sx={{ fontSize: '0.6rem', color: DOWN_COLOR }}>{error}</Typography>
      )}
    </Box>
  );
}
