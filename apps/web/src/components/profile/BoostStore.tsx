'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { BoltOutlined } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import {
  fetchBoosts,
  buyBoost,
  type BoostProductEntry,
  type ActiveBoostEntry,
  type BoostKind,
  type UserProfile,
} from '@/lib/api';

interface Props {
  walletAddress: string;
  profile: UserProfile | null | undefined;
}

function timeLeft(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return 'expired';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s left`;
  if (m > 0) return `${m}m ${ss}s left`;
  return `${s}s left`;
}

/**
 * Boost store (UP-Coin sink). Buy a time-limited XP or COINS multiplier (burned).
 * One active per kind — while a kind is active its products are locked and a live
 * countdown shows the remaining time.
 */
export function BoostStore({ walletAddress, profile }: Props) {
  const t = useThemeTokens();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingSku, setPendingSku] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Tick every second so the countdown stays live.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['boosts', walletAddress],
    queryFn: () => fetchBoosts(walletAddress),
    enabled: !!walletAddress,
    refetchInterval: 30_000,
    select: (res) => res.data,
  });

  const buyMut = useMutation({
    mutationFn: buyBoost,
    onSuccess: (res) => {
      if (res.success) {
        setError(null);
        queryClient.invalidateQueries({ queryKey: ['boosts', walletAddress] });
        queryClient.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
      } else setError(res.error?.message ?? 'Could not buy boost');
    },
    onError: (e: Error) => setError(e.message || 'Could not buy boost'),
    onSettled: () => setPendingSku(null),
  });

  if (!profile) return null;

  const coins = Number(profile.coinsBalance) / UP_COINS_DIVISOR;
  const products = data?.products ?? [];
  const activeByKind = new Map<BoostKind, ActiveBoostEntry>((data?.active ?? []).map((a) => [a.kind, a]));

  const onBuy = (p: BoostProductEntry) => {
    setError(null);
    setPendingSku(p.sku);
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${walletAddress}-${p.sku}-${Date.now()}`;
    buyMut.mutate({ walletAddress, sku: p.sku, idempotencyKey });
  };

  return (
    <Box sx={{ mb: 4, p: 2, borderRadius: 1.5, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}` }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1.5 }}>
        <BoltOutlined sx={{ fontSize: 18, color: t.accent }} />
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary }}>Boosts</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary, ml: 'auto' }}>
          Temporary XP &amp; Coin multipliers
        </Typography>
      </Box>

      {error && (
        <Typography sx={{ fontSize: '0.75rem', color: t.down, fontWeight: 600, mb: 1 }}>{error}</Typography>
      )}

      {isLoading ? (
        <Box sx={{ py: 3, textAlign: 'center' }}>
          <CircularProgress size={20} sx={{ color: t.accent }} />
        </Box>
      ) : (
        <>
        {(data?.active ?? []).length > 0 && (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            {(data!.active).map((a) => (
              <Box key={a.kind} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, px: 1, py: 0.5, borderRadius: 1, bgcolor: `${t.accent}1a`, border: `1px solid ${t.accent}` }}>
                <BoltOutlined sx={{ fontSize: 14, color: t.accent }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: t.accent }}>
                  {a.multiplierBps / 10000}x {a.kind === 'XP' ? 'XP' : 'Coins'} active · {timeLeft(a.expiresAt, now)}
                </Typography>
              </Box>
            ))}
          </Box>
        )}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 1 }}>
          {products.map((p) => {
            const price = Number(p.price) / UP_COINS_DIVISOR;
            const active = activeByKind.get(p.kind);
            const isThisActive = !!active && active.sku === p.sku;
            const kindLocked = !!active && !isThisActive; // same kind active, different product
            const canAfford = coins >= price;
            const thisPending = buyMut.isPending && pendingSku === p.sku;
            const disabled = buyMut.isPending || !!active || !canAfford;
            return (
              <Box
                key={p.sku}
                sx={{
                  p: 1.25,
                  borderRadius: 1,
                  bgcolor: t.bg.surfaceAlt,
                  border: `1px solid ${isThisActive ? t.accent : t.border.subtle}`,
                  opacity: kindLocked ? 0.55 : 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 0.75,
                }}
              >
                <Box>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.primary }}>{p.label}</Typography>
                  {isThisActive ? (
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.accent }}>
                      Active · {timeLeft(active!.expiresAt, now)}
                    </Typography>
                  ) : kindLocked ? (
                    <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, color: t.text.tertiary }}>
                      {p.kind === 'XP' ? 'XP' : 'Coins'} boost already running
                    </Typography>
                  ) : null}
                </Box>
                <Button
                  onClick={() => onBuy(p)}
                  disabled={disabled}
                  variant="contained"
                  size="small"
                  sx={{
                    backgroundColor: t.accent, color: t.text.contrast, fontWeight: 700, fontSize: '0.7rem',
                    textTransform: 'none', borderRadius: '2px', py: 0.4,
                    '&:hover': { backgroundColor: t.accent, filter: 'brightness(1.12)' },
                    '&:disabled': { backgroundColor: t.hover.light, color: t.text.quaternary },
                  }}
                >
                  {thisPending ? (
                    <CircularProgress size={13} sx={{ color: t.text.contrast }} />
                  ) : isThisActive ? (
                    'Active'
                  ) : kindLocked ? (
                    'Locked'
                  ) : (
                    `Buy · ${price.toLocaleString(undefined, { maximumFractionDigits: 0 })} UP`
                  )}
                </Button>
              </Box>
            );
          })}
        </Box>
        </>
      )}
    </Box>
  );
}
