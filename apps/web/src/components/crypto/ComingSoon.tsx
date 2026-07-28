'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Dialog, IconButton } from '@mui/material';
import { AutoAwesome, Close, ChevronRight } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';

/** "Coming to UpDown" showcase items. Images are wide banners (~2000×760) with the
 *  copy baked in; drop new ones in /public/event_popups and add them here. */
const ITEMS = [
  { id: 'store', image: '/event_popups/Store.png', alt: 'Store — spend UP Coins on boosts and cosmetics' },
];

const RATIO = '2000 / 760';

/**
 * Teaser of upcoming UpDown features. Desktop: an inline auto-rotating slider in
 * the sidebar (replaces Event Info). Mobile: a compact card that opens the same
 * carousel as a popup. Tapping a slide on desktop also opens the popup (larger).
 */
export function ComingSoonSlider({ autoOpen = false }: { autoOpen?: boolean }) {
  const t = useThemeTokens();
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  const n = ITEMS.length;

  // Marketing: the page pops this open automatically once other modals close.
  // Edge-triggered, so closing it doesn't reopen it until the next visit.
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  useEffect(() => {
    if (n < 2) return;
    const id = setInterval(() => setI((v) => (v + 1) % n), 5000);
    return () => clearInterval(id);
  }, [n]);

  const cur = ITEMS[i];

  const dots = (
    n > 1 ? (
      <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6, mt: 1 }}>
        {ITEMS.map((_, k) => (
          <Box key={k} onClick={(e) => { e.stopPropagation(); setI(k); }} sx={{ width: k === i ? 16 : 6, height: 6, borderRadius: 3, bgcolor: k === i ? CYAN : t.border.medium, cursor: 'pointer', transition: 'all 0.2s' }} />
        ))}
      </Box>
    ) : null
  );

  const image = (onClick?: () => void) => (
    <Box component="img" src={cur.image} alt={cur.alt} onClick={onClick} sx={{ width: '100%', aspectRatio: RATIO, objectFit: 'cover', display: 'block', cursor: onClick ? 'pointer' : 'default' }} />
  );

  const header = (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, color: CYAN }}>
      <AutoAwesome sx={{ fontSize: 18 }} />
      <Typography sx={{ fontWeight: 800, fontSize: '0.8rem', letterSpacing: '0.05em', color: t.text.primary }}>COMING TO UPDOWN</Typography>
    </Box>
  );

  return (
    <>
      {/* Desktop: inline slider (image full-bleed for max size) */}
      <Box sx={{ display: { xs: 'none', lg: 'block' }, borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden' }}>
        {header}
        {image(() => setOpen(true))}
        {n > 1 && <Box sx={{ px: 2, py: 1 }}>{dots}</Box>}
      </Box>

      {/* Mobile: compact card that opens the popup */}
      <Box sx={{ display: { xs: 'block', lg: 'none' }, borderRadius: 1, bgcolor: t.bg.surface, overflow: 'hidden' }}>
        {header}
        <Box onClick={() => setOpen(true)} sx={{ cursor: 'pointer' }}>
          {image()}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.25, py: 1, color: CYAN }}>
            <Typography sx={{ fontSize: '0.74rem', fontWeight: 700 }}>See what&apos;s coming</Typography>
            <ChevronRight sx={{ fontSize: 16 }} />
          </Box>
        </Box>
      </Box>

      {/* Popup carousel */}
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, borderRadius: 1.5, border: `1px solid ${CYAN}33`, overflow: 'hidden', backgroundImage: 'none' } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, color: CYAN }}>
            <AutoAwesome sx={{ fontSize: 18 }} />
            <Typography sx={{ fontWeight: 800, fontSize: '0.9rem', color: t.text.primary }}>Coming to UpDown</Typography>
          </Box>
          <IconButton onClick={() => setOpen(false)} size="small" sx={{ color: t.text.tertiary }}><Close sx={{ fontSize: 18 }} /></IconButton>
        </Box>
        {image()}
        {n > 1 && <Box sx={{ px: 2, py: 1.5 }}>{dots}</Box>}
      </Dialog>
    </>
  );
}
