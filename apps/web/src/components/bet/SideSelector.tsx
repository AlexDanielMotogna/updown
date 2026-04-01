'use client';

import {
  Box,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

export interface SideSelectorProps {
  side: 'UP' | 'DOWN';
  onSideChange: (event: React.MouseEvent, newSide: 'UP' | 'DOWN' | null) => void;
  currentOddsUp: number;
  currentOddsDown: number;
  totalUp: number;
  totalDown: number;
  tugTotal: number;
  disabled?: boolean;
}

export function SideSelector({
  side,
  onSideChange,
  currentOddsUp,
  currentOddsDown,
  totalUp,
  totalDown,
  tugTotal,
}: SideSelectorProps) {
  const t = useThemeTokens();

  return (
    <>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mb: 1.5, display: 'block', textAlign: 'center', letterSpacing: '0.15em' }}
      >
        CHOOSE YOUR SIDE
      </Typography>
      <ToggleButtonGroup
        value={side}
        exclusive
        onChange={onSideChange}
        fullWidth
        sx={{
          mb: 1.5,
          gap: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          '& .MuiToggleButtonGroup-grouped': {
            border: 'none !important',
            borderRadius: '5px !important',
          },
        }}
      >
        {/* UP Panel */}
        <ToggleButton
          value="UP"
          component={motion.button}
          {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
          sx={{
            py: { xs: 2.5, sm: 3.5 },
            px: { xs: 1.5, sm: 2 },
            flexDirection: 'column',
            gap: 0.5,
            transition: 'background 0.2s ease, opacity 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            ...(side === 'UP'
              ? {
                  background: withAlpha(t.up, 0.07),
                  boxShadow: `0 0 30px ${withAlpha(t.up, 0.13)}, inset 0 0 30px ${withAlpha(t.up, 0.03)}`,
                  '&:hover': { background: withAlpha(t.up, 0.10) },
                }
              : {
                  opacity: 0.45,
                  background: t.hover.subtle,
                  '&:hover': { opacity: 0.7, background: t.hover.default },
                }),
            '&.Mui-selected': {
              background: withAlpha(t.up, 0.07),
              '&:hover': { background: withAlpha(t.up, 0.10) },
            },
          }}
        >
          <TrendingUp sx={{ fontSize: 40, color: side === 'UP' ? t.up : 'text.secondary' }} />
          <Typography
            variant="h5"
            sx={{ color: side === 'UP' ? t.up : 'text.primary', fontWeight: 700, letterSpacing: '0.05em' }}
          >
            UP
          </Typography>
          <Box
            sx={{
              px: 1.5,
              py: 0.25,
              borderRadius: '2px',
              bgcolor: side === 'UP' ? withAlpha(t.up, 0.09) : t.hover.medium,
            }}
          >
            <Typography variant="body2" sx={{ color: side === 'UP' ? t.up : 'text.secondary', fontWeight: 600 }}>
              {currentOddsUp.toFixed(2)}x
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            {tugTotal > 0 ? `$${totalUp.toFixed(0)} pooled` : 'No predictions yet'}
          </Typography>
        </ToggleButton>

        {/* VS Divider */}
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: { xs: 40, sm: 48 },
            pointerEvents: 'none',
          }}
        >
          {/* Vertical glowing line */}
          <Box
            sx={{
              position: 'absolute',
              top: 8,
              bottom: 8,
              width: '2px',
              background: `linear-gradient(to bottom, transparent, ${withAlpha(t.up, 0.25)}, ${t.text.muted}, ${withAlpha(t.down, 0.25)}, transparent)`,
              filter: 'blur(0.5px)',
            }}
          />
          {/* Lightning VS badge */}
          <Box
            sx={{
              position: 'relative',
              zIndex: 1,
              width: 36,
              height: 36,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: t.hover.medium,
              boxShadow: `0 0 16px ${t.hover.medium}`,
            }}
          >
            <Typography sx={{ fontSize: '1rem', lineHeight: 1 }}>&#9889;</Typography>
          </Box>
        </Box>

        {/* DOWN Panel */}
        <ToggleButton
          value="DOWN"
          component={motion.button}
          {...({ whileTap: { scale: 0.97 } } as Record<string, unknown>)}
          sx={{
            py: { xs: 2.5, sm: 3.5 },
            px: { xs: 1.5, sm: 2 },
            flexDirection: 'column',
            gap: 0.5,
            transition: 'background 0.2s ease, opacity 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
            ...(side === 'DOWN'
              ? {
                  background: withAlpha(t.down, 0.07),
                  boxShadow: `0 0 30px ${withAlpha(t.down, 0.13)}, inset 0 0 30px ${withAlpha(t.down, 0.03)}`,
                  '&:hover': { background: withAlpha(t.down, 0.10) },
                }
              : {
                  opacity: 0.45,
                  background: t.hover.subtle,
                  '&:hover': { opacity: 0.7, background: t.hover.default },
                }),
            '&.Mui-selected': {
              background: withAlpha(t.down, 0.07),
              '&:hover': { background: withAlpha(t.down, 0.10) },
            },
          }}
        >
          <TrendingDown sx={{ fontSize: 40, color: side === 'DOWN' ? t.down : 'text.secondary' }} />
          <Typography
            variant="h5"
            sx={{ color: side === 'DOWN' ? t.down : 'text.primary', fontWeight: 700, letterSpacing: '0.05em' }}
          >
            DOWN
          </Typography>
          <Box
            sx={{
              px: 1.5,
              py: 0.25,
              borderRadius: '2px',
              bgcolor: side === 'DOWN' ? withAlpha(t.down, 0.09) : t.hover.medium,
            }}
          >
            <Typography variant="body2" sx={{ color: side === 'DOWN' ? t.down : 'text.secondary', fontWeight: 600 }}>
              {currentOddsDown.toFixed(2)}x
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            {tugTotal > 0 ? `$${totalDown.toFixed(0)} pooled` : 'No predictions yet'}
          </Typography>
        </ToggleButton>
      </ToggleButtonGroup>
    </>
  );
}
