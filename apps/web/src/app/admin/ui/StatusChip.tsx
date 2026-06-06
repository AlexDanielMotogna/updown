'use client';

/**
 * One chip primitive for every status in the admin. Two separately-
 * defined `StatusChip` components and a `statusChip()` function used to
 * live in SystemHealth, CategoryManagement, and MatchExplorer - all gone
 * now. Pick a semantic `status` and the colour is fixed via STATUS_PALETTE.
 *
 * See PLAN-ADMIN-REFACTOR.md Phase 2.
 */
import { Chip, type ChipProps } from '@mui/material';
import { withAlpha } from '@/lib/theme';
import { STATUS_PALETTE, type StatusKind } from './tokens';

export interface StatusChipProps extends Omit<ChipProps, 'color' | 'label'> {
  status: StatusKind;
  label?: string;
}

export function StatusChip({ status, label, sx, ...rest }: StatusChipProps) {
  const tone = STATUS_PALETTE[status];
  return (
    <Chip
      size="small"
      label={label ?? tone.label}
      {...rest}
      sx={{
        height: 22,
        fontSize: '0.7rem',
        fontWeight: 600,
        bgcolor: withAlpha(tone.bg, 0.15),
        color: tone.fg,
        borderRadius: 1,
        ...sx,
      }}
    />
  );
}
