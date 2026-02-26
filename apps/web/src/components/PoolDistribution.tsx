'use client';

import { Box, Typography } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { formatUSDC } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR } from '@/lib/constants';

interface PoolDistributionProps {
  totalUp: string;
  totalDown: string;
  totalPool: string;
  betCount: number;
}

export function PoolDistribution({ totalUp, totalDown, totalPool, betCount }: PoolDistributionProps) {
  const up = Number(totalUp);
  const down = Number(totalDown);
  const total = up + down;
  const upPercentage = total > 0 ? (up / total) * 100 : 50;

  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        POOL DISTRIBUTION
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp sx={{ color: UP_COLOR, fontSize: 20 }} />
          <Typography sx={{ color: UP_COLOR, fontWeight: 500 }}>
            UP {formatUSDC(totalUp)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ color: DOWN_COLOR, fontWeight: 500 }}>
            DOWN {formatUSDC(totalDown)}
          </Typography>
          <TrendingDown sx={{ color: DOWN_COLOR, fontSize: 20 }} />
        </Box>
      </Box>

      {/* Progress bar */}
      <Box
        sx={{
          position: 'relative',
          height: 10,
          borderRadius: 1,
          overflow: 'hidden',
          backgroundColor: 'rgba(255, 82, 82, 0.3)',
          mb: 3,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            width: `${upPercentage}%`,
            background: UP_COLOR,
            borderRadius: 1,
            transition: 'width 0.5s ease',
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
            Total Pool
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {formatUSDC(totalPool)}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
            Participants
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {betCount}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
