'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, CircularProgress, Button,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';

interface FinanceData {
  data: {
    totalVolume: string;
    totalPayouts: string;
    totalFeesCollected: string;
    totalBets: number;
    authorityUsdcBalance: string | null;
    authorityUsdcDisplay: string | null;
    poolStatusCounts: Record<string, number>;
    closures: {
      totalPoolsClosed: number;
      totalRentReclaimedLamports: number;
      totalRentReclaimedSol: string;
    };
  };
}

interface ClosureRow {
  id: string;
  poolId: string;
  payload: {
    asset?: string;
    interval?: string;
    totalPool?: string;
    betCount?: string;
    winner?: string;
    rentReclaimedSol?: string;
    rentReclaimedLamports?: string;
    txSignature?: string;
    source?: string;
    [key: string]: string | undefined;
  };
  closedAt: string;
}

interface ClosuresData {
  data: ClosureRow[];
  meta: { page: number; totalPages: number; total: number };
}

function formatUsdc(raw: string): string {
  const n = Number(raw) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialOverview() {
  const [closuresPage, setClosuresPage] = useState(1);
  const [showClosures, setShowClosures] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-finance'],
    queryFn: () => adminFetch<FinanceData>('/finance/overview'),
    refetchInterval: 30000,
  });

  const { data: closuresData, isLoading: closuresLoading } = useQuery({
    queryKey: ['admin-closures', closuresPage],
    queryFn: () => adminFetch<ClosuresData>(`/finance/closures?page=${closuresPage}&limit=20`),
    enabled: showClosures,
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Typography color="error">{(error as Error).message}</Typography>;

  const f = data!.data;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* Stats cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 2 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">TOTAL VOLUME (USDC)</Typography>
          <Typography variant="h5" fontWeight={600}>{formatUsdc(f.totalVolume)}</Typography>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">TOTAL PAYOUTS (USDC)</Typography>
          <Typography variant="h5" fontWeight={600}>{formatUsdc(f.totalPayouts)}</Typography>
        </Card>
        <Card sx={{ p: 2.5, border: '1px solid rgba(34,197,94,0.3)' }}>
          <Typography variant="caption" color="success.main">FEES COLLECTED (USDC)</Typography>
          <Typography variant="h5" fontWeight={600} color="success.main">{formatUsdc(f.totalFeesCollected)}</Typography>
          <Typography variant="caption" color="text.secondary">Calculated from claimed bets</Typography>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">TOTAL BETS</Typography>
          <Typography variant="h5" fontWeight={600}>{f.totalBets.toLocaleString()}</Typography>
        </Card>
        <Card sx={{ p: 2.5, border: '1px solid rgba(245,158,11,0.3)' }}>
          <Typography variant="caption" color="warning.main">AUTHORITY USDC (ON-CHAIN)</Typography>
          <Typography variant="h5" fontWeight={600} color="warning.main">{f.authorityUsdcDisplay ?? 'N/A'}</Typography>
          <Typography variant="caption" color="text.secondary">Fee wallet balance</Typography>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary">NET REVENUE</Typography>
          <Typography variant="h5" fontWeight={600}>
            {formatUsdc(String(BigInt(f.totalVolume) - BigInt(f.totalPayouts)))}
          </Typography>
          <Typography variant="caption" color="text.secondary">Volume - Payouts (includes unclaimed)</Typography>
        </Card>
      </Box>

      {/* Pool closures summary + status breakdown */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">POOL CLOSURES</Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 1 }}>
            <Box>
              <Typography variant="body2" color="text.secondary">Pools Closed</Typography>
              <Typography variant="h6">{f.closures.totalPoolsClosed}</Typography>
            </Box>
            <Box>
              <Typography variant="body2" color="text.secondary">Rent Reclaimed</Typography>
              <Typography variant="h6">{f.closures.totalRentReclaimedSol} SOL</Typography>
            </Box>
          </Box>
          <Button size="small" variant="outlined" onClick={() => setShowClosures(!showClosures)}>
            {showClosures ? 'Hide Details' : 'View Closed Pools'}
          </Button>
        </Card>
        <Card sx={{ p: 2.5 }}>
          <Typography variant="caption" color="text.secondary" gutterBottom display="block">POOL STATUS BREAKDOWN</Typography>
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {Object.entries(f.poolStatusCounts).map(([status, count]) => (
              <Box key={status}>
                <Typography variant="body2" color="text.secondary">{status}</Typography>
                <Typography variant="h6">{count}</Typography>
              </Box>
            ))}
          </Box>
        </Card>
      </Box>

      {/* Closures table */}
      {showClosures && (
        <Card sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>Closed Pools History</Typography>
          {closuresLoading ? <CircularProgress size={24} /> : (
            <>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Closed At</TableCell>
                      <TableCell>Pool ID</TableCell>
                      <TableCell>Asset</TableCell>
                      <TableCell>Interval</TableCell>
                      <TableCell>Total Pool</TableCell>
                      <TableCell>Bets</TableCell>
                      <TableCell>Winner</TableCell>
                      <TableCell>Rent Reclaimed</TableCell>
                      <TableCell>TX</TableCell>
                      <TableCell>Source</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(closuresData?.data ?? []).map(c => (
                      <TableRow key={c.id}>
                        <TableCell sx={{ fontSize: 11, whiteSpace: 'nowrap' }}>{new Date(c.closedAt).toLocaleString()}</TableCell>
                        <TableCell
                          sx={{ fontSize: 11, cursor: 'pointer', '&:hover': { color: '#F59E0B' } }}
                          onClick={() => navigator.clipboard.writeText(c.poolId)}
                          title="Click to copy"
                        >{c.poolId}</TableCell>
                        <TableCell>{c.payload.asset ?? '—'}</TableCell>
                        <TableCell>{c.payload.interval ?? '—'}</TableCell>
                        <TableCell>{c.payload.totalPool ? formatUsdc(c.payload.totalPool) : '0'}</TableCell>
                        <TableCell>{c.payload.betCount ?? '0'}</TableCell>
                        <TableCell>
                          {c.payload.winner && c.payload.winner !== 'none' ? (
                            <Chip label={c.payload.winner} size="small" sx={{ fontSize: 11, bgcolor: c.payload.winner === 'UP' ? '#22C55E22' : '#F8717122', color: c.payload.winner === 'UP' ? '#22C55E' : '#F87171' }} />
                          ) : '—'}
                        </TableCell>
                        <TableCell sx={{ color: '#22C55E', fontWeight: 500 }}>{c.payload.rentReclaimedSol ?? '0'} SOL</TableCell>
                        <TableCell sx={{ fontSize: 10 }}>
                          {c.payload.txSignature ? (
                            <a
                              href={`https://explorer.solana.com/tx/${c.payload.txSignature}?cluster=devnet`}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#3B82F6', textDecoration: 'none' }}
                            >
                              {c.payload.txSignature.slice(0, 8)}...
                            </a>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <Chip label={c.payload.source === 'admin' ? 'Admin' : 'Auto'} size="small" variant="outlined" sx={{ fontSize: 10 }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              {closuresData?.meta && closuresData.meta.totalPages > 1 && (
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1 }}>
                  <Button size="small" disabled={closuresPage <= 1} onClick={() => setClosuresPage(p => p - 1)}>Prev</Button>
                  <Typography variant="body2" sx={{ alignSelf: 'center' }}>{closuresPage} / {closuresData.meta.totalPages}</Typography>
                  <Button size="small" disabled={closuresPage >= closuresData.meta.totalPages} onClick={() => setClosuresPage(p => p + 1)}>Next</Button>
                </Box>
              )}
            </>
          )}
        </Card>
      )}
    </Box>
  );
}
