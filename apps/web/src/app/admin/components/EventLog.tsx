'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, CircularProgress, TextField,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Button,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';

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

  const params = new URLSearchParams({ page: String(page), limit: '30' });
  if (eventType) params.set('eventType', eventType);
  if (entityType) params.set('entityType', entityType);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-events', page, eventType, entityType],
    queryFn: () => adminFetch<{ data: EventRow[]; meta: { page: number; totalPages: number; total: number } }>(`/events?${params}`),
    refetchInterval: 10000,
  });

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <TextField
          size="small"
          label="Event Type"
          value={eventType}
          onChange={e => { setEventType(e.target.value); setPage(1); }}
          placeholder="e.g. POOL_RESOLVED"
        />
        <TextField
          size="small"
          label="Entity Type"
          value={entityType}
          onChange={e => { setEntityType(e.target.value); setPage(1); }}
          placeholder="e.g. pool, admin"
        />
        {data?.meta && (
          <Typography variant="body2" color="text.secondary" sx={{ alignSelf: 'center' }}>
            {data.meta.total} events
          </Typography>
        )}
      </Box>

      {isLoading ? <CircularProgress /> : (
        <TableContainer component={Card}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Event</TableCell>
                <TableCell>Entity</TableCell>
                <TableCell>Entity ID</TableCell>
                <TableCell>Payload</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data?.data ?? []).map(e => (
                <TableRow key={e.id}>
                  <TableCell sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(e.createdAt).toLocaleString()}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{e.eventType}</TableCell>
                  <TableCell sx={{ fontSize: 12 }}>{e.entityType}</TableCell>
                  <TableCell sx={{ fontSize: 11, cursor: 'pointer', '&:hover': { color: '#F59E0B' } }} onClick={() => navigator.clipboard.writeText(e.entityId)} title="Click to copy">{e.entityId}</TableCell>
                  <TableCell sx={{ fontSize: 10, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {JSON.stringify(e.payload)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {data?.meta && data.meta.totalPages > 1 && (
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center' }}>
          <Button size="small" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
          <Typography variant="body2" sx={{ alignSelf: 'center' }}>{page} / {data.meta.totalPages}</Typography>
          <Button size="small" disabled={page >= data.meta.totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
        </Box>
      )}
    </Box>
  );
}
