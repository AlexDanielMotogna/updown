'use client';

import { Box, Typography, Chip } from '@mui/material';
import { AccessTime, Lock, Visibility, Flag, CheckCircle } from '@mui/icons-material';
import { formatDateTime } from '@/lib/format';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

type PoolStatus = 'UPCOMING' | 'JOINING' | 'ACTIVE' | 'RESOLVED' | 'CLAIMABLE';

interface PoolTimelineProps {
  status: PoolStatus;
  createdAt: string;
  lockTime: string;
  startTime: string;
  endTime: string;
}

export function PoolTimeline({ status, createdAt, lockTime, startTime, endTime }: PoolTimelineProps) {
  const t = useThemeTokens();
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
          gap: { xs: 1, sm: 1.5 },
          p: 2,
          borderRadius: 0,
          background: t.hover.subtle,
          border: 'none',
        }}
      >
        {/* Predictions Open */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AccessTime sx={{ fontSize: 18, color: status === 'JOINING' ? t.text.primary : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Predictions Open</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(createdAt)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="OPEN" size="small" sx={{ bgcolor: t.hover.emphasis, color: t.text.primary, height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {(status === 'ACTIVE' || isResolved) && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Predictions Close */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Lock sx={{ fontSize: 18, color: status === 'ACTIVE' ? t.text.primary : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Predictions Close</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(lockTime)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {status === 'ACTIVE' && (
            <Chip label="CLOSED" size="small" sx={{ bgcolor: t.hover.strong, color: t.text.bright, height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {isResolved && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Pool Monitoring */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Visibility sx={{ fontSize: 18, color: status === 'ACTIVE' ? t.text.primary : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Monitoring</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(startTime)}
          </Typography>
          {status === 'JOINING' && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {status === 'ACTIVE' && (
            <Chip label="LIVE" size="small" sx={{ bgcolor: t.hover.emphasis, color: t.text.primary, height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {isResolved && (
            <CheckCircle sx={{ fontSize: 16, color: 'text.secondary' }} />
          )}
        </Box>

        {/* Pool Resolution */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Flag sx={{ fontSize: 18, color: isResolved ? t.up : 'text.secondary' }} />
          <Box sx={{ flex: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>Result</Typography>
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
            {formatDateTime(endTime)}
          </Typography>
          {(status === 'JOINING' || status === 'ACTIVE') && (
            <Chip label="PENDING" size="small" sx={{ bgcolor: 'rgba(255, 255, 255, 0.05)', color: 'text.secondary', height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
          {isResolved && (
            <Chip label="DONE" size="small" sx={{ bgcolor: withAlpha(t.up, 0.10), color: t.up, height: 20, fontSize: '0.65rem', borderRadius: '2px' }} />
          )}
        </Box>
      </Box>
    </Box>
  );
}
