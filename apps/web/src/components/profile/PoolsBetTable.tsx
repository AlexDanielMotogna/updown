'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { InfoOutlined } from '@mui/icons-material';
import { BetRow, BetRowSkeleton } from '@/components/profile/BetRow';
import type { Bet } from '@/lib/api';
import { useThemeTokens } from '@/app/providers';

const TABLE_HEADERS = [
  { label: '', tip: '' },
  { label: 'Asset', tip: 'Cryptocurrency and pool timeframe' },
  { label: 'Result', tip: 'Whether your prediction was correct' },
  { label: 'Stake', tip: 'USDC amount you placed on this pool' },
  { label: 'Payout', tip: 'USDC received after fees (winners only)' },
  { label: 'Price', tip: 'Strike price at open vs final price at close' },
  { label: 'Time', tip: 'When the pool was resolved' },
  { label: 'Action', tip: '' },
  { label: 'Tx', tip: 'View transaction on Solana Explorer' },
];

interface PoolsBetTableProps {
  bets: Bet[];
  betsLoading: boolean;
  claimingBetId: string | null;
  onClaim: (poolId: string, betId: string) => void;
}

export function PoolsBetTable({ bets, betsLoading, claimingBetId, onClaim }: PoolsBetTableProps) {
  const t = useThemeTokens();
  if (betsLoading) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <BetRowSkeleton key={i} />
        ))}
      </Box>
    );
  }

  if (bets.length === 0) {
    return (
      <Box sx={{ textAlign: 'center', py: 12, px: 4 }}>
        <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
          No predictions yet
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {/* Table header (desktop only) */}
      <Box
        sx={{
          display: { xs: 'none', md: 'grid' },
          gridTemplateColumns: '80px 2.5fr 1fr 1fr 1fr 2fr 1fr 1fr 1.2fr',
          px: 0,
          py: 1,
          bgcolor: t.bg.surfaceAlt,
        }}
      >
        {TABLE_HEADERS.map((h, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
              {h.label}
            </Typography>
            {h.tip && (
              <Tooltip title={h.tip} arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: t.bg.tooltip, border: `1px solid ${t.border.strong}`, fontSize: '0.75rem' } }, arrow: { sx: { color: t.bg.tooltip } } }}>
                <InfoOutlined sx={{ fontSize: 11, color: t.text.muted, cursor: 'help', '&:hover': { color: t.text.secondary }, transition: 'color 0.15s' }} />
              </Tooltip>
            )}
          </Box>
        ))}
      </Box>

      {/* Rows */}
      {bets.map((bet) => (
        <BetRow
          key={bet.id}
          bet={bet}
          onClaim={() => onClaim(bet.pool.id, bet.id)}
          isClaiming={claimingBetId === bet.id}
        />
      ))}
    </Box>
  );
}
