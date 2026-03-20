'use client';

import { Box, Card, Typography, CircularProgress } from '@mui/material';
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
  };
}

function formatUsdc(raw: string): string {
  const n = Number(raw) / 1e6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinancialOverview() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-finance'],
    queryFn: () => adminFetch<FinanceData>('/finance/overview'),
    refetchInterval: 30000,
  });

  if (isLoading) return <CircularProgress />;
  if (error) return <Typography color="error">{(error as Error).message}</Typography>;

  const f = data!.data;

  return (
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
      <Card sx={{ p: 2.5, gridColumn: { md: '1 / -1' } }}>
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
  );
}
