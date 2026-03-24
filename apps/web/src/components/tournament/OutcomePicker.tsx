'use client';

import { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { UP_COLOR, DOWN_COLOR, DRAW_COLOR } from '@/lib/constants';

const OUTCOMES = [
  { value: 1, label: 'Home', color: UP_COLOR },
  { value: 2, label: 'Draw', color: DRAW_COLOR },
  { value: 3, label: 'Away', color: DOWN_COLOR },
] as const;

interface Props {
  homeTeam?: string | null;
  awayTeam?: string | null;
  onSubmit: (prediction: number) => Promise<void>;
  disabled?: boolean;
}

export function OutcomePicker({ homeTeam, awayTeam, onSubmit, disabled }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const labels = [homeTeam || 'Home', 'Draw', awayTeam || 'Away'];

  const handleSubmit = async () => {
    if (selected === null) return;
    setSubmitting(true);
    try {
      await onSubmit(selected);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Your Prediction
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {OUTCOMES.map((o, i) => {
          const active = selected === o.value;
          return (
            <Box
              key={o.value}
              onClick={() => !disabled && setSelected(o.value)}
              sx={{
                flex: 1,
                py: 1.25,
                textAlign: 'center',
                borderRadius: '6px',
                cursor: disabled ? 'default' : 'pointer',
                bgcolor: active ? `${o.color}20` : 'rgba(255,255,255,0.04)',
                border: active ? `1px solid ${o.color}40` : '1px solid transparent',
                transition: 'all 0.15s',
                '&:hover': disabled ? {} : { bgcolor: `${o.color}15` },
              }}
            >
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: active ? o.color : 'rgba(255,255,255,0.5)' }}>
                {labels[i]}
              </Typography>
            </Box>
          );
        })}
      </Box>
      <Button
        fullWidth
        variant="contained"
        disabled={selected === null || submitting || disabled}
        onClick={handleSubmit}
        sx={{
          bgcolor: selected ? OUTCOMES.find(o => o.value === selected)?.color : 'rgba(255,255,255,0.06)',
          color: '#000',
          fontWeight: 700,
          fontSize: '0.8rem',
          py: 0.75,
          borderRadius: '6px',
          textTransform: 'none',
          '&:hover': { filter: 'brightness(1.1)' },
          '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
        }}
      >
        {submitting ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Lock Prediction'}
      </Button>
    </Box>
  );
}
