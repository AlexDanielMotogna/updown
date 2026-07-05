'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, IconButton, Box, Typography } from '@mui/material';
import { Close, ShieldOutlined, BoltOutlined } from '@mui/icons-material';
import Link from 'next/link';
import { useThemeTokens } from '@/app/providers';
import { CosmeticsGrid } from '@/components/store/CosmeticsGrid';
import { UpIcon } from '@/components/UpIcon';
import { useBoosts } from '@/hooks/useBoosts';
import type { UserProfile } from '@/lib/api';

function timeLeft(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return '0s';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const ss = String(s).padStart(2, '0');
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${ss}s`;
  if (m > 0) return `${m}m ${ss}s`;
  return `${s}s`;
}

interface Props {
  open: boolean;
  onClose: () => void;
  walletAddress: string;
  profile: UserProfile | null | undefined;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  const t = useThemeTokens();
  return (
    <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, mb: 1 }}>
      {children}
    </Typography>
  );
}

/**
 * Inventory ("backpack"): use what you bought. Equip cosmetics, and see your
 * consumables (streak-savers, auto-used) and active boosts (auto-applied, with a
 * live countdown). Buying happens in the /store.
 */
export function InventoryDialog({ open, onClose, walletAddress, profile }: Props) {
  const t = useThemeTokens();
  const { data: boosts } = useBoosts();
  const [now, setNow] = useState(() => Date.now());

  const active = (boosts?.active ?? []).filter((a) => new Date(a.expiresAt).getTime() > Date.now());

  useEffect(() => {
    if (!open || active.length === 0) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open, active.length]);

  const savers = profile?.streakSavers ?? 0;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{ sx: { background: t.bg.surfaceAlt, border: t.surfaceBorder, boxShadow: t.surfaceShadow, borderRadius: 2 } }}
    >
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        Inventory
        <IconButton size="small" onClick={onClose}><Close fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent>
        {/* Consumables + active boosts */}
        <Box sx={{ mb: 3 }}>
          <SectionTitle>Consumables</SectionTitle>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, borderRadius: 1, bgcolor: t.hover.light }}>
              <ShieldOutlined sx={{ fontSize: 18, color: t.accent }} />
              <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.primary }}>{savers}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: t.text.secondary }}>
                streak-saver{savers === 1 ? '' : 's'} · auto-used to protect your streak on a loss
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1.25, borderRadius: 1, bgcolor: t.hover.light, flexWrap: 'wrap' }}>
              <BoltOutlined sx={{ fontSize: 18, color: t.accent }} />
              {active.length === 0 ? (
                <Typography sx={{ fontSize: '0.75rem', color: t.text.secondary }}>No active boosts</Typography>
              ) : (
                active.map((a) => (
                  <Box key={a.kind} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, px: 0.9, py: 0.3, borderRadius: 1, bgcolor: `${t.accent}1a` }}>
                    <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: t.accent, fontVariantNumeric: 'tabular-nums' }}>
                      {a.multiplierBps / 10000}x {a.kind === 'XP' ? 'XP' : 'Coins'} · {timeLeft(a.expiresAt, now)}
                    </Typography>
                  </Box>
                ))
              )}
            </Box>
          </Box>
        </Box>

        {/* Cosmetics: equip */}
        <Box sx={{ mb: 1 }}>
          <SectionTitle>Cosmetics</SectionTitle>
          <CosmeticsGrid mode="equip" walletAddress={walletAddress} profile={profile} />
        </Box>

        {/* Footer link to the store */}
        <Box sx={{ mt: 1, pt: 1.5, borderTop: `1px solid ${t.border.subtle}`, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <UpIcon size={14} />
          <Typography sx={{ fontSize: '0.75rem', color: t.text.tertiary }}>
            Want more?{' '}
            <Link href="/store" style={{ color: t.accent, fontWeight: 700, textDecoration: 'none' }} onClick={onClose}>
              Open the Store
            </Link>
          </Typography>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
