'use client';

import { useMemo, useState } from 'react';
import {
  Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  StatusChip, AdminDialog,
  ActionButton, LoadingState, EmptyState,
  FilterBar, IdCell, Body, Meta, Label,
} from '../ui';
import { type PmTag } from './pm-explorer-config';

// ─── Browse Gamma tags modal ────────────────────────────────────────────
export function BrowseGammaTagsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tagFilter, setTagFilter] = useState('');
  const tagsQ = useQuery({
    queryKey: ['admin-pm-tags'],
    queryFn: () => adminFetch<{ data: PmTag[] }>('/polymarket/tags'),
    enabled: open,
  });
  const tags = tagsQ.data?.data ?? [];

  const filtered = useMemo(() => {
    const q = tagFilter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter(t0 =>
      t0.label.toLowerCase().includes(q) ||
      t0.slug.toLowerCase().includes(q) ||
      t0.id.includes(q),
    );
  }, [tags, tagFilter]);

  return (
    <AdminDialog
      open={open}
      onClose={onClose}
      title="Browse Gamma tags"
      maxWidth="md"
      footer={<ActionButton kind="secondary" label="Close" onClick={onClose} />}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        <Meta>
          Active Polymarket tags aggregated from the top-volume events (1h cache).
          Tags wired to a UpDown category show a check; pick an unused tag to add to a
          category from the Categories tab.
        </Meta>
        <FilterBar
          value={tagFilter}
          onChange={setTagFilter}
          placeholder="Filter by label, slug, or id…"
        />
        {tagsQ.isLoading ? (
          <LoadingState variant="block" />
        ) : filtered.length === 0 ? (
          <EmptyState title="No tags match" hint="Clear the filter or refresh - Gamma has 1200+ active tags." />
        ) : (
          <TableContainer sx={{ maxHeight: 460 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell><Label>Tag</Label></TableCell>
                  <TableCell><Label>Slug</Label></TableCell>
                  <TableCell><Label>ID</Label></TableCell>
                  <TableCell align="right"><Label>Events</Label></TableCell>
                  <TableCell><Label>Wired to</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.map(tg => (
                  <TableRow key={tg.id} hover>
                    <TableCell>
                      <Body sx={{ fontSize: '0.82rem', color: t.text.primary }}>{tg.label}</Body>
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.7rem', color: t.text.tertiary }}>
                      {tg.slug}
                    </TableCell>
                    <TableCell><IdCell value={tg.id} truncate={12} /></TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{tg.count}</TableCell>
                    <TableCell>
                      {tg.inUse
                        ? <StatusChip status="ok" label={tg.categoryCode ?? 'used'} />
                        : <Meta>-</Meta>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
    </AdminDialog>
  );
}
