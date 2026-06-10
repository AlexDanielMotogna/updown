'use client';

import { useState } from 'react';
import { Box, TextField } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, AdminDialog, ActionButton, LoadingState, EmptyState,
  IdCell, TimeCell, Meta, Label, Body,
  DataTable, type Column, Paginator,
  POLL_FAST_MS,
} from '../ui';

interface EventRow {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function EventLog() {
  const [page, setPage] = useState(1);
  const [eventType, setEventType] = useState('');
  const [entityType, setEntityType] = useState('');
  // Expandable row pattern from PLAN-ADMIN-REFACTOR.md §3.7: payload as
  // ellipsis in the cell, click → full JSON in a dialog. Long-term the
  // backend should ship a typed event taxonomy; the dialog stays useful
  // either way.
  const [openPayload, setOpenPayload] = useState<EventRow | null>(null);

  const params = new URLSearchParams({ page: String(page), limit: '30' });
  if (eventType) params.set('eventType', eventType);
  if (entityType) params.set('entityType', entityType);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events', page, eventType, entityType],
    queryFn: () => adminFetch<{ data: EventRow[]; meta: { page: number; totalPages: number; total: number } }>(`/events?${params}`),
    refetchInterval: POLL_FAST_MS,
  });

  const rows = data?.data ?? [];

  const columns: Column<EventRow>[] = [
    { key: 'time', header: 'Time', nowrap: true, render: e => <TimeCell value={e.createdAt} mode="datetime" /> },
    { key: 'event', header: 'Event', render: e => <Body sx={{ fontSize: '0.78rem', color: t.text.primary }}>{e.eventType}</Body> },
    { key: 'entity', header: 'Entity', render: e => <Meta>{e.entityType}</Meta> },
    { key: 'entityId', header: 'Entity ID', render: e => <IdCell value={e.entityId} truncate={12} /> },
    {
      key: 'payload', header: 'Payload',
      cellSx: {
        fontSize: '0.7rem', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        color: t.text.tertiary,
      },
      render: e => JSON.stringify(e.payload),
    },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard
        title="Event log"
        subtitle={data?.meta ? `${data.meta.total.toLocaleString()} events, page ${data.meta.page} of ${data.meta.totalPages}` : undefined}
      >
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          <TextField
            size="small"
            label="Event type"
            value={eventType}
            onChange={e => { setEventType(e.target.value); setPage(1); }}
            placeholder="e.g. POOL_RESOLVED"
            sx={{ minWidth: 200 }}
          />
          <TextField
            size="small"
            label="Entity type"
            value={entityType}
            onChange={e => { setEntityType(e.target.value); setPage(1); }}
            placeholder="e.g. pool, admin"
            sx={{ minWidth: 180 }}
          />
        </Box>

        {isLoading ? (
          <LoadingState variant="block" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No events match the current filter"
            hint="Clear the Event type / Entity type fields to see all recent events."
          />
        ) : (
          <DataTable columns={columns} rows={rows} getRowKey={e => e.id} onRowClick={setOpenPayload} />
        )}

        <Paginator page={page} totalPages={data?.meta?.totalPages ?? 1} onChange={setPage} />
      </SectionCard>

      <AdminDialog
        open={!!openPayload}
        onClose={() => setOpenPayload(null)}
        title={openPayload ? `${openPayload.eventType}` : 'Payload'}
        maxWidth="md"
        footer={<ActionButton kind="secondary" label="Close" onClick={() => setOpenPayload(null)} />}
      >
        {openPayload && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 0.75, alignItems: 'center' }}>
              <Label>Time</Label><TimeCell value={openPayload.createdAt} mode="datetime" />
              <Label>Entity</Label><Body>{openPayload.entityType}</Body>
              <Label>Entity ID</Label><IdCell value={openPayload.entityId} />
            </Box>
            <Box
              component="pre"
              sx={{
                m: 0, p: 1.25, borderRadius: 1,
                bgcolor: t.bg.surfaceAlt,
                border: `1px solid ${t.border.subtle}`,
                fontSize: '0.72rem',
                color: t.text.primary,
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                maxHeight: 480, overflow: 'auto',
              }}
            >
              {JSON.stringify(openPayload.payload, null, 2)}
            </Box>
          </Box>
        )}
      </AdminDialog>
    </Box>
  );
}
