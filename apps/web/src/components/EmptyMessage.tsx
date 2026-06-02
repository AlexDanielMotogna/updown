'use client';

import { Box, Typography, type SxProps, type Theme } from '@mui/material';
import { useThemeTokens } from '@/app/providers';

interface EmptyMessageProps {
  /** Main message rendered with the standardised "not thin" weight. */
  children: React.ReactNode;
  /** Optional secondary line in a lighter weight + colour. */
  hint?: React.ReactNode;
  /** Padding around the block. Defaults to `py: 2`. */
  py?: number;
  /** Override the alignment. Defaults to center. */
  align?: 'left' | 'center' | 'right';
  sx?: SxProps<Theme>;
}

/**
 * Shared empty-state message for "No predictions yet", "No notifications",
 * "No activity", etc.
 *
 * The whole point of this component is the typography weight — every
 * empty-state Typography in the app used to inherit the default 400 weight
 * which read as "AI-generated thin text" in user feedback. Centralising
 * here means a future rebrand only touches one file.
 */
export function EmptyMessage({ children, hint, py = 2, align = 'center', sx }: EmptyMessageProps) {
  const t = useThemeTokens();
  return (
    <Box sx={{ py, textAlign: align, ...sx }}>
      <Typography
        sx={{
          fontSize: '0.85rem',
          fontWeight: 600,
          color: t.text.tertiary,
          lineHeight: 1.4,
        }}
      >
        {children}
      </Typography>
      {hint && (
        <Typography
          sx={{
            fontSize: '0.75rem',
            fontWeight: 500,
            color: t.text.quaternary,
            mt: 0.5,
            lineHeight: 1.4,
          }}
        >
          {hint}
        </Typography>
      )}
    </Box>
  );
}
