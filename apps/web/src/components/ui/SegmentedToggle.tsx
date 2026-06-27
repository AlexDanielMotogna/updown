'use client';

import { Box, type SxProps } from '@mui/material';
import type { ReactNode } from 'react';
import { useThemeTokens } from '@/app/providers';
import type { ThemeTokens } from '@/lib/theme';

/**
 * Shared toggle primitives — ONE source of truth for the "UpDown" toggle look:
 * a rounded translucent track with the active option filled in the brand accent
 * (cyan by default), dark text on the active pill, dim text on the rest. Matches
 * the terminal's clean aesthetic.
 *
 * - `SegmentedToggle` — 2+ mutually-exclusive options (Simple|Pro, Active|Closed…).
 * - `AppSwitch` — a single on/off switch (cyan when on).
 *
 * Both accept an optional `tokens` override so the always-dark admin panel can
 * pass `darkTokens` instead of the user's selected theme.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  accent,
  size = 'md',
  fullWidth = false,
  disabled = false,
  tokens,
  sx,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Active fill color. Defaults to the brand cyan (`t.up`). */
  accent?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  disabled?: boolean;
  tokens?: ThemeTokens;
  sx?: SxProps;
}) {
  const ctx = useThemeTokens();
  const t = tokens ?? ctx;
  const acc = accent ?? t.up;
  const pad = size === 'sm' ? { px: 1.5, py: 0.5 } : { px: 2.25, py: 0.8 };
  const fs = size === 'sm' ? '0.78rem' : '0.85rem';
  return (
    <Box
      role="tablist"
      sx={{
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        p: 0.5,
        width: fullWidth ? '100%' : 'auto',
        bgcolor: t.hover.light,
        border: `1px solid ${t.border.subtle}`,
        borderRadius: '8px',
        ...(sx as object),
      }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Box
            key={opt.value}
            component="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => !disabled && onChange(opt.value)}
            sx={{
              ...pad,
              flex: fullWidth ? 1 : 'none',
              border: 'none',
              borderRadius: '6px',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              fontSize: fs,
              fontWeight: active ? 700 : 600,
              lineHeight: 1.2,
              whiteSpace: 'nowrap',
              bgcolor: active ? acc : 'transparent',
              color: active ? t.text.contrast : t.text.secondary,
              transition: 'background 0.12s ease, color 0.12s ease, filter 0.12s ease',
              '&:hover': active
                ? { filter: 'brightness(1.08)' }
                : { color: t.text.primary, bgcolor: t.hover.medium },
            }}
          >
            {opt.label}
          </Box>
        );
      })}
    </Box>
  );
}

export function AppSwitch({
  checked,
  onChange,
  disabled = false,
  accent,
  size = 'md',
  tokens,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** On-state track color. Defaults to the brand cyan (`t.up`). */
  accent?: string;
  size?: 'sm' | 'md';
  tokens?: ThemeTokens;
}) {
  const ctx = useThemeTokens();
  const t = tokens ?? ctx;
  const acc = accent ?? t.up;
  const W = size === 'sm' ? 32 : 38;
  const H = size === 'sm' ? 18 : 22;
  const knob = H - 6;
  return (
    <Box
      component="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      sx={{
        position: 'relative',
        width: W,
        height: H,
        flexShrink: 0,
        p: 0,
        border: 'none',
        borderRadius: H,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        bgcolor: checked ? acc : t.border.emphasis,
        transition: 'background 0.18s ease',
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 3,
          left: checked ? W - knob - 3 : 3,
          width: knob,
          height: knob,
          borderRadius: '50%',
          bgcolor: checked ? t.text.contrast : t.text.vivid,
          boxShadow: '0 1px 2px rgba(0,0,0,0.45)',
          transition: 'left 0.18s ease, background 0.18s ease',
        }}
      />
    </Box>
  );
}
