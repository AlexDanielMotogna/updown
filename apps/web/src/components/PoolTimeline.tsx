'use client';

import { Box, Typography, Chip } from '@mui/material';
import { AccessTime, Lock, Visibility, Flag, CheckCircle } from '@mui/icons-material';
import { formatDateTime } from '@/lib/format';
import { UP_COLOR } from '@/lib/constants';

type PoolStatus = 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE';

interface PoolTimelineProps {
  status: PoolStatus;
  createdAt: string;
  lockTime: string;
  startTime: string;
  endTime: string;
}

export function PoolTimeline({ status, createdAt, lockTime, startTime, endTime }: PoolTimelineProps) {
  const isResolved = status === 'RESOLVED' || status === 'CLAIMABLE';

  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        POOL TIMELINE
      </Typography>
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 1.5,
          p: 2,
          borderRadius: 1,
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        {/* Predictions Open */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AccessTime sx={{ fontSize: 18, color: status === 'JOINING' ? '#FFFFFF' : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Predictions Open</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(createdAt)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="OPEN" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', height: 20, fontSize: '0.65rem' }} />
          )}
          {(status === 'ACTIVE' || isResolved) && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Predictions Close */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Lock sx={{ fontSize: 18, color: status === 'ACTIVE' ? '#FFFFFF' : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Predictions Close</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(lockTime)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
          )}
          {status === 'ACTIVE' && (
            <Chip label="CLOSED" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.7)', height: 20, fontSize: '0.65rem' }} />
          )}
          {isResolved && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Pool Monitoring */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Visibility sx={{ fontSize: 18, color: status === 'ACTIVE' ? '#FFFFFF' : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Monitoring</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(startTime)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
          )}
          {status === 'ACTIVE' && (
            <Chip label="LIVE" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', height: 20, fontSize: '0.65rem' }} />
          )}
          {isResolved && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Pool Resolution */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Flag sx={{ fontSize: 18, color: isResolved ? UP_COLOR : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Result</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(endTime)}
          </Typography>
          {(status === 'JOINING' || status === 'ACTIVE') && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem' }} />
          )}
          {isResolved && (
            <Chip label="DONE" size="small" sx={{ bgcolor: `rgba(0, 229, 255, 0.1)`, color: UP_COLOR, height: 20, fontSize: '0.65rem' }} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
