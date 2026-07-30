'use client';

import { useMemo, useRef, useState } from 'react';
import { Box, Container, Typography, Dialog, Snackbar } from '@mui/material';
import { BoltOutlined, MonetizationOnOutlined, ShieldOutlined, ChevronRight, CheckCircle } from '@mui/icons-material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppShell, ConnectWalletButton } from '@/components';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUserProfile } from '@/hooks/useUserProfile';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { UP_COINS_DIVISOR } from '@/lib/constants';
import { STORE_UI_ENABLED } from '@/lib/features';
import { UpIcon } from '@/components/UpIcon';
import { StoreItemCard, type StoreCardBadge } from '@/components/store/StoreItemCard';
import {
  fetchCosmetics, buyCosmetic, equipCosmetic, fetchBoosts, buyBoost, buyStreakSaver,
  type CosmeticEntry, type BoostProductEntry,
} from '@/lib/api';

const GOLD = '#F5B301';
const STREAK_PRICE = 20;
const TABS = ['Featured', 'Boosts', 'Titles', 'Frames', 'Badges', 'Colors', 'Bundles'] as const;
type Tab = (typeof TABS)[number];

// Design-only merchandising flags (no backend field yet).
const FLAGS: Record<string, StoreCardBadge> = {
  'xp-2x-24h': { text: 'POPULAR', color: '#5FD8EF' },
  'title-oracle': { text: 'BEST VALUE', color: '#A855F7' },
  'frame-cyan': { text: 'NEW', color: '#22C55E' },
};
const TITLE_PALETTE = ['#5FD8EF', '#3B82F6', '#A855F7', GOLD, '#EF4444'];
const titleColor = (sku: string) => TITLE_PALETTE[[...sku].reduce((a, c) => a + c.charCodeAt(0), 0) % TITLE_PALETTE.length];
const money = (raw: string) => Number(raw) / UP_COINS_DIVISOR;

