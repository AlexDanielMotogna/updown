'use client';

import { Box } from '@mui/material';
import { ActionButton } from './ActionButton';
import { Meta } from './typography';

export interface PaginatorProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}

/** Prev / "n / N" / Next pager. Renders nothing when there's a single page. */
export function Paginator({ page, totalPages, onChange }: PaginatorProps) {
  if (totalPages <= 1) return null;
  return (
    <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', alignItems: 'center', mt: 2 }}>
      <ActionButton kind="secondary" label="Previous" disabled={page <= 1} onClick={() => onChange(page - 1)} />
      <Meta>{page} / {totalPages}</Meta>
      <ActionButton kind="secondary" label="Next" disabled={page >= totalPages} onClick={() => onChange(page + 1)} />
    </Box>
  );
}
