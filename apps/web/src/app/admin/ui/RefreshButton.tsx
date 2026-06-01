'use client';

/**
 * Icon-only refresh button with consistent tooltip + spinning state.
 * Replaces four separate refresh-button styles scattered across tabs.
 */
import { IconButton, Tooltip, CircularProgress } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { darkTokens as t } from '@/lib/theme';

export interface RefreshButtonProps {
  onRefresh: () => void;
  isFetching: boolean;
  tooltipLabel?: string;
  disabled?: boolean;
}

export function RefreshButton({ onRefresh, isFetching, tooltipLabel = 'Refresh', disabled }: RefreshButtonProps) {
  return (
    <Tooltip title={tooltipLabel}>
      <span>
        <IconButton
          size="small"
          onClick={onRefresh}
          disabled={disabled || isFetching}
          sx={{ color: t.text.tertiary, '&:hover': { color: t.text.primary, bgcolor: t.hover.subtle } }}
        >
          {isFetching
            ? <CircularProgress size={16} thickness={5} sx={{ color: 'inherit' }} />
            : <RefreshIcon sx={{ fontSize: 18 }} />}
        </IconButton>
      </span>
    </Tooltip>
  );
}
