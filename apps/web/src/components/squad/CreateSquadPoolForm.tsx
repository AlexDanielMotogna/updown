'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  CircularProgress,
} from '@mui/material';
import { Remove, Add as AddIcon } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

const ASSETS = [
  { value: 'BTC', label: 'BTC', img: '/coins/btc-coin.png' },
  { value: 'ETH', label: 'ETH', img: '/coins/eth-coin.png' },
  { value: 'SOL', label: 'SOL', img: '/coins/sol-coin.png' },
];

const DURATIONS = [
  { label: 'Turbo', sub: '3 min', value: 180, img: '/assets/turbo-tag.png' },
  { label: 'Rapid', sub: '5 min', value: 300, img: '/assets/rapid-tag.png' },
  { label: 'Short', sub: '15 min', value: 900, img: '/assets/short-tag.png' },
  { label: 'Hourly', sub: '1 hour', value: 3600, img: '/assets/hourly-tag.png' },
];

interface CreateSquadPoolFormProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (params: { asset: string; durationSeconds: number; maxBettors?: number }) => void;
  isLoading: boolean;
}

export function CreateSquadPoolForm({ open, onClose, onSubmit, isLoading }: CreateSquadPoolFormProps) {
  const t = useThemeTokens();
  const [asset, setAsset] = useState('BTC');
  const [duration, setDuration] = useState(300);
  const [maxBettors, setMaxBettors] = useState<number | null>(null);

  const PLAYER_PRESETS = [2, 4, 6, 10, 20];

  const handleSubmit = () => {
    onSubmit({
      asset,
      durationSeconds: duration,
      maxBettors: maxBettors ?? undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ sx: { background: t.bg.surfaceAlt, border: t.surfaceBorder, boxShadow: t.surfaceShadow, borderRadius: 1 } }}
    >
      <DialogTitle sx={{ fontWeight: 700 }}>Create Pool</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: '16px !important' }}>
        {/* Asset selector */}
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '12px' }}>
            Asset
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0.5, mt: 0.75 }}>
            {ASSETS.map(a => (
              <Box
                key={a.value}
                onClick={() => setAsset(a.value)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.75,
                  py: 1.5,
                  px: 1,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  border: asset === a.value ? `1.5px solid ${t.up}` : `1.5px solid ${t.border.default}`,
                  bgcolor: asset === a.value ? withAlpha(t.up, 0.07) : t.hover.subtle,
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: asset === a.value ? withAlpha(t.up, 0.09) : 'rgba(255,255,255,0.05)' },
                }}
              >
                <Box
                  component="img"
                  src={a.img}
                  alt={a.label}
                  sx={{ width: 36, height: 36, borderRadius: '50%' }}
                />
                <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: asset === a.value ? t.up : t.text.primary }}>
                  {a.label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Duration selector */}
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '12px' }}>
            Duration
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0.5, mt: 0.75 }}>
            {DURATIONS.map(d => (
              <Box
                key={d.value}
                onClick={() => setDuration(d.value)}
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 0.5,
                  py: 1.25,
                  px: 0.5,
                  cursor: 'pointer',
                  borderRadius: '2px',
                  border: duration === d.value ? `1.5px solid ${t.up}` : `1.5px solid ${t.border.default}`,
                  bgcolor: duration === d.value ? withAlpha(t.up, 0.07) : t.hover.subtle,
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: duration === d.value ? withAlpha(t.up, 0.09) : 'rgba(255,255,255,0.05)' },
                }}
              >
                <Box
                  component="img"
                  src={d.img}
                  alt={d.label}
                  sx={{ height: 28, imageRendering: '-webkit-optimize-contrast' }}
                />
                <Typography sx={{ fontSize: '0.65rem', color: 'text.secondary', fontWeight: 500 }}>
                  {d.sub}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Max participants */}
        <Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '12px', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Box component="img" src="/assets/players-icon-500.png" alt="" sx={{ width: 16, height: 16, objectFit: 'contain' }} />
            Max Players
          </Typography>

          {/* Preset buttons */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75 }}>
            <Box
              onClick={() => setMaxBettors(null)}
              sx={{
                flex: 1,
                py: 0.8,
                textAlign: 'center',
                cursor: 'pointer',
                borderRadius: '2px',
                border: maxBettors === null ? `1.5px solid ${t.accent}` : `1.5px solid ${t.border.default}`,
                bgcolor: maxBettors === null ? withAlpha(t.accent, 0.07) : t.hover.subtle,
                transition: 'all 0.15s ease',
                '&:hover': { bgcolor: maxBettors === null ? withAlpha(t.accent, 0.09) : 'rgba(255,255,255,0.05)' },
              }}
            >
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: maxBettors === null ? t.accent : 'text.secondary' }}>
                No limit
              </Typography>
            </Box>
            {PLAYER_PRESETS.map(n => (
              <Box
                key={n}
                onClick={() => setMaxBettors(n)}
                sx={{
                  flex: 1,
                  py: 0.8,
                  textAlign: 'center',
                  cursor: 'pointer',
                  borderRadius: '2px',
                  border: maxBettors === n ? `1.5px solid ${t.up}` : `1.5px solid ${t.border.default}`,
                  bgcolor: maxBettors === n ? withAlpha(t.up, 0.07) : t.hover.subtle,
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: maxBettors === n ? withAlpha(t.up, 0.09) : 'rgba(255,255,255,0.05)' },
                }}
              >
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: maxBettors === n ? t.up : t.text.primary }}>
                  {n}
                </Typography>
              </Box>
            ))}
          </Box>

          {/* +/- stepper for custom value */}
          {maxBettors !== null && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, mt: 1 }}>
              <Box
                component="button"
                onClick={() => setMaxBettors(Math.max(2, (maxBettors ?? 2) - 1))}
                sx={{
                  width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: `1.5px solid ${t.border.strong}`, borderRadius: '50%',
                  cursor: 'pointer', color: t.text.primary,
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: t.up, color: t.up, bgcolor: withAlpha(t.up, 0.06) },
                }}
              >
                <Remove sx={{ fontSize: 16 }} />
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Box component="img" src="/assets/players-icon-500.png" alt="" sx={{ width: 20, height: 20, objectFit: 'contain' }} />
                <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: t.up, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'center' }}>
                  {maxBettors}
                </Typography>
              </Box>
              <Box
                component="button"
                onClick={() => setMaxBettors(Math.min(100, (maxBettors ?? 2) + 1))}
                sx={{
                  width: 32, height: 32,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: 'none', border: `1.5px solid ${t.border.strong}`, borderRadius: '50%',
                  cursor: 'pointer', color: t.text.primary,
                  transition: 'all 0.15s ease',
                  '&:hover': { borderColor: t.up, color: t.up, bgcolor: withAlpha(t.up, 0.06) },
                }}
              >
                <AddIcon sx={{ fontSize: 16 }} />
              </Box>
            </Box>
          )}
        </Box>

        {/* Preview */}
        <Box sx={{ bgcolor: t.hover.light, borderRadius: 1, px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Box
            component="img"
            src={ASSETS.find(a => a.value === asset)?.img}
            alt={asset}
            sx={{ width: 28, height: 28, borderRadius: '50%' }}
          />
          <Box sx={{ flex: 1 }}>
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 600 }}>
              {asset}/USD
            </Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
              {DURATIONS.find(d => d.value === duration)?.label} · {DURATIONS.find(d => d.value === duration)?.sub}
              {maxBettors !== null ? ` · ${maxBettors} players` : ' · No limit'}
            </Typography>
          </Box>
          <Box
            component="img"
            src={DURATIONS.find(d => d.value === duration)?.img}
            alt=""
            sx={{ height: 24, imageRendering: '-webkit-optimize-contrast' }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} sx={{ color: 'text.secondary', textTransform: 'none' }}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={isLoading}
          variant="contained"
          sx={{
            backgroundColor: t.up,
            color: t.text.contrast,
            '&:hover': { backgroundColor: t.up, filter: 'brightness(1.15)' },
            fontWeight: 700,
            textTransform: 'none',
            borderRadius: '2px',
          }}
        >
          {isLoading ? <CircularProgress size={20} /> : 'Create Pool'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
