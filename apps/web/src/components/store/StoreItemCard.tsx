'use client';

import type { ReactNode } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { UpIcon } from '@/components/UpIcon';

export interface StoreCardBadge { text: string; color: string }

export interface StoreItemCardProps {
  /** Centered visual (icon / frame / swatch / title pill). */
  preview: ReactNode;
  /** Soft glow color behind the preview. */
  glow?: string;
  name: string;
  subtitle?: string;
  priceUp: number;
  badge?: StoreCardBadge | null;
  /** Accent for the equipped/owned states + highlight border. */
  accent?: string;
  owned?: boolean;
  equipped?: boolean;
  /** Boost of this kind already active → locked. */
  active?: boolean;
  busy?: boolean;
  onClick?: () => void;
}

/** One store tile, matching the mockup: glowed preview, name, and a price/state footer. */
export function StoreItemCard({ preview, glow, name, subtitle, priceUp, badge, accent, owned, equipped, active, busy, onClick }: StoreItemCardProps) {
  const t = useThemeTokens();
  const acc = accent ?? t.accent;
  const locked = busy || equipped || active;

  return (
    <Box
      onClick={locked ? undefined : onClick}
      sx={{
        position: 'relative', display: 'flex', flexDirection: 'column',
        bgcolor: t.bg.surface,
        border: `1px solid ${equipped ? withAlpha(acc, 0.55) : t.border.subtle}`,
        borderRadius: 2, overflow: 'hidden',
        cursor: locked ? 'default' : 'pointer',
        transition: 'border-color 0.15s ease, transform 0.15s ease',
        '&:hover': locked ? {} : { borderColor: t.border.hover, transform: 'translateY(-2px)' },
      }}
    >
      {badge && (
        <Box sx={{ position: 'absolute', top: 7, left: 7, px: 0.6, py: 0.25, borderRadius: 0.75, bgcolor: withAlpha(badge.color, 0.16), color: badge.color, fontSize: { xs: '0.52rem', md: '0.58rem' }, fontWeight: 800, letterSpacing: '0.04em', zIndex: 2 }}>
          {badge.text}
        </Box>
      )}

      <Box sx={{ flex: 1, px: { xs: 1.25, md: 2 }, pt: { xs: 2, md: 2.5 }, pb: { xs: 1, md: 1.5 }, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <Box sx={{ position: 'relative', height: { xs: 56, md: 72 }, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: { xs: 1, md: 1.25 }, width: '100%' }}>
          {glow && <Box sx={{ position: 'absolute', width: 70, height: 70, borderRadius: '50%', bgcolor: glow, filter: 'blur(24px)', opacity: 0.35 }} />}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', maxWidth: '100%' }}>{preview}</Box>
        </Box>
        <Typography sx={{ fontWeight: 700, fontSize: { xs: '0.8rem', md: '0.9rem' }, color: t.text.primary, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{name}</Typography>
        {subtitle && <Typography sx={{ fontSize: { xs: '0.64rem', md: '0.72rem' }, color: t.text.tertiary, mt: 0.25 }}>{subtitle}</Typography>}
      </Box>

      <Box sx={{ borderTop: `1px solid ${t.border.subtle}`, py: { xs: 0.75, md: 1 }, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, minHeight: 32 }}>
        {busy ? (
          <CircularProgress size={15} sx={{ color: acc }} />
        ) : equipped ? (
          <Typography sx={{ fontSize: { xs: '0.66rem', md: '0.72rem' }, fontWeight: 800, color: acc, letterSpacing: '0.04em' }}>EQUIPPED</Typography>
        ) : owned ? (
          <Typography sx={{ fontSize: { xs: '0.7rem', md: '0.75rem' }, fontWeight: 700, color: acc }}>Equip</Typography>
        ) : active ? (
          <Typography sx={{ fontSize: { xs: '0.66rem', md: '0.72rem' }, fontWeight: 700, color: t.text.tertiary }}>Active</Typography>
        ) : (
          <>
            <UpIcon size={13} />
            <Typography sx={{ fontSize: { xs: '0.74rem', md: '0.8rem' }, fontWeight: 800, color: t.gold, fontVariantNumeric: 'tabular-nums' }}>{priceUp} UP</Typography>
          </>
        )}
      </Box>
    </Box>
  );
}
