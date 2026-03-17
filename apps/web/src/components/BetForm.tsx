'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  InputAdornment,
  Alert,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  HourglassEmpty,
  Lock,
  CheckCircle,
  AccountBalanceWallet,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { PoolDetail } from '@/lib/api';
import { USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR, UP_COINS_DIVISOR } from '@/lib/constants';
import { AnimatedValue } from './AnimatedValue';

interface BetFormProps {
  pool: PoolDetail;
  onSubmit: (side: 'UP' | 'DOWN', amount: number) => void;
  isSubmitting?: boolean;
  error?: string;
  initialSide?: 'UP' | 'DOWN';
  /** Controlled side — when provided, BetForm uses this instead of internal state */
  controlledSide?: 'UP' | 'DOWN';
  /** Hide the UP/DOWN toggle (when arena handles side selection) */
  hideToggle?: boolean;
}

const PRESET_AMOUNTS = [
  { value: 10, img: '/assets/button-10dollars.png' },
  { value: 50, img: '/assets/button-50dollars.png' },
  { value: 100, img: '/assets/button-100dollars.png' },
  { value: 500, img: '/assets/button-500dollars.png' },
];

export function BetForm({ pool, onSubmit, isSubmitting, error, initialSide, controlledSide, hideToggle }: BetFormProps) {
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();
  const [internalSide, setInternalSide] = useState<'UP' | 'DOWN'>(initialSide || 'UP');
  const [amount, setAmount] = useState<string>('');

  const side = controlledSide ?? internalSide;

  useEffect(() => {
    if (initialSide) setInternalSide(initialSide);
  }, [initialSide]);

  const handleSideChange = (_: React.MouseEvent, newSide: 'UP' | 'DOWN' | null) => {
    if (newSide) {
      setInternalSide(newSide);
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d{0,2}$/.test(value)) {
      setAmount(value);
    }
  };

  const handlePresetClick = (preset: number) => {
    setAmount(preset.toString());
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount);
    if (numAmount > 0) {
      onSubmit(side, numAmount * USDC_DIVISOR);
    }
  };

  const isPoolOpen = pool.status === 'JOINING';
  const canInteract = isPoolOpen && connected && !isSubmitting;
  const canBet = canInteract && parseFloat(amount) > 0;

  const amountNum = parseFloat(amount) || 0;
  const totalUp = Number(pool.totalUp) / USDC_DIVISOR;
  const totalDown = Number(pool.totalDown) / USDC_DIVISOR;
  const newTotalSide = side === 'UP' ? totalUp + amountNum : totalDown + amountNum;
  const newTotal = totalUp + totalDown + amountNum;
  const grossPayout = newTotalSide > 0 ? (amountNum / newTotalSide) * newTotal : 0;
  const feePercent = userProfile ? userProfile.feeBps / 10000 : 0.05;
  const potentialPayout = grossPayout * (1 - feePercent);
  const potentialOdds = amountNum > 0 ? potentialPayout / amountNum : 0;
  const estimatedCoins = (amountNum * 10 / UP_COINS_DIVISOR); // 0.10 UP per $1

  const currentOddsUp = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalUp || 1) : 2;
  const currentOddsDown = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalDown || 1) : 2;

  const sideColor = side === 'UP' ? UP_COLOR : DOWN_COLOR;

  const tugTotal = totalUp + totalDown;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {/* Side Selection — Battle Style */}
      {!hideToggle && (<>
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mb: 1.5, display: 'block', textAlign: 'center', letterSpacing: '0.15em' }}
      >
        CHOOSE YOUR SIDE
      </Typography>
      <ToggleButtonGroup
        value={side}
        exclusive
        onChange={handleSideChange}
        fullWidth
        sx={{
          mb: 1.5,
          gap: 0,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          '& .MuiToggleButtonGroup-grouped': {
            border: 'none !important',
            borderRadius: '4px !important',
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
                  background: `${UP_COLOR}12`,
                  boxShadow: `0 0 30px ${UP_COLOR}20, inset 0 0 30px ${UP_COLOR}08`,
                  '&:hover': { background: `${UP_COLOR}1A` },
                }
              : {
                  opacity: 0.45,
                  background: 'rgba(255,255,255,0.02)',
                  '&:hover': { opacity: 0.7, background: 'rgba(255,255,255,0.04)' },
                }),
            '&.Mui-selected': {
              background: `${UP_COLOR}12`,
              '&:hover': { background: `${UP_COLOR}1A` },
            },
          }}
        >
          <TrendingUp sx={{ fontSize: 40, color: side === 'UP' ? UP_COLOR : 'text.secondary' }} />
          <Typography
            variant="h5"
            sx={{ color: side === 'UP' ? UP_COLOR : 'text.primary', fontWeight: 700, letterSpacing: '0.05em' }}
          >
            UP
          </Typography>
          <Box
            sx={{
              px: 1.5,
              py: 0.25,
              borderRadius: '2px',
              bgcolor: side === 'UP' ? `${UP_COLOR}18` : 'rgba(255,255,255,0.06)',
            }}
          >
            <Typography variant="body2" sx={{ color: side === 'UP' ? UP_COLOR : 'text.secondary', fontWeight: 600 }}>
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
              background: `linear-gradient(to bottom, transparent, ${UP_COLOR}40, rgba(255,255,255,0.25), ${DOWN_COLOR}40, transparent)`,
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
              background: 'rgba(255,255,255,0.06)',
              boxShadow: '0 0 16px rgba(255,255,255,0.06)',
            }}
          >
            <Typography sx={{ fontSize: '1rem', lineHeight: 1 }}>⚡</Typography>
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
                  background: `${DOWN_COLOR}12`,
                  boxShadow: `0 0 30px ${DOWN_COLOR}20, inset 0 0 30px ${DOWN_COLOR}08`,
                  '&:hover': { background: `${DOWN_COLOR}1A` },
                }
              : {
                  opacity: 0.45,
                  background: 'rgba(255,255,255,0.02)',
                  '&:hover': { opacity: 0.7, background: 'rgba(255,255,255,0.04)' },
                }),
            '&.Mui-selected': {
              background: `${DOWN_COLOR}12`,
              '&:hover': { background: `${DOWN_COLOR}1A` },
            },
          }}
        >
          <TrendingDown sx={{ fontSize: 40, color: side === 'DOWN' ? DOWN_COLOR : 'text.secondary' }} />
          <Typography
            variant="h5"
            sx={{ color: side === 'DOWN' ? DOWN_COLOR : 'text.primary', fontWeight: 700, letterSpacing: '0.05em' }}
          >
            DOWN
          </Typography>
          <Box
            sx={{
              px: 1.5,
              py: 0.25,
              borderRadius: '2px',
              bgcolor: side === 'DOWN' ? `${DOWN_COLOR}18` : 'rgba(255,255,255,0.06)',
            }}
          >
            <Typography variant="body2" sx={{ color: side === 'DOWN' ? DOWN_COLOR : 'text.secondary', fontWeight: 600 }}>
              {currentOddsDown.toFixed(2)}x
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: '0.65rem' }}>
            {tugTotal > 0 ? `$${totalDown.toFixed(0)} pooled` : 'No predictions yet'}
          </Typography>
        </ToggleButton>
      </ToggleButtonGroup>
      </>)}

      {/* Preset Amounts — image buttons */}
      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
        {PRESET_AMOUNTS.map((preset) => {
          const isActive = amount === preset.value.toString();
          return (
            <Box
              key={preset.value}
              component={motion.div}
              {...({ whileTap: { scale: 0.92 } } as Record<string, unknown>)}
              onClick={() => canInteract && handlePresetClick(preset.value)}
              sx={{
                flex: 1,
                cursor: canInteract ? 'pointer' : 'default',
                transition: 'all 0.2s ease',
                opacity: canInteract ? (isActive ? 1 : 0.6) : 0.3,
                filter: isActive ? `drop-shadow(0 0 8px ${sideColor}40)` : 'none',
                transform: isActive ? 'translateY(-2px)' : 'none',
                '&:hover': canInteract ? {
                  opacity: 1,
                  transform: 'translateY(-2px)',
                  filter: `drop-shadow(0 0 6px ${sideColor}30)`,
                } : {},
              }}
            >
              <Box
                component="img"
                src={preset.img}
                alt={`$${preset.value}`}
                sx={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </Box>
          );
        })}
      </Box>

      {/* Amount Input */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, letterSpacing: '0.1em', fontSize: '0.65rem' }}>
          AMOUNT
        </Typography>
        {connected && balance && (
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)', fontWeight: 500, textTransform: 'none', letterSpacing: 0, fontSize: '0.7rem' }}>
            Balance: {balance.uiAmount.toFixed(2)} USDC
          </Typography>
        )}
      </Box>
      <TextField
        fullWidth
        type="text"
        value={amount}
        onChange={handleAmountChange}
        placeholder="0.00"
        disabled={!canInteract}
        InputProps={{
          startAdornment: <InputAdornment position="start"><Typography sx={{ color: sideColor, fontWeight: 600 }}>$</Typography></InputAdornment>,
          endAdornment: <InputAdornment position="end"><Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.8rem', fontWeight: 500 }}>USDC</Typography></InputAdornment>,
        }}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            fontSize: '1.5rem',
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 2,
            '& fieldset': {
              borderColor: 'rgba(255,255,255,0.06)',
            },
            '&:hover fieldset': {
              borderColor: `${sideColor}30`,
            },
            '&.Mui-focused fieldset': {
              borderColor: `${sideColor}40`,
              borderWidth: 1,
            },
          },
        }}
      />

      {/* Potential Payout */}
      <AnimatePresence>
        {amountNum > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            style={{ overflow: 'hidden' }}
          >
            <Box
              sx={{
                p: { xs: 2, sm: 2.5 },
                mb: 3,
                borderRadius: 0,
                background: '#0D1219',
                borderTop: `1px solid ${GAIN_COLOR}30`,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  Your Stake
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 400 }}>
                  ${amountNum.toFixed(2)} USDC
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1.5 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  Potential Odds
                </Typography>
                <Typography variant="body2" sx={{ color: sideColor, fontWeight: 500 }}>
                  <AnimatedValue value={potentialOdds} suffix="x" duration={0.4} />
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  Potential Payout
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: GAIN_COLOR }}>
                  <AnimatedValue value={potentialPayout} prefix="$" suffix=" USDC" duration={0.4} />
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5 }}>
                <Typography variant="caption" sx={{ color: ACCENT_COLOR, fontWeight: 500 }}>
                  {estimatedCoins > 0 ? `+~${estimatedCoins.toFixed(2)} UP` : ''}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 300 }}>
                  {userProfile && userProfile.feeBps < 500
                    ? `Includes ${userProfile.feePercent}% fee (Lv.${userProfile.level} discount)`
                    : 'Includes 5% platform fee'}
                </Typography>
              </Box>
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            backgroundColor: `${DOWN_COLOR}15`,
            border: 'none',
            borderRadius: 0,
          }}
        >
          {error}
        </Alert>
      )}

      {/* Status Message for non-JOINING states */}
      {pool.status !== 'JOINING' && (
        <Box
          sx={{
            p: 2,
            mb: 3,
            borderRadius: 0,
            background: 'rgba(255, 255, 255, 0.03)',
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 1,
              color: 'text.secondary',
            }}
          >
            {pool.status === 'UPCOMING' && (
              <>
                <HourglassEmpty sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Pool opens soon</Typography>
              </>
            )}
            {pool.status === 'ACTIVE' && (
              <>
                <Lock sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Predictions closed - Waiting for result</Typography>
              </>
            )}
            {pool.status === 'RESOLVED' && (
              <>
                <CheckCircle sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Pool resolved</Typography>
              </>
            )}
            {pool.status === 'CLAIMABLE' && (
              <>
                <AccountBalanceWallet sx={{ fontSize: 18, color: GAIN_COLOR }} />
                <Typography variant="body2" sx={{ fontWeight: 500, color: GAIN_COLOR }}>Check Profile to claim winnings</Typography>
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Submit Button */}
      <motion.div
        animate={canBet ? { boxShadow: [`0 0 0 0px ${sideColor}40`, `0 0 0 10px ${sideColor}00`, `0 0 0 0px ${sideColor}40`] } : {}}
        transition={canBet ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
        whileTap={canBet ? { scale: 0.95 } : undefined}
        style={{ borderRadius: 12 }}
      >
      <Button
        type="submit"
        variant="contained"
        fullWidth
        size="large"
        disabled={!canBet}
        sx={{
          py: 2,
          fontSize: '1.05rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          borderRadius: 3,
          textTransform: 'uppercase',
          background: side === 'UP'
            ? `linear-gradient(135deg, ${UP_COLOR}, #16A34A)`
            : `linear-gradient(135deg, ${DOWN_COLOR}, #DC2626)`,
          color: '#000',
          boxShadow: canBet ? `0 4px 20px ${sideColor}30` : 'none',
          '&:hover': {
            background: side === 'UP'
              ? `linear-gradient(135deg, ${UP_COLOR}DD, #16A34ADD)`
              : `linear-gradient(135deg, ${DOWN_COLOR}DD, #DC2626DD)`,
            boxShadow: `0 6px 30px ${sideColor}40`,
          },
          '&:disabled': {
            background: 'rgba(255, 255, 255, 0.06)',
            color: 'rgba(255, 255, 255, 0.25)',
          },
        }}
      >
        {!connected
          ? 'Connect Wallet'
          : pool.status === 'UPCOMING'
          ? 'Pool Not Open Yet'
          : pool.status === 'ACTIVE'
          ? 'Predictions Closed'
          : pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE'
          ? 'Pool Ended'
          : isSubmitting
          ? 'Processing...'
          : `Place ${side} Prediction`}
      </Button>
      </motion.div>
    </Box>
  );
}
