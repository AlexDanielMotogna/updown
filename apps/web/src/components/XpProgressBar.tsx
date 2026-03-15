'use client';

import { Box, Typography } from '@mui/material';
import { motion } from 'framer-motion';
import { ACCENT_COLOR } from '@/lib/constants';

interface XpProgressBarProps {
  level: number;
  progress: number; // 0 to 1
  totalXp: string;
  xpToNextLevel: string;
}

export function XpProgressBar({ level, progress, totalXp, xpToNextLevel }: XpProgressBarProps) {
  const pct = Math.min(Math.max(progress, 0), 1);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
          Level {level} {level < 40 ? `→ ${level + 1}` : '(MAX)'}
        </Typography>
        <Typography sx={{ fontSize: '0.7rem', color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}>
          {level < 40
            ? `${Number(xpToNextLevel).toLocaleString()} XP to go`
            : `${Number(totalXp).toLocaleString()} XP total`}
        </Typography>
      </Box>
      <Box
        sx={{
          height: 6,
          borderRadius: '3px',
          bgcolor: 'rgba(255,255,255,0.06)',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          style={{
            height: '100%',
            borderRadius: '3px',
            background: `linear-gradient(90deg, ${ACCENT_COLOR}, ${ACCENT_COLOR}CC)`,
          }}
        />
      </Box>
    </Box>
  );
}
