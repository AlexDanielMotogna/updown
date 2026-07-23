'use client';

import { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { ShieldOutlined, LocalFireDepartment } from '@mui/icons-material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { buyStreakSaver, type UserProfile } from '@/lib/api';

// Mirrors the server (services/streak-saver.ts): 20 UP each, hold up to 10.
const PRICE_UP = 20;
const MAX_SAVERS = 10;

interface Props {
  walletAddress: string;
  profile: UserProfile | null | undefined;
}

/**
 * Streak-saver store card. Buying one burns UP Coins; a saver then protects the
 * user's win streak the next time they lose a bet (consumed server-side in
 * resetStreak) instead of the streak resetting to 0. First UP-Coin SINK in the app.
 */
export function StreakSaverCard({ walletAddress, profile }: Props) {
  const t = useThemeTokens();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [justBought, setJustBought] = useState(false);

  const mutation = useMutation({
    mutationFn: buyStreakSaver,
    onSuccess: (res) => {
      if (res.success && res.data) {
        // Push the new balance/inventory into the profile cache immediately, then
        // refetch in the background for any derived fields.
        queryClient.setQueryData<{ success: boolean; data: UserProfile } | undefined>(
          ['userProfile', walletAddress],
          (old) =>
            old?.data
              ? { ...old, data: { ...old.data, streakSavers: res.data!.streakSavers, coinsBalance: res.data!.coinsBalance } }
              : old,
        );
        queryClient.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
        setError(null);
        setJustBought(true);
        setTimeout(() => setJustBought(false), 1500);
      } else {
        setError(res.error?.message ?? 'Could not buy streak-saver');
      }
    },
    onError: (err: Error) => setError(err.message || 'Could not buy streak-saver'),
  });

  if (!profile) return null;

  const coins = Number(profile.coinsBalance) / UP_COINS_DIVISOR;
  const savers = profile.streakSavers ?? 0;
  const streak = profile.stats.currentStreak;
  const atMax = savers >= MAX_SAVERS;
  const canAfford = coins >= PRICE_UP;
  const disabled = mutation.isPending || atMax || !canAfford;

  const handleBuy = () => {
    setError(null);
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${walletAddress}-${Date.now()}`;
    mutation.mutate({ walletAddress, quantity: 1, idempotencyKey });
  };

  const helper = atMax
    ? `You hold the maximum of ${MAX_SAVERS}.`
    : !canAfford
      ? `Need ${PRICE_UP} UP Coins (you have ${coins.toLocaleString(undefined, { maximumFractionDigits: 0 })}).`
      : streak > 0
        ? `Protects your ${streak}-win streak on your next loss.`
        : 'Protects your streak on a loss instead of resetting it.';

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        p: 2,
        mb: 4,
        borderRadius: 1.5,
        bgcolor: t.bg.surface,
        border: `1px solid ${t.border.subtle}`,
      }}
    >
      {/* Icon badge */}
      <Box
        sx={{
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: '50%',
          display: 'grid',
          placeItems: 'center',
          bgcolor: `${t.accent}1a`,
          color: t.accent,
        }}
      >
        <ShieldOutlined sx={{ fontSize: 22 }} />
      </Box>

      {/* Text */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary }}>
            Streak Savers
          </Typography>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.4,
              px: 0.75,
              py: 0.2,
              borderRadius: 1,
              bgcolor: t.hover.light,
            }}
          >
            <LocalFireDepartment sx={{ fontSize: 13, color: t.accent }} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, color: t.text.secondary }}>
              {savers} in stock
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: '0.72rem', color: error ? t.down : t.text.tertiary, mt: 0.3 }}>
          {error ?? (justBought ? 'Streak-saver added.' : helper)}
        </Typography>
      </Box>

      {/* Buy button */}
      <Button
        onClick={handleBuy}
        disabled={disabled}
        variant="contained"
        sx={{
          flexShrink: 0,
          backgroundColor: t.accent,
          color: t.text.contrast,
          fontWeight: 700,
          fontSize: '0.8rem',
          textTransform: 'none',
          borderRadius: '2px',
          px: 2,
          whiteSpace: 'nowrap',
          '&:hover': { backgroundColor: t.accent, filter: 'brightness(1.12)' },
          '&:disabled': { backgroundColor: t.hover.light, color: t.text.quaternary },
        }}
      >
        {mutation.isPending ? (
          <CircularProgress size={16} sx={{ color: t.text.contrast }} />
        ) : atMax ? (
          'Max reached'
        ) : (
          `Buy · ${PRICE_UP} UP`
        )}
      </Button>
    </Box>
  );
}
