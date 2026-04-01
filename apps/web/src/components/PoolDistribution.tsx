'use client';

import { Box, Typography } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { AnimatedValue } from './AnimatedValue';

interface PoolDistributionProps {
  totalUp: string;
  totalDown: string;
  totalPool: string;
  betCount: number;
}

export function PoolDistribution({ totalUp, totalDown, totalPool, betCount }: PoolDistributionProps) {
  const t = useThemeTokens();

  const up = Number(totalUp);
  const down = Number(totalDown);
  const total = up + down;
  const upPct = total > 0 ? (up / total) * 100 : 50;
  const downPct = 100 - upPct;
  const upDominant = upPct >= 50;

  return (
    <Box sx={{ mb: 5 }}>
      <Typography variant="caption" sx={{ color: 'text.secondary', mb: 2, display: 'block' }}>
        POOL DISTRIBUTION
      </Typography>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TrendingUp sx={{ color: t.up, fontSize: 20 }} />
          <Typography sx={{ color: t.up, fontWeight: 500 }}>
            UP <AnimatedValue usdcValue={totalUp} prefix="$" />
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ color: t.down, fontWeight: 500 }}>
            DOWN <AnimatedValue usdcValue={totalDown} prefix="$" />
          </Typography>
          <TrendingDown sx={{ color: t.down, fontSize: 20 }} />
        </Box>
      </Box>

      {/* Percentages */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.75 }}>
        <Typography variant="caption" sx={{ color: t.up, fontWeight: upDominant ? 700 : 500, fontSize: '0.75rem' }}>
          {upPct.toFixed(0)}%
        </Typography>
        <Typography variant="caption" sx={{ color: t.down, fontWeight: !upDominant ? 700 : 500, fontSize: '0.75rem' }}>
          {downPct.toFixed(0)}%
        </Typography>
      </Box>

      {/* Bar */}
      <Box
        sx={{
          position: 'relative',
          height: 14,
          borderRadius: '3px',
          overflow: 'hidden',
          background: `linear-gradient(90deg, ${withAlpha(t.down, 0.08)}, ${withAlpha(t.down, 0.19)}, ${withAlpha(t.down, 0.13)})`,
          mb: 3,
        }}
      >
        {/* UP side */}
        <motion.div
          animate={{ width: `${upPct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 18 }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            height: '100%',
            borderRadius: '3px',
            background: `linear-gradient(90deg, ${withAlpha(t.up, 0.38)}, ${t.up}, ${withAlpha(t.up, 0.80)})`,
            boxShadow: upDominant ? `0 0 16px ${withAlpha(t.up, 0.25)}, inset 0 1px 0 ${t.border.hover}` : `inset 0 1px 0 rgba(255,255,255,0.15)`,
          }}
        >
          {/* Shimmer overlay */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.18) 40%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.18) 60%, transparent 100%)',
              backgroundSize: '250% 100%',
              animation: 'barShimmer 3s infinite linear',
              '@keyframes barShimmer': {
                '0%': { backgroundPosition: '-250% 0' },
                '100%': { backgroundPosition: '250% 0' },
              },
            }}
          />
          {/* Top highlight */}
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: '40%',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.12), transparent)',
              borderRadius: '3px 3px 0 0',
            }}
          />
        </motion.div>

        {/* DOWN glow on right when dominant */}
        {!upDominant && (
          <Box
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              bottom: 0,
              width: `${downPct}%`,
              boxShadow: `inset 0 0 12px ${withAlpha(t.down, 0.15)}`,
              borderRadius: '0 3px 3px 0',
              pointerEvents: 'none',
            }}
          />
        )}

        {/* Center clash line */}
        <motion.div
          animate={{ left: `${upPct}%` }}
          transition={{ type: 'spring', stiffness: 100, damping: 18 }}
          style={{
            position: 'absolute',
            top: -2,
            bottom: -2,
            width: 2,
            marginLeft: -1,
            background: t.text.secondary,
            boxShadow: `0 0 8px ${t.text.dimmed}`,
            borderRadius: 1,
            zIndex: 2,
          }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', flex: 1 }}>
          <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
            Total Pool
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            <AnimatedValue usdcValue={totalPool} prefix="$" />
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
