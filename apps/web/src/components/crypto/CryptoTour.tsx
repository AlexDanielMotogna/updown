'use client';

import { useCallback, useEffect, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';

const CYAN = '#5FD8EF';
const PAD = 8;
const CARD_W = 300;
const CARD_H = 190; // approx, for placement math

export interface TourStep {
  /** CSS selector of the element to spotlight. If missing, the step is centered. */
  selector: string;
  title: string;
  body: string;
}

/**
 * Lightweight spotlight product tour. Darkens the page except a hole around the
 * current target element and anchors a tooltip card to it, with Back/Next/Skip.
 * No external deps: the "hole" is a box-shadow spread over the target rect.
 */
export function CryptoTour({ run, steps, onClose }: { run: boolean; steps: TourStep[]; onClose: () => void }) {
  const t = useThemeTokens();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => { if (run) setIndex(0); }, [run]);

  const step = steps[index];

  const measure = useCallback(() => {
    if (typeof document === 'undefined' || !step) return;
    const el = document.querySelector(step.selector) as HTMLElement | null;
    setRect(el ? el.getBoundingClientRect() : null);
  }, [step]);

  useEffect(() => {
    if (!run || !step) return;
    const el = typeof document !== 'undefined' ? (document.querySelector(step.selector) as HTMLElement | null) : null;
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    measure();
    const t1 = setTimeout(measure, 340); // after smooth scroll settles
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => { clearTimeout(t1); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true); };
  }, [run, index, step, measure]);

  if (!run || !step) return null;

  const last = index === steps.length - 1;

  // Tooltip position: below the target if it fits, else above; centered when no target.
  let top: number;
  let left: number;
  if (rect) {
    const placeBelow = rect.bottom + CARD_H + 16 < window.innerHeight;
    top = placeBelow ? rect.bottom + 12 : Math.max(12, rect.top - CARD_H - 12);
    left = Math.min(Math.max(12, rect.left + rect.width / 2 - CARD_W / 2), window.innerWidth - CARD_W - 12);
  } else {
    top = typeof window !== 'undefined' ? window.innerHeight / 2 - CARD_H / 2 : 200;
    left = typeof window !== 'undefined' ? window.innerWidth / 2 - CARD_W / 2 : 40;
  }

  return (
    <>
      {/* Click blocker (transparent) */}
      <Box onClick={(e) => e.stopPropagation()} sx={{ position: 'fixed', inset: 0, zIndex: 2000 }} />

      {/* Spotlight hole (visual only) or full dim when target missing */}
      {rect ? (
        <Box sx={{ position: 'fixed', top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, borderRadius: '10px', boxShadow: `0 0 0 9999px rgba(3,8,14,0.74), 0 0 0 2px ${CYAN}`, transition: 'all 0.22s ease', pointerEvents: 'none', zIndex: 2001 }} />
      ) : (
        <Box sx={{ position: 'fixed', inset: 0, bgcolor: 'rgba(3,8,14,0.74)', pointerEvents: 'none', zIndex: 2001 }} />
      )}

      {/* Tooltip card */}
      <Box sx={{ position: 'fixed', top, left, width: CARD_W, maxWidth: 'calc(100vw - 24px)', zIndex: 2002, bgcolor: t.bg.surface, border: `1px solid ${CYAN}44`, borderRadius: 1.5, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
          <Typography sx={{ fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.08em', color: CYAN }}>STEP {index + 1} OF {steps.length}</Typography>
          <Box onClick={onClose} sx={{ display: 'flex', cursor: 'pointer', color: t.text.tertiary, '&:hover': { color: t.text.primary } }}><Close sx={{ fontSize: 16 }} /></Box>
        </Box>
        <Typography sx={{ fontWeight: 800, fontSize: '1rem', color: t.text.primary, mt: 0.5, mb: 0.75 }}>{step.title}</Typography>
        <Typography sx={{ fontSize: '0.82rem', color: t.text.secondary, lineHeight: 1.5 }}>{step.body}</Typography>

        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 0.6, my: 1.75 }}>
          {steps.map((_, i) => (
            <Box key={i} onClick={() => setIndex(i)} sx={{ width: i === index ? 16 : 6, height: 6, borderRadius: 3, bgcolor: i === index ? CYAN : t.border.medium, cursor: 'pointer', transition: 'all 0.2s' }} />
          ))}
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography component="span" onClick={onClose} sx={{ fontSize: '0.75rem', fontWeight: 700, color: t.text.tertiary, cursor: 'pointer', mr: 'auto', '&:hover': { color: t.text.primary } }}>Skip</Typography>
          {index > 0 && (
            <Box component="button" onClick={() => setIndex((v) => v - 1)} sx={{ py: 0.85, px: 1.75, borderRadius: 1, border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, fontFamily: 'inherit', fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer' }}>Back</Box>
          )}
          <Box component="button" onClick={() => (last ? onClose() : setIndex((v) => v + 1))} sx={{ py: 0.85, px: 2, borderRadius: 1, border: 'none', bgcolor: CYAN, color: '#04121a', fontFamily: 'inherit', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer', '&:hover': { filter: 'brightness(1.05)' } }}>
            {last ? "Let's go" : 'Next'}
          </Box>
        </Box>
      </Box>
    </>
  );
}
