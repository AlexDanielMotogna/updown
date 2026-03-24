'use client';

import { type RefObject } from 'react';
import { Box, Typography } from '@mui/material';

import { motion } from 'framer-motion';
import { BetForm } from '@/components';
import { formatUSDC, USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, ACCENT_COLOR } from '@/lib/constants';
import type { PoolDetail } from '@/lib/api';

interface ArenaSectionProps {
  pool: PoolDetail;
  selectedSide: 'UP' | 'DOWN';
  onSelectSide: (side: 'UP' | 'DOWN') => void;
  onBet: (side: 'UP' | 'DOWN', amount: number) => void;
  txState: { status: string; error?: string | null | undefined };
  betFormRef: RefObject<HTMLDivElement | null>;
}

const motionTapSmall = { whileTap: { scale: 0.96 } } as Record<string, unknown>;

export function ArenaSection({ pool, selectedSide, onSelectSide, onBet, txState, betFormRef }: ArenaSectionProps) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;
  const isSubmitting = txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error';

  return (
    <Box sx={{
      position: 'relative', overflow: 'hidden',
      background: { xs: 'transparent', md: 'rgba(255,255,255,0.02)' },
      borderRadius: { xs: 0, md: '10px' },
      pt: { xs: 2, md: 2 },
      pb: { xs: 4, md: 2 },
    }}>
      {/* UP / DOWN toggle buttons */}
      <Box sx={{ px: 2, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', gap: 0, width: '100%', mb: 1.5 }}>
          <JoinButton side="UP" selected={selectedSide === 'UP'} onSelect={() => onSelectSide('UP')} position="left" pct={upPct} />
          <JoinButton side="DOWN" selected={selectedSide === 'DOWN'} onSelect={() => onSelectSide('DOWN')} position="right" pct={downPct} />
        </Box>

        {/* Bet Form */}
        <Box ref={betFormRef}>
          <BetForm pool={pool} onSubmit={onBet} isSubmitting={isSubmitting} error={txState.error ?? undefined} controlledSide={selectedSide} hideToggle />
        </Box>
      </Box>

      {/* Energy Bar */}
      <EnergyBar pool={pool} upPct={upPct} downPct={downPct} />

      {/* Winner banner */}
      {pool.winner && <WinnerBanner pool={pool} />}
    </Box>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function JoinButton({ side, selected, onSelect, position, pct }: {
  side: 'UP' | 'DOWN'; selected: boolean; onSelect: () => void; position: 'left' | 'right'; pct: number;
}) {
  const color = side === 'UP' ? UP_COLOR : DOWN_COLOR;
  const icon = side === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png';

  return (
    <Box
      component={motion.div}
      {...motionTapSmall}
      onClick={onSelect}
      sx={{
        flex: 1, cursor: 'pointer',
        py: 1.25, px: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 0.75,
        borderRadius: '5px', transition: 'all 0.2s ease',
        position: 'relative', overflow: 'hidden',
        background: selected ? `${color}18` : 'rgba(255,255,255,0.03)',
        '&:hover': selected ? {} : { background: 'rgba(255,255,255,0.06)' },
      }}
    >
      <Box component="img" src={icon} alt="" sx={{ width: 18, height: 18, opacity: selected ? 1 : 0.4 }} />
      <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', color: selected ? color : 'rgba(255,255,255,0.5)' }}>
        {side} {pct}%
      </Typography>
    </Box>
  );
}

function EnergyBar({ pool, upPct, downPct }: { pool: PoolDetail; upPct: number; downPct: number }) {
  return (
    <Box sx={{ px: { xs: 1.5, md: 3 }, mt: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 16, height: 16 }} />
          <Typography sx={{ color: UP_COLOR, fontWeight: 600, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>UP {formatUSDC(pool.totalUp)}</Typography>
        </Box>
        <Typography sx={{ fontSize: '0.8rem', color: 'text.secondary', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(pool.totalPool)} total</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Typography sx={{ color: DOWN_COLOR, fontWeight: 600, fontSize: '0.8rem', fontVariantNumeric: 'tabular-nums' }}>DOWN {formatUSDC(pool.totalDown)}</Typography>
          <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 16, height: 16 }} />
        </Box>
      </Box>
      <Box sx={{ height: 10, borderRadius: 5, overflow: 'hidden', position: 'relative', background: `${DOWN_COLOR}30` }}>
        <Box
          sx={{
            position: 'absolute', top: 0, left: 0, height: '100%', width: `${upPct}%`, borderRadius: 5,
            background: `linear-gradient(90deg, ${UP_COLOR}80, ${UP_COLOR})`,
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: upPct > 50 ? `0 0 10px ${UP_COLOR}50, 0 0 20px ${UP_COLOR}20` : 'none',
            '&::after': {
              content: '""', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
              backgroundSize: '200% 100%',
              animation: 'energyFlow 2s infinite linear',
              '@keyframes energyFlow': { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
            },
          }}
        />
        {downPct > 50 && (
          <Box sx={{ position: 'absolute', top: 0, right: 0, height: '100%', width: '30%', background: `linear-gradient(270deg, ${DOWN_COLOR}40, transparent)`, animation: 'downGlow 2s infinite', '@keyframes downGlow': { '0%, 100%': { opacity: 0.5 }, '50%': { opacity: 1 } } }} />
        )}
      </Box>
    </Box>
  );
}

function WinnerBanner({ pool }: { pool: PoolDetail }) {
  const isRefund = pool.upCount === 0 || pool.downCount === 0;
  const winColor = pool.winner === 'UP' ? UP_COLOR : DOWN_COLOR;

  return (
    <Box sx={{ mt: 3, mx: { xs: 1.5, md: 3 }, p: 3, borderRadius: 1, background: isRefund ? 'rgba(255,255,255,0.04)' : `${winColor}12`, textAlign: 'center' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mb: 1 }}>
        {pool.winner === 'UP'
          ? <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 28, height: 28 }} />
          : <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 28, height: 28 }} />}
        <Typography variant="h4" sx={{ fontWeight: 700, color: winColor }}>{pool.winner} WINS</Typography>
      </Box>
      {pool.strikePrice && pool.finalPrice && (
        <Typography variant="body1" sx={{ color: 'text.secondary' }}>
          ${(Number(pool.strikePrice) / USDC_DIVISOR).toFixed(2)} → ${(Number(pool.finalPrice) / USDC_DIVISOR).toFixed(2)}
        </Typography>
      )}
      {isRefund && (
        <Typography variant="body2" sx={{ mt: 1, color: ACCENT_COLOR, fontWeight: 600, fontSize: '0.8rem' }}>
          No opponents — all bets refunded
        </Typography>
      )}
    </Box>
  );
}