export default function StorePage() {
  const t = useThemeTokens();
  const { connected, walletAddress } = useWalletBridge();
  const { data: profile } = useUserProfile();
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('Featured');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ name: string; priceUp: number; run: () => void } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const labelRef = useRef<string>('');

  const coins = profile ? Number(profile.coinsBalance) / UP_COINS_DIVISOR : 0;

  const cosmeticsQ = useQuery({ queryKey: ['cosmetics', walletAddress], queryFn: () => fetchCosmetics(walletAddress!), enabled: !!walletAddress, select: (r) => r.data });
  const boostsQ = useQuery({ queryKey: ['boosts', walletAddress], queryFn: () => fetchBoosts(walletAddress!), enabled: !!walletAddress, refetchInterval: 30_000, select: (r) => r.data });

  const cosmetics = useMemo(() => cosmeticsQ.data ?? [], [cosmeticsQ.data]);
  const boosts = boostsQ.data?.products ?? [];
  const activeKinds = new Set((boostsQ.data?.active ?? []).map((a) => a.kind));

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['cosmetics', walletAddress] });
    qc.invalidateQueries({ queryKey: ['boosts', walletAddress] });
    qc.invalidateQueries({ queryKey: ['userProfile', walletAddress] });
  };
  const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${walletAddress}-${Date.now()}`);
  const finish = (r: { success: boolean; error?: { message?: string } }, okMsg: string) => {
    if (!r.success) setError(r.error?.message ?? 'Purchase failed');
    else { setError(null); invalidate(); setToast(okMsg); }
  };

  const buyBoostMut = useMutation({ mutationFn: buyBoost, onSuccess: (r) => finish(r, `${labelRef.current} activated`), onError: (e: Error) => setError(e.message), onSettled: () => setBusy(null) });
  const buyCosmeticMut = useMutation({ mutationFn: buyCosmetic, onSuccess: (r) => finish(r, `${labelRef.current} purchased`), onError: (e: Error) => setError(e.message), onSettled: () => setBusy(null) });
  const equipMut = useMutation({ mutationFn: equipCosmetic, onSuccess: (r) => finish(r, `${labelRef.current} equipped`), onError: (e: Error) => setError(e.message), onSettled: () => setBusy(null) });
  const buyStreakMut = useMutation({ mutationFn: buyStreakSaver, onSuccess: (r) => finish(r, 'Streak Saver purchased'), onError: (e: Error) => setError(e.message), onSettled: () => setBusy(null) });

  const circle = (icon: React.ReactNode, color: string) => (
    <Box sx={{ width: 52, height: 52, borderRadius: '50%', border: `1.5px solid ${color}`, bgcolor: withAlpha(color, 0.12), display: 'flex', alignItems: 'center', justifyContent: 'center', color }}>{icon}</Box>
  );

  // ---- Card builders (reuse the real catalog + purchase flow) ----
  const boostCard = (p: BoostProductEntry) => {
    const mult = p.multiplierBps / 10000;
    const isXp = p.kind === 'XP';
    const color = isXp ? '#5FD8EF' : '#22C55E';
    const active = activeKinds.has(p.kind);
    return (
      <StoreItemCard
        key={p.sku}
        preview={circle(isXp ? <BoltOutlined sx={{ fontSize: 24 }} /> : <MonetizationOnOutlined sx={{ fontSize: 24 }} />, color)}
        glow={color} accent={color}
        name={`${mult}x ${isXp ? 'XP' : 'Coins'}`}
        subtitle={p.durationHours >= 24 ? `${p.durationHours} Hours` : `${p.durationHours} Hour`}
        priceUp={money(p.price)} badge={FLAGS[p.sku]} active={active} busy={busy === p.sku}
        onClick={() => setConfirm({ name: `${mult}x ${isXp ? 'XP' : 'Coins'} · ${p.durationHours}h`, priceUp: money(p.price), run: () => { labelRef.current = `${mult}x ${isXp ? 'XP' : 'Coins'}`; setBusy(p.sku); setError(null); buyBoostMut.mutate({ walletAddress: walletAddress!, sku: p.sku, idempotencyKey: uuid() }); } })}
      />
    );
  };

  const streakCard = () => (
    <StoreItemCard
      key="streak-saver"
      preview={circle(<ShieldOutlined sx={{ fontSize: 24 }} />, '#A855F7')}
      glow="#A855F7" accent="#A855F7"
      name="Streak Saver" subtitle="Save your streak" priceUp={STREAK_PRICE} busy={busy === 'streak'}
      onClick={() => setConfirm({ name: 'Streak Saver', priceUp: STREAK_PRICE, run: () => { setBusy('streak'); setError(null); buyStreakMut.mutate({ walletAddress: walletAddress!, quantity: 1, idempotencyKey: uuid() }); } })}
    />
  );

  const cosmeticCard = (c: CosmeticEntry) => {
    let preview: React.ReactNode; let subtitle = ''; let accent = t.accent;
    if (c.kind === 'TITLE') {
      accent = titleColor(c.sku); subtitle = 'Exclusive Title';
      preview = <Box sx={{ px: 2, py: 0.75, borderRadius: 1, border: `1px solid ${withAlpha(accent, 0.6)}`, bgcolor: withAlpha(accent, 0.1) }}><Typography sx={{ fontWeight: 800, fontStyle: 'italic', color: accent, fontSize: '0.95rem' }}>{c.value || c.name}</Typography></Box>;
    } else if (c.kind === 'FRAME') {
      accent = c.value; subtitle = 'Avatar Frame';
      preview = <Box sx={{ width: 92, height: 40, borderRadius: 1, border: `2px solid ${c.value}`, boxShadow: `0 0 12px ${withAlpha(c.value, 0.5)}` }} />;
    } else if (c.kind === 'BADGE') {
      accent = GOLD; subtitle = 'Exclusive Badge';
      preview = <Box sx={{ fontSize: '2rem', lineHeight: 1 }}>{c.value}</Box>;
    } else { // NAME_COLOR
      accent = c.value; subtitle = 'Name Color';
      preview = <Typography sx={{ fontWeight: 900, fontSize: '1.15rem', color: c.value }}>Aa Name</Typography>;
    }
    return (
      <StoreItemCard
        key={c.id || c.sku}
        preview={preview} glow={accent} accent={accent}
        name={c.name} subtitle={subtitle} priceUp={money(c.price)} badge={FLAGS[c.sku]}
        owned={c.owned && !c.equipped} equipped={c.equipped} busy={busy === (c.id || c.sku)}
        onClick={() => {
          const key = c.id || c.sku;
          if (c.owned) { labelRef.current = c.name; setBusy(key); setError(null); equipMut.mutate({ walletAddress: walletAddress!, cosmeticId: c.id, equipped: true }); }
          else setConfirm({ name: c.name, priceUp: money(c.price), run: () => { labelRef.current = c.name; setBusy(key); setError(null); buyCosmeticMut.mutate({ walletAddress: walletAddress!, sku: c.sku, idempotencyKey: uuid() }); } });
        }}
      />
    );
  };

  const grid = (children: React.ReactNode) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)', lg: 'repeat(5, 1fr)' }, gap: { xs: 1, md: 1.5 } }}>{children}</Box>
  );
  const sectionHeader = (title: string, onViewAll?: () => void) => (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 3, mb: 1.5 }}>
      <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: t.text.primary }}>{title}</Typography>
      {onViewAll && (
        <Box onClick={onViewAll} sx={{ display: 'flex', alignItems: 'center', gap: 0.25, cursor: 'pointer', color: t.text.tertiary, '&:hover': { color: t.text.primary } }}>
          <Typography sx={{ fontSize: '0.78rem', fontWeight: 600 }}>View all</Typography><ChevronRight sx={{ fontSize: 16 }} />
        </Box>
      )}
    </Box>
  );

  const titles = cosmetics.filter((c) => c.kind === 'TITLE');
  const frames = cosmetics.filter((c) => c.kind === 'FRAME');
  const badges = cosmetics.filter((c) => c.kind === 'BADGE');
  const colors = cosmetics.filter((c) => c.kind === 'NAME_COLOR');

  const featured: (BoostProductEntry | CosmeticEntry | undefined)[] = [
    boosts.find((b) => b.sku === 'xp-2x-24h'),
    cosmetics.find((c) => c.sku === 'title-oracle'),
    cosmetics.find((c) => c.sku === 'frame-cyan'),
    cosmetics.find((c) => c.sku === 'badge-rocket'),
    boosts.find((b) => b.sku === 'coins-2x-24h'),
  ];

  if (!STORE_UI_ENABLED) {
    return (
      <AppShell centered>
        <Container maxWidth={false} sx={{ maxWidth: 1400, py: 10, px: { xs: 2, md: 3 }, textAlign: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>The Store is not available yet.</Typography>
        </Container>
      </AppShell>
    );
  }

  return (
    <AppShell centered>
      <Container maxWidth={false} sx={{ maxWidth: 1400, py: { xs: 2, md: 3 }, px: { xs: 1.5, md: 3 } }}>
        {!connected || !walletAddress ? (
          <Box sx={{ textAlign: 'center', py: 10 }}>
            <Typography sx={{ color: 'text.secondary', mb: 3 }}>Connect your wallet to open the Store</Typography>
            <ConnectWalletButton variant="page" />
          </Box>
        ) : (
          <>
            {/* Hero */}
            <Box sx={{ position: 'relative', borderRadius: 2, overflow: 'hidden', bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, mb: 2.5, height: { xs: 130, md: 220 } }}>
              <Box component="img" src="/assets/store/store-banner.png" alt="" sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'right center' }} />
              <Box sx={{ position: 'absolute', inset: 0, background: { xs: 'linear-gradient(90deg, rgba(4,10,18,0.85) 0%, rgba(4,10,18,0.5) 55%, rgba(4,10,18,0.15) 100%)', md: 'linear-gradient(90deg, rgba(4,10,18,0.7) 0%, rgba(4,10,18,0.35) 45%, transparent 70%)' } }} />
              <Box sx={{ position: 'relative', p: { xs: 2, md: 3.5 }, maxWidth: { xs: '82%', md: 540 } }}>
                <Typography sx={{ fontSize: { xs: '1.5rem', md: '2.6rem' }, fontWeight: 900, letterSpacing: '0.02em', color: t.text.primary, lineHeight: 1 }}>STORE</Typography>
                <Typography sx={{ color: t.text.primary, mt: { xs: 0.5, md: 1 }, mb: { xs: 1.25, md: 2 }, maxWidth: 300, fontSize: { xs: '0.75rem', md: '0.92rem' }, lineHeight: 1.35, fontWeight: 500 }}>Spend your UP Coins to unlock boosts, cosmetics and more.</Typography>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.6, px: { xs: 1.25, md: 2 }, py: { xs: 0.6, md: 1 }, borderRadius: 1, bgcolor: GOLD, color: '#1a1200' }}>
                  <UpIcon size={14} />
                  <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.8rem', md: '0.95rem' }, fontVariantNumeric: 'tabular-nums' }}>{coins.toLocaleString(undefined, { maximumFractionDigits: 0 })} UP Coins</Typography>
                </Box>
              </Box>
            </Box>

            {/* Tabs */}
            <Box sx={{ display: 'flex', gap: { xs: 1.75, md: 3 }, borderBottom: `1px solid ${t.border.subtle}`, overflowX: 'auto', mb: 2.5, '&::-webkit-scrollbar': { display: 'none' } }}>
              {TABS.map((tb) => (
                <Box key={tb} onClick={() => setTab(tb)} sx={{ pb: 1.25, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, borderBottom: `2px solid ${tab === tb ? t.accent : 'transparent'}`, mb: '-1px' }}>
                  <Typography sx={{ fontSize: { xs: '0.82rem', md: '0.9rem' }, fontWeight: tab === tb ? 800 : 600, color: tab === tb ? t.text.primary : t.text.tertiary }}>{tb}</Typography>
                </Box>
              ))}
            </Box>

            {error && <Box sx={{ mb: 2, px: 1.5, py: 1, borderRadius: 1, bgcolor: withAlpha(t.error, 0.12), border: `1px solid ${withAlpha(t.error, 0.3)}` }}><Typography sx={{ fontSize: '0.8rem', color: t.error }}>{error}</Typography></Box>}

            {tab === 'Featured' && (
              <>
                {grid(featured.map((it) => (it ? ('kind' in it && (it.kind === 'XP' || it.kind === 'COINS') ? boostCard(it as BoostProductEntry) : cosmeticCard(it as CosmeticEntry)) : null)))}
                {sectionHeader('Boosts', () => setTab('Boosts'))}
                {grid([...boosts.slice(0, 4).map(boostCard), streakCard()])}
                {sectionHeader('Titles', () => setTab('Titles'))}
                {grid(titles.map(cosmeticCard))}
              </>
            )}
            {tab === 'Boosts' && grid([...boosts.map(boostCard), streakCard()])}
            {tab === 'Titles' && grid(titles.map(cosmeticCard))}
            {tab === 'Frames' && grid(frames.map(cosmeticCard))}
            {tab === 'Badges' && grid(badges.map(cosmeticCard))}
            {tab === 'Colors' && grid(colors.map(cosmeticCard))}
            {tab === 'Bundles' && (
              <Box sx={{ textAlign: 'center', py: 8 }}>
                <Typography sx={{ color: t.text.tertiary }}>Bundles are coming soon.</Typography>
              </Box>
            )}
          </>
        )}
      </Container>

      {/* Purchase confirmation */}
      <Dialog open={!!confirm} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${t.border.subtle}`, backgroundImage: 'none' } }}>
        {confirm && (() => {
          const insufficient = coins < confirm.priceUp;
          return (
            <Box sx={{ p: 3, textAlign: 'center' }}>
              <Typography sx={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.06em', color: t.text.tertiary }}>CONFIRM PURCHASE</Typography>
              <Typography sx={{ fontWeight: 800, fontSize: '1.05rem', color: t.text.primary, mt: 0.5, mb: 1.5 }}>{confirm.name}</Typography>
              <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mb: 0.75 }}>
                <UpIcon size={18} />
                <Typography sx={{ fontWeight: 900, fontSize: '1.3rem', color: GOLD, fontVariantNumeric: 'tabular-nums' }}>{confirm.priceUp} UP</Typography>
              </Box>
              <Typography sx={{ fontSize: '0.78rem', color: insufficient ? t.error : t.text.tertiary, mb: 2.5 }}>
                Balance: {coins.toLocaleString(undefined, { maximumFractionDigits: 0 })} UP{insufficient ? ' — not enough' : ''}
              </Typography>
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Box component="button" onClick={() => setConfirm(null)} sx={{ flex: 1, py: 1.15, borderRadius: 1, border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>Cancel</Box>
                <Box component="button" disabled={insufficient} onClick={() => { const run = confirm.run; setConfirm(null); run(); }} sx={{ flex: 1, py: 1.15, borderRadius: 1, border: 'none', bgcolor: insufficient ? t.border.medium : t.accent, color: '#04121a', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.85rem', cursor: insufficient ? 'default' : 'pointer', opacity: insufficient ? 0.6 : 1 }}>Confirm</Box>
              </Box>
            </Box>
          );
        })()}
      </Dialog>

      <Snackbar open={!!toast} autoHideDuration={2500} onClose={() => setToast(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${withAlpha(t.gain, 0.45)}`, boxShadow: t.surfaceShadow }}>
          <CheckCircle sx={{ fontSize: 18, color: t.gain }} />
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>{toast}</Typography>
        </Box>
      </Snackbar>
    </AppShell>
  );
}
