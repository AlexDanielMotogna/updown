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

function Preview({ item }: { item: CosmeticEntry }) {
  const t = useThemeTokens();
  if (item.kind === 'BADGE') return <Box sx={{ fontSize: '1.4rem', lineHeight: 1 }}>{item.value}</Box>;
  if (item.kind === 'TITLE')
    return (
      <Typography sx={{ fontSize: '0.9rem', fontWeight: 800, color: t.text.primary, fontStyle: 'italic' }}>
        {item.value}
      </Typography>
    );
  return (
    <Box
      sx={{
        width: 26, height: 26,
        borderRadius: item.kind === 'FRAME' ? '50%' : '4px',
        bgcolor: item.kind === 'FRAME' ? 'transparent' : item.value,
        border: item.kind === 'FRAME' ? `3px solid ${item.value}` : `1px solid ${t.border.medium}`,
      }}
    />
  );
}

interface Props {
  walletAddress: string;
  profile?: UserProfile | null;
  /** 'buy' = store (spend UP); 'equip' = inventory (use owned). */
  mode: 'buy' | 'equip';
}

/**
 * Cosmetics grid with two modes: the store buys (spends UP Coins), the inventory
 * equips what you already own. Shared so the preview + layout stay in one place.
 */
export function CosmeticsGrid({ walletAddress, profile, mode }: Props) {
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
    onSuccess: (res) => { if (res.success) { setError(null); refresh(); } else setError(res.error?.message ?? 'Could not buy'); },
    onError: (e: Error) => setError(e.message || 'Could not buy'),
    onSettled: () => setPendingSku(null),
  });
  const equipMut = useMutation({
    mutationFn: equipCosmetic,
    onSuccess: (res) => { if (res.success) { setError(null); refresh(); } else setError(res.error?.message ?? 'Could not equip'); },
    onError: (e: Error) => setError(e.message || 'Could not equip'),
    onSettled: () => setPendingSku(null),
  });

  const coins = profile ? Number(profile.coinsBalance) / UP_COINS_DIVISOR : 0;
  const busy = buyMut.isPending || equipMut.isPending;

  const onBuy = (item: CosmeticEntry) => {
    setError(null); setPendingSku(item.sku);
    const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${walletAddress}-${item.sku}-${Date.now()}`;
    buyMut.mutate({ walletAddress, sku: item.sku, idempotencyKey });
  };
  const onEquip = (item: CosmeticEntry, equipped: boolean) => {
    setError(null); setPendingSku(item.sku);
    equipMut.mutate({ walletAddress, cosmeticId: item.id, equipped });
  };

  if (isLoading) {
    return <Box sx={{ py: 3, textAlign: 'center' }}><CircularProgress size={20} sx={{ color: t.accent }} /></Box>;
  }

  const all = catalog ?? [];
  const visible = mode === 'equip' ? all.filter((c) => c.owned) : all;

  if (mode === 'equip' && visible.length === 0) {
    return (
      <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary, py: 1 }}>
        No cosmetics yet. Buy some in the Store to customize your profile.
      </Typography>
    );
  }

  return (
    <Box>
      {error && <Typography sx={{ fontSize: '0.75rem', color: t.down, fontWeight: 600, mb: 1 }}>{error}</Typography>}
      {KIND_ORDER.map(({ kind, label }) => {
        const items = visible.filter((c) => c.kind === kind);
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
                      p: 1.25, borderRadius: 1, bgcolor: t.bg.surfaceAlt,
                      border: `1px solid ${item.equipped ? t.accent : t.border.subtle}`,
                      display: 'flex', flexDirection: 'column', gap: 0.75,
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minHeight: 30 }}>
                      <Preview item={item} />
                      <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: t.text.secondary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.name}
                      </Typography>
                    </Box>

                    {mode === 'buy' ? (
                      item.owned ? (
                        <Button disabled size="small" sx={{ color: t.text.tertiary, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', border: `1px solid ${t.border.subtle}`, borderRadius: '2px', py: 0.3 }}>
                          Owned
                        </Button>
                      ) : (
                        <Button onClick={() => onBuy(item)} disabled={busy || !canAfford} variant="contained" size="small"
                          sx={{ backgroundColor: t.accent, color: t.text.contrast, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', borderRadius: '2px', py: 0.4, '&:hover': { backgroundColor: t.accent, filter: 'brightness(1.12)' }, '&:disabled': { backgroundColor: t.hover.light, color: t.text.quaternary } }}>
                          {thisPending ? <CircularProgress size={13} sx={{ color: t.text.contrast }} /> : `Buy · ${price.toLocaleString(undefined, { maximumFractionDigits: 0 })} UP`}
                        </Button>
                      )
                    ) : item.equipped ? (
                      <Button onClick={() => onEquip(item, false)} disabled={busy} size="small"
                        sx={{ color: t.accent, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', border: `1px solid ${t.accent}`, borderRadius: '2px', py: 0.3 }}>
                        {thisPending ? <CircularProgress size={13} sx={{ color: t.accent }} /> : 'Equipped ✓'}
                      </Button>
                    ) : (
                      <Button onClick={() => onEquip(item, true)} disabled={busy} size="small"
                        sx={{ color: t.text.secondary, fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', border: `1px solid ${t.border.medium}`, borderRadius: '2px', py: 0.3 }}>
                        {thisPending ? <CircularProgress size={13} /> : 'Equip'}
                      </Button>
                    )}
                  </Box>
                );
              })}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
