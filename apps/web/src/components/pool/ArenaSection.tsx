'use client';

import { type RefObject } from 'react';
import { Box, Typography, Chip } from '@mui/material';
import { Whatshot } from '@mui/icons-material';
import { motion } from 'framer-motion';
import { Countdown, BetForm, AnimatedValue } from '@/components';
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

const motionTap = { whileTap: { scale: 0.97 } } as Record<string, unknown>;
const motionTapSmall = { whileTap: { scale: 0.96 } } as Record<string, unknown>;

function getBoxImages(asset: string) {
  const assetKey = asset.toLowerCase().replace(/[^a-z]/g, '');
  return {
    up: `/boxes-pool/up-${assetKey}-green.png`,
    down: `/boxes-pool/down-${assetKey}-red.png`,
  };
}

export function ArenaSection({ pool, selectedSide, onSelectSide, onBet, txState, betFormRef }: ArenaSectionProps) {
  const totalUp = Number(pool.totalUp);
  const totalDown = Number(pool.totalDown);
  const total = totalUp + totalDown;
  const upPct = total > 0 ? Math.round((totalUp / total) * 100) : 50;
  const downPct = 100 - upPct;
  const sideColor = selectedSide === 'UP' ? UP_COLOR : DOWN_COLOR;
  const box = getBoxImages(pool.asset);
  const isSubmitting = txState.status !== 'idle' && txState.status !== 'success' && txState.status !== 'error';

  return (
    <Box sx={{ position: 'relative', overflow: 'hidden', background: 'transparent', pb: { xs: 4, md: 6 } }}>
      {/* Market Battle + Countdown */}
      <Box sx={{ textAlign: 'center', pt: { xs: 3, md: 4 }, pb: { xs: 2, md: 3 }, px: { xs: 1.5, md: 3 }, position: 'relative', zIndex: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: { xs: 2, md: 3 }, mb: 1.5 }}>
          <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.85rem' }, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.3)' }}>MARKET</Typography>
          <Box component="img" src="/assets/market-battle-icon-500.png" alt="" sx={{ width: { xs: 20, md: 30 }, height: { xs: 20, md: 30 } }} />
          <Typography sx={{ fontSize: { xs: '0.6rem', md: '0.85rem' }, fontWeight: 700, letterSpacing: '0.25em', color: 'rgba(255,255,255,0.3)' }}>BATTLE</Typography>
        </Box>
        {(pool.status === 'JOINING' || pool.status === 'ACTIVE') && (
          <Countdown
            targetDate={pool.status === 'JOINING' ? pool.lockTime : pool.endTime}
            label={pool.status === 'JOINING' ? 'PREDICTIONS CLOSE IN' : 'RESULT IN'}
          />
        )}
      </Box>

      {/* Arena Teams + Bet Form */}
      <Box sx={{ px: { xs: 1.5, md: 3 }, position: 'relative', zIndex: 1 }}>
        {/* Mobile: UP and DOWN side by side */}
        <Box sx={{ display: { xs: 'flex', md: 'none' }, gap: 1, mb: 2 }}>
          <MobileTeamCard side="UP" pool={pool} selected={selectedSide === 'UP'} onSelect={() => onSelectSide('UP')} pct={upPct} boxImg={box.up} />
          <MobileTeamCard side="DOWN" pool={pool} selected={selectedSide === 'DOWN'} onSelect={() => onSelectSide('DOWN')} pct={downPct} boxImg={box.down} />
        </Box>

        {/* Desktop: 3-column layout */}
        <Box sx={{ display: { xs: 'none', md: 'flex' }, alignItems: 'center', justifyContent: 'center' }}>
          <DesktopTeamCard side="UP" pool={pool} selected={selectedSide === 'UP'} onSelect={() => onSelectSide('UP')} pct={upPct} boxImg={box.up} />

          {/* Center: Bet Form */}
          <Box ref={betFormRef} sx={{ flex: '0 0 420px', width: 420, px: 2, py: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
            {/* JOIN UP / JOIN DOWN buttons */}
            <Box sx={{ display: 'flex', gap: 0, width: '100%', mb: 2 }}>
              <JoinButton side="UP" selected={selectedSide === 'UP'} onSelect={() => onSelectSide('UP')} position="left" size="desktop" />
              <JoinButton side="DOWN" selected={selectedSide === 'DOWN'} onSelect={() => onSelectSide('DOWN')} position="right" size="desktop" />
            </Box>
            <Box
              sx={{
                width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${sideColor}15`,
                borderRadius: 3, p: { xs: 2.5, md: 3 }, position: 'relative', overflow: 'hidden',
                '&::before': {
                  content: '""', position: 'absolute', top: 0, left: '10%', right: '10%', height: '1px',
                  background: `linear-gradient(90deg, transparent, ${sideColor}40, transparent)`,
                },
              }}
            >
              <BetForm pool={pool} onSubmit={onBet} isSubmitting={isSubmitting} error={txState.error ?? undefined} controlledSide={selectedSide} hideToggle />
            </Box>
          </Box>

          <DesktopTeamCard side="DOWN" pool={pool} selected={selectedSide === 'DOWN'} onSelect={() => onSelectSide('DOWN')} pct={downPct} boxImg={box.down} />
        </Box>

        {/* Mobile: Bet Form (full width, below teams) */}
        <Box ref={betFormRef} sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', gap: 0, width: '100%', mb: 1.5 }}>
            <JoinButton side="UP" selected={selectedSide === 'UP'} onSelect={() => onSelectSide('UP')} position="left" size="mobile" />
            <JoinButton side="DOWN" selected={selectedSide === 'DOWN'} onSelect={() => onSelectSide('DOWN')} position="right" size="mobile" />
          </Box>
          <Box sx={{ width: '100%', background: 'rgba(255,255,255,0.02)', border: `1px solid ${sideColor}15`, borderRadius: 2, p: 2 }}>
            <BetForm pool={pool} onSubmit={onBet} isSubmitting={isSubmitting} error={txState.error ?? undefined} controlledSide={selectedSide} hideToggle />
          </Box>
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

function MobileTeamCard({ side, pool, selected, onSelect, pct, boxImg }: {
  side: 'UP' | 'DOWN'; pool: PoolDetail; selected: boolean; onSelect: () => void; pct: number; boxImg: string;
}) {
  const color = side === 'UP' ? UP_COLOR : DOWN_COLOR;
  const odds = side === 'UP' ? pool.odds.up : pool.odds.down;
  const total = side === 'UP' ? pool.totalUp : pool.totalDown;
  const isWinner = pool.winner === side;
  const isLoser = pool.winner && pool.winner !== side;

  return (
    <Box
      component={motion.div}
      {...motionTap}
      onClick={onSelect}
      sx={{
        flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5,
        p: 1.5, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
        ...(selected ? { background: `${color}10`, boxShadow: `0 0 30px ${color}15` } : { background: 'rgba(255,255,255,0.02)', opacity: 0.5 }),
        ...(isWinner ? { boxShadow: `0 0 40px ${color}30` } : {}),
        ...(isLoser ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
      }}
    >
      {isWinner && <Chip label="WINNER" size="small" sx={{ bgcolor: `${color}30`, color, fontWeight: 700, fontSize: '0.6rem', height: 20 }} />}
      <Box component="img" src={boxImg} alt={side} sx={{ width: 70, height: 70, objectFit: 'contain', filter: selected ? `drop-shadow(0 0 15px ${color}50)` : 'brightness(0.7)' }} />
      <Typography sx={{ color, fontWeight: 700, fontSize: '0.85rem' }}>{side} Team</Typography>
      <Typography sx={{ color, fontWeight: 700, fontSize: '1.2rem' }}>{pct}%</Typography>
      <Box sx={{ px: 1, py: 0.25, borderRadius: 1, bgcolor: `${color}15` }}>
        <Typography sx={{ color, fontWeight: 700, fontSize: '0.8rem' }}>
          {Number.isFinite(Number(odds)) ? <AnimatedValue value={Number(odds)} suffix="x" decimals={2} /> : `${odds}x`}
        </Typography>
      </Box>
      <Typography sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem', fontWeight: 600 }}>{formatUSDC(total)}</Typography>
    </Box>
  );
}

function DesktopTeamCard({ side, pool, selected, onSelect, pct, boxImg }: {
  side: 'UP' | 'DOWN'; pool: PoolDetail; selected: boolean; onSelect: () => void; pct: number; boxImg: string;
}) {
  const color = side === 'UP' ? UP_COLOR : DOWN_COLOR;
  const odds = side === 'UP' ? pool.odds.up : pool.odds.down;
  const total = side === 'UP' ? pool.totalUp : pool.totalDown;
  const isWinner = pool.winner === side;
  const isLoser = pool.winner && pool.winner !== side;

  return (
    <Box
      component={motion.div}
      {...motionTap}
      onClick={onSelect}
      sx={{
        flex: 1, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        p: 2, borderRadius: 2, transition: 'all 0.3s ease', position: 'relative',
        ...(selected
          ? { background: `${color}10`, boxShadow: `0 0 60px ${color}15, inset 0 0 40px ${color}06` }
          : { background: 'transparent', opacity: 0.5, '&:hover': { opacity: 0.75 } }),
        ...(isWinner ? { boxShadow: `0 0 80px ${color}30` } : {}),
        ...(isLoser ? { opacity: 0.25, filter: 'grayscale(0.6)' } : {}),
      }}
    >
      {isWinner && <Chip label="WINNER" size="small" sx={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', bgcolor: `${color}30`, color, fontWeight: 700, fontSize: '0.65rem' }} />}
      <Typography sx={{ color, fontWeight: 700, fontSize: '1.2rem', letterSpacing: '0.05em' }}>{side} Team</Typography>
      <Box component="img" src={boxImg} alt={side} sx={{ width: 200, height: 200, objectFit: 'contain', filter: selected ? `drop-shadow(0 0 30px ${color}50)` : 'brightness(0.7)', transition: 'all 0.3s ease', transform: selected ? 'scale(1.05)' : 'scale(0.9)' }} />
      {pct > 65 && <Whatshot sx={{ fontSize: 18, color: '#FF6B35', animation: 'hotWobble 0.6s infinite', '@keyframes hotWobble': { '0%, 100%': { transform: 'rotate(-5deg)' }, '50%': { transform: 'rotate(5deg)' } } }} />}
      <Typography sx={{ color, fontWeight: 700, fontSize: '2rem' }}>{pct}%</Typography>
      <Box sx={{ px: 2, py: 0.5, borderRadius: 1, bgcolor: `${color}15`, display: 'inline-block', mb: 0.75 }}>
        <Typography sx={{ color, fontWeight: 700, fontSize: '1.1rem' }}>
          {Number.isFinite(Number(odds)) ? <AnimatedValue value={Number(odds)} suffix="x" decimals={2} /> : `${odds}x`}
        </Typography>
      </Box>
      <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatUSDC(total)} pooled</Typography>
      <Typography sx={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.1em', mt: 0.75 }}>{side} TEAM POWER</Typography>
    </Box>
  );
}

function JoinButton({ side, selected, onSelect, position, size }: {
  side: 'UP' | 'DOWN'; selected: boolean; onSelect: () => void; position: 'left' | 'right'; size: 'mobile' | 'desktop';
}) {
  const color = side === 'UP' ? UP_COLOR : DOWN_COLOR;
  const icon = side === 'UP' ? '/assets/up-icon-64x64.png' : '/assets/down-icon-64x64.png';
  const isMobile = size === 'mobile';
  const radius = position === 'left'
    ? (isMobile ? '10px 0 0 10px' : '12px 0 0 12px')
    : (isMobile ? '0 10px 10px 0' : '0 12px 12px 0');

  return (
    <Box
      component={motion.div}
      {...motionTapSmall}
      onClick={onSelect}
      sx={{
        flex: 1, cursor: 'pointer',
        py: isMobile ? 1.25 : { xs: 1.5, md: 2 },
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: isMobile ? 0.75 : 1,
        borderRadius: radius, transition: 'all 0.3s ease',
        position: 'relative', overflow: 'hidden',
        ...(selected
          ? {
              background: side === 'UP'
                ? `linear-gradient(135deg, ${color}25, ${color}10)`
                : `linear-gradient(135deg, ${color}10, ${color}25)`,
              boxShadow: `0 0 ${isMobile ? 20 : 30}px ${color}20`,
              ...(size === 'desktop' ? { insetBoxShadow: `inset 0 1px 0 ${color}30` } : {}),
            }
          : {
              background: 'rgba(255,255,255,0.03)',
              ...(size === 'desktop' ? { '&:hover': { background: 'rgba(255,255,255,0.06)' } } : {}),
            }),
      }}
    >
      <Box component="img" src={icon} alt="" sx={{ width: isMobile ? 18 : 22, height: isMobile ? 18 : 22, opacity: selected ? 1 : 0.3 }} />
      <Typography sx={{ fontWeight: 700, fontSize: isMobile ? '0.8rem' : { xs: '0.85rem', md: '0.95rem' }, color: selected ? color : 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
        JOIN {side}
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
