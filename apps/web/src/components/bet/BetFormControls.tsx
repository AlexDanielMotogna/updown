'use client';

import { Box, Button, TextField, Tooltip, Typography, CircularProgress, type SxProps } from '@mui/material';
import type { ReactNode } from 'react';
import { useThemeTokens } from '@/app/providers';

/**
 * Shared bet-form primitives — ONE source of truth for the bet card look,
 * styled after the sports/PM cards (simple: 5px radius, weights 600–700, no
 * uppercase). Both the crypto PlaceBetCard and the sports/PM forms can compose
 * these so fonts/weights/sizes/radii stay identical across pool types.
 */

const RADIUS = '5px';

/** Row of preset-amount chips (e.g. $10 $50 $100 $500). */
export function BetPresetRow({
  presets,
  amount,
  onSelect,
  disabled,
}: {
  presets: number[];
  amount: string;
  onSelect: (value: number) => void;
  disabled?: boolean;
}) {
  const t = useThemeTokens();
  return (
    <Box sx={{ display: 'flex', gap: 0.5 }}>
      {presets.map((p) => {
        const active = amount === String(p);
        return (
          <Button
            key={p}
            size="small"
            onClick={() => onSelect(p)}
            disabled={disabled}
            sx={{
              flex: 1,
              minWidth: 0,
              py: 0.5,
              fontSize: '0.75rem',
              fontWeight: 600,
              bgcolor: active ? t.hover.emphasis : t.border.subtle,
              color: active ? t.text.primary : t.text.secondary,
              textTransform: 'none',
              borderRadius: RADIUS,
              '&:hover': { bgcolor: t.hover.strong },
              '&:disabled': { bgcolor: t.hover.subtle, color: t.text.muted },
            }}
          >
            ${p}
          </Button>
        );
      })}
    </Box>
  );
}

/** Amount input — simple, sports-style. `onChange` receives the raw event so
 *  callers keep their own validation (crypto's 2-decimal regex, etc.). */
export function BetAmountInput({
  value,
  onChange,
  disabled,
  placeholder = 'Amount (USDC)',
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = useThemeTokens();
  return (
    <TextField
      fullWidth
      size="small"
      placeholder={placeholder}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={onChange}
      disabled={disabled}
      sx={{
        '& .MuiInputBase-root': { bgcolor: t.border.subtle, borderRadius: RADIUS },
        '& .MuiOutlinedInput-notchedOutline': { border: 'none' },
        '& .MuiInputBase-input': {
          color: t.text.primary,
          fontSize: '0.9rem',
          fontVariantNumeric: 'tabular-nums',
        },
      }}
    />
  );
}

/** Container for the payout/odds preview (sports-style box). */
export function BetPayoutBox({ children, sx }: { children: ReactNode; sx?: SxProps }) {
  const t = useThemeTokens();
  return (
    <Box sx={{ py: 1.25, px: 1.5, bgcolor: t.hover.light, borderRadius: RADIUS, display: 'flex', flexDirection: 'column', gap: 0.5, ...(sx as object) }}>
      {children}
    </Box>
  );
}

/** A single label/value row used inside BetPayoutBox. Optional tooltip on the
 *  label keeps the help-text affordance the crypto card had. */
export function BetStatRow({
  label,
  value,
  valueColor,
  emphasize,
  labelTooltip,
}: {
  label: string;
  value: ReactNode;
  valueColor?: string;
  emphasize?: boolean;
  labelTooltip?: string;
}) {
  const t = useThemeTokens();
  const labelNode = (
    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.tertiary, cursor: labelTooltip ? 'help' : 'default' }}>
      {label}
    </Typography>
  );
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      {labelTooltip ? <Tooltip arrow placement="top" title={labelTooltip}>{labelNode}</Tooltip> : labelNode}
      <Typography sx={{ fontSize: emphasize ? '0.85rem' : '0.8rem', fontWeight: 700, color: valueColor ?? t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

/** Primary submit/place button — sports-style (normal case, weight 700, 5px). */
export function BetSubmitButton({
  label,
  color,
  disabled,
  loading,
  type = 'button',
  onClick,
}: {
  label: string;
  color: string;
  disabled?: boolean;
  loading?: boolean;
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  const t = useThemeTokens();
  return (
    <Button
      type={type}
      variant="contained"
      fullWidth
      disabled={disabled}
      onClick={onClick}
      startIcon={loading ? <CircularProgress size={15} thickness={5} sx={{ color: 'inherit' }} /> : null}
      sx={{
        py: 1.1,
        fontSize: '0.8rem',
        fontWeight: 700,
        borderRadius: RADIUS,
        textTransform: 'none',
        bgcolor: color,
        color: t.text.contrast,
        boxShadow: 'none',
        '&:hover': { bgcolor: color, filter: 'brightness(1.15)', boxShadow: 'none' },
        '&:disabled': { bgcolor: t.hover.medium, color: t.text.muted },
      }}
    >
      {label}
    </Button>
  );
}
