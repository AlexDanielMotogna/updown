'use client';

import { useState } from 'react';
import { Box, Typography, Button, CircularProgress } from '@mui/material';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface Props {
  homeTeam?: string | null;
  awayTeam?: string | null;
  onSubmit: (prediction: number) => Promise<void>;
  disabled?: boolean;
  sideLabels?: string[];
}

export function OutcomePicker({ homeTeam, awayTeam, onSubmit, disabled, sideLabels = ['Home', 'Draw', 'Away'] }: Props) {
  const t = useThemeTokens();
  const [selected, setSelected] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const COLOR_MAP: Record<string, string> = { HOME: t.up, AWAY: t.down, DRAW: t.draw };

  const OUTCOMES = sideLabels.map((sl, i) => {
    const key = sl.toUpperCase();
    return {
      value: i + 1,
      label: key === 'HOME' ? (homeTeam || 'Home') : key === 'AWAY' ? (awayTeam || 'Away') : sl,
      color: COLOR_MAP[key] || t.draw,
    };
  });

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
      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Your Prediction
      </Typography>
      <Box sx={{ display: 'flex', gap: 0.75 }}>
        {OUTCOMES.map((o) => {
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
                bgcolor: active ? withAlpha(o.color, 0.13) : t.hover.default,
                border: active ? `1px solid ${withAlpha(o.color, 0.25)}` : '1px solid transparent',
                transition: 'all 0.15s',
                '&:hover': disabled ? {} : { bgcolor: withAlpha(o.color, 0.08) },
              }}
            >
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: active ? o.color : t.text.secondary }}>
                {o.label}
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
          bgcolor: selected ? OUTCOMES.find(o => o.value === selected)?.color : t.border.default,
          color: t.text.contrast,
          fontWeight: 700,
          fontSize: '0.8rem',
          py: 0.75,
          borderRadius: '6px',
          textTransform: 'none',
          '&:hover': { filter: 'brightness(1.1)' },
          '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
        }}
      >
        {submitting ? <CircularProgress size={18} sx={{ color: 'inherit' }} /> : 'Lock Prediction'}
      </Button>
    </Box>
  );
}
