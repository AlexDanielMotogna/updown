'use client';

import { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useThemeTokens } from '@/app/providers';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import {
  fetchCosmetics,
  buyCosmetic,
  equipCosmetic,
  type CosmeticEntry,
  type CosmeticKind,
  type UserProfile,
} from '@/lib/api';

const KIND_ORDER: { kind: CosmeticKind; label: string }[] = [
  { kind: 'TITLE', label: 'Titles' },
  { kind: 'NAME_COLOR', label: 'Name Colors' },
  { kind: 'BADGE', label: 'Badges' },
  { kind: 'FRAME', label: 'Avatar Frames' },
];

interface Props {
  walletAddress: string;
  profile: UserProfile | null | undefined;
}

/** Small visual preview of a cosmetic, interpreted per kind. */
function Preview({ item }: { item: CosmeticEntry }) {
  const t = useThemeTokens();
  if (item.kind === 'BADGE') return <Box sx={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.value}</Box>;
  if (item.kind === 'TITLE')
    return (
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: t.text.primary, fontStyle: 'italic' }}>
        {item.value}
      </Typography>
    );
  // NAME_COLOR / FRAME → a color swatch.
  return (
    <Box
      sx={{
        width: 26,
        height: 26,
        borderRadius: item.kind === 'FRAME' ? '50%' : '4px',
        bgcolor: item.kind === 'FRAME' ? 'transparent' : item.value,
        border: item.kind === 'FRAME' ? `3px solid ${item.value}` : `1px solid ${t.border.medium}`,
      }}
    />
  );
}

/**
 * Cosmetics store (UP-Coin sink). Buy status items with UP Coins (burned), then
 * equip one per kind. Equipped items surface on the profile identity.
 */
export function CosmeticsStore({ walletAddress, profile }: Props) {
  const t = useThemeTokens();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pendingSku, setPendingSku] = useState<string | null>(null);

  const { data: catalog, isLoading } = useQuery({
    queryKey: ['cosmetics', walletAddress],
    queryFn: () => fetchCosmetics(walletAddress),
    enabled: !!walletAddress,
    select: (res) => res.data ?? [],
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['cosmetics', walletAddress] });
    queryClient.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
  };

  const buyMut = useMutation({
    mutationFn: buyCosmetic,
    onSuccess: (res) => {
      if (res.success) { setError(null); refresh(); }
      else setError(res.error?.message ?? 'Could not buy');
    },
    onError: (e: Error) => setError(e.message || 'Could not buy'),
    onSettled: () => setPendingSku(null),
  });

  const equipMut = useMutation({
    mutationFn: equipCosmetic,
    onSuccess: (res) => {
      if (res.success) { setError(null); refresh(); }
      else setError(res.error?.message ?? 'Could not equip');
    },
    onError: (e: Error) => setError(e.message || 'Could not equip'),
    onSettled: () => setPendingSku(null),
  });

  if (!profile) return null;

  const coins = Number(profile.coinsBalance) / UP_COINS_DIVISOR;
  const busy = buyMut.isPending || equipMut.isPending;

  const onBuy = (item: CosmeticEntry) => {
    setError(null);
    setPendingSku(item.sku);
    const idempotencyKey =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${walletAddress}-${item.sku}-${Date.now()}`;
    buyMut.mutate({ walletAddress, sku: item.sku, idempotencyKey });
  };
  const onEquip = (item: CosmeticEntry, equipped: boolean) => {
    setError(null);
    setPendingSku(item.sku);
    equipMut.mutate({ walletAddress, cosmeticId: item.id, equipped });
  };

  return (
    <Box sx={{ mb: 4, p: 2, borderRadius: 1.5, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}` }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5 }}>
        <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary }}>Cosmetics</Typography>
        <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>
          Spend UP Coins on status items
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
        KIND_ORDER.map(({ kind, label }) => {
          const items = (catalog ?? []).filter((c) => c.kind === kind);
          if (items.length === 0) return null;
          return (
            <Box key={kind} sx={{ mb: 2 }}>
              <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.75 }}>
                {label}
              </Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 1 }}>
                {items.map((item) => {
                  const price = Number(item.price) / UP_COINS_DIVISOR;
                  const canAfford = coins >= price;
                  const thisPending = busy && pendingSku === item.sku;
                  return (
                    <Box
                      key={item.id}
                      sx={{
                        p: 1.25,
                        borderRadius: 1,
                        bgcolor: t.bg.surfaceAlt,
                        border: `1px solid ${item.equipped ? t.accent : t.border.subtle}`,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.75,
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 30 }}>
                        <Preview item={item} />
                        <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: t.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {item.name}
                        </Typography>
                      </Box>

                      {!item.owned ? (
                        <Button
                          onClick={() => onBuy(item)}
                          disabled={busy || !canAfford}
                          variant="contained"
                          size="small"
                          sx={{
                            backgroundColor: t.accent, color: t.text.contrast, fontWeight: 700, fontSize: '0.7rem',
                            textTransform: 'none', borderRadius: '2px', py: 0.4,
                            '&:hover': { backgroundColor: t.accent, filter: 'brightness(1.12)' },
                            '&:disabled': { backgroundColor: t.hover.light, color: t.text.quaternary },
                          }}
                        >
                          {thisPending ? <CircularProgress size={13} sx={{ color: t.text.contrast }} /> : `Buy · ${price.toLocaleString(undefined, { maximumFractionDigits: 0 })} UP`}
                        </Button>
                      ) : item.equipped ? (
                        <Button
                          onClick={() => onEquip(item, false)}
                          disabled={busy}
                          size="small"
                          sx={{ color: t.accent, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', border: `1px solid ${t.accent}`, borderRadius: '2px', py: 0.3 }}
                        >
                          {thisPending ? <CircularProgress size={13} sx={{ color: t.accent }} /> : 'Equipped ✓'}
                        </Button>
                      ) : (
                        <Button
                          onClick={() => onEquip(item, true)}
                          disabled={busy}
                          size="small"
                          sx={{ color: t.text.secondary, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', border: `1px solid ${t.border.medium}`, borderRadius: '2px', py: 0.3 }}
                        >
                          {thisPending ? <CircularProgress size={13} /> : 'Equip'}
                        </Button>
                      )}
                    </Box>
                  );
                })}
              </Box>
            </Box>
          );
        })
      )}
    </Box>
  );
}
