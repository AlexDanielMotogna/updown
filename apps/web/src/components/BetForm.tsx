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
  Tooltip,
} from '@mui/material';
import {
  TrendingUp,
  TrendingDown,
  HourglassEmpty,
  Lock,
  CheckCircle,
  AccountBalanceWallet,
  InfoOutlined,
} from '@mui/icons-material';
import { motion, AnimatePresence } from 'framer-motion';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { PoolDetail } from '@/lib/api';
import { USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, ACCENT_COLOR, UP_COINS_DIVISOR, FEE_BPS_DIVISOR, DEFAULT_FEE_PERCENT, UP_COINS_PER_DOLLAR } from '@/lib/constants';
import { AnimatedValue } from './AnimatedValue';

interface BetFormProps {
  pool: PoolDetail;
  onSubmit: (side: 'UP' | 'DOWN', amount: number) => void;
  isSubmitting?: boolean;
  error?: string;
  initialSide?: 'UP' | 'DOWN';
  /** Controlled side  when provided, BetForm uses this instead of internal state */
  controlledSide?: 'UP' | 'DOWN';
  /** Hide the UP/DOWN toggle (when arena handles side selection) */
  hideToggle?: boolean;
  /** If user already has a bet, lock to this side */
  existingBetSide?: 'UP' | 'DOWN';
}

const PRESET_AMOUNTS = [
  { value: 10, img: '/assets/button-10dollars.png' },
  { value: 50, img: '/assets/button-50dollars.png' },
  { value: 100, img: '/assets/button-100dollars.png' },
  { value: 500, img: '/assets/button-500dollars.png' },
];

export function BetForm({ pool, onSubmit, isSubmitting, error, initialSide, controlledSide, hideToggle, existingBetSide }: BetFormProps) {
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const { data: userProfile } = useUserProfile();
  const [internalSide, setInternalSide] = useState<'UP' | 'DOWN'>(existingBetSide || initialSide || 'UP');
  const [amount, setAmount] = useState<string>('');

  const side = existingBetSide ?? controlledSide ?? internalSide;

  useEffect(() => {
    if (initialSide) setInternalSide(initialSide);
  }, [initialSide]);

  const handleSideChange = (_: React.MouseEvent, newSide: 'UP' | 'DOWN' | null) => {
    if (newSide && !existingBetSide) {
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
  const feePercent = userProfile ? userProfile.feeBps / FEE_BPS_DIVISOR : DEFAULT_FEE_PERCENT;
  const potentialPayout = grossPayout * (1 - feePercent);
  const potentialOdds = amountNum > 0 ? potentialPayout / amountNum : 0;
  const estimatedCoins = (amountNum * UP_COINS_PER_DOLLAR / UP_COINS_DIVISOR);

  const currentOddsUp = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalUp || 1) : 2;
  const currentOddsDown = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalDown || 1) : 2;

  const sideColor = side === 'UP' ? UP_COLOR : DOWN_COLOR;

  const tugTotal = totalUp + totalDown;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {/* Side Selection  Battle Style */}
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

      {/* Preset Amounts  image buttons */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
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
          startAdornment: <InputAdornment position="start"><Typography sx={{ color: sideColor, fontWeight: 600, fontSize: '0.9rem' }}>$</Typography></InputAdornment>,
          endAdornment: <InputAdornment position="end"><Typography sx={{ color: 'rgba(255,255,255,0.3)', fontSize: '0.7rem', fontWeight: 500 }}>USDC</Typography></InputAdornment>,
        }}
        sx={{
          mb: 1.5,
          '& .MuiOutlinedInput-root': {
            fontSize: '1.1rem',
            fontWeight: 600,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            borderRadius: 2,
            py: 0,
            '& .MuiOutlinedInput-input': {
              py: 1,
            },
            '& fieldset': {
              border: 'none',
            },
            '&:hover fieldset': {
              border: 'none',
            },
            '&.Mui-focused fieldset': {
              border: 'none',
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
                px: 1.5,
                py: 1,
                mb: 1.5,
                borderRadius: 0,
                background: '#0D1219',
                borderTop: `1px solid ${GAIN_COLOR}30`,
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Stake</Typography>
                  <Tooltip title="USDC amount you are placing on this prediction" arrow placement="left" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ fontWeight: 400, fontSize: '0.75rem' }}>
                  ${amountNum.toFixed(2)}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Odds</Typography>
                  <Tooltip title="Current payout multiplier. Changes in real-time as other players bet" arrow placement="left" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ color: sideColor, fontWeight: 500, fontSize: '0.75rem' }}>
                  <AnimatedValue value={potentialOdds} suffix="x" duration={0.4} />
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4 }}>
                  <Typography sx={{ color: 'text.secondary', fontWeight: 300, fontSize: '0.75rem' }}>Payout</Typography>
                  <Tooltip title="Estimated USDC you receive if your side wins (before fees)" arrow placement="left" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
                <Typography sx={{ fontWeight: 600, color: GAIN_COLOR, fontSize: '0.75rem' }}>
                  <AnimatedValue value={potentialPayout} prefix="$" suffix=" USDC" duration={0.4} />
                </Typography>
              </Box>
              {estimatedCoins > 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.4, mt: 0.5 }}>
                  <Typography sx={{ color: ACCENT_COLOR, fontWeight: 500, fontSize: '0.65rem' }}>
                    +~{estimatedCoins.toFixed(2)} UP
                  </Typography>
                  <Tooltip title="Estimated UP Coins earned when you claim a winning bet. Multiplied by your level" arrow placement="right" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
                    <InfoOutlined sx={{ fontSize: 11, color: 'rgba(255,255,255,0.15)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
                  </Tooltip>
                </Box>
              )}
            </Box>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 1.5,
            backgroundColor: `${DOWN_COLOR}15`,
            border: 'none',
            borderRadius: 1,
            py: 0,
            '& .MuiAlert-message': { fontSize: '0.75rem' },
          }}
        >
          {error}
        </Alert>
      )}

      {/* Status Message for non-JOINING states */}
      {pool.status !== 'JOINING' && (
        <Box
          sx={{
            px: 1.5,
            py: 1,
            mb: 1.5,
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.03)',
            textAlign: 'center',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.75,
              color: 'text.secondary',
            }}
          >
            {pool.status === 'UPCOMING' && (
              <>
                <HourglassEmpty sx={{ fontSize: 14 }} />
                <Typography sx={{ fontWeight: 500, fontSize: '0.75rem' }}>Pool opens soon</Typography>
              </>
            )}
            {pool.status === 'ACTIVE' && (
              <>
                <Lock sx={{ fontSize: 14 }} />
                <Typography sx={{ fontWeight: 500, fontSize: '0.75rem' }}>Predictions closed</Typography>
              </>
            )}
            {pool.status === 'RESOLVED' && (
              <>
                <CheckCircle sx={{ fontSize: 14 }} />
                <Typography sx={{ fontWeight: 500, fontSize: '0.75rem' }}>Pool resolved</Typography>
              </>
            )}
            {pool.status === 'CLAIMABLE' && (
              <>
                <AccountBalanceWallet sx={{ fontSize: 14, color: GAIN_COLOR }} />
                <Typography sx={{ fontWeight: 500, fontSize: '0.75rem', color: GAIN_COLOR }}>Claim winnings in Profile</Typography>
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
        disabled={!canBet}
        sx={{
          py: 1.25,
          fontSize: '0.85rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          borderRadius: 2,
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
          : existingBetSide
          ? `Add to ${side} Prediction`
          : `Place ${side} Prediction`}
      </Button>
      </motion.div>

      {/* Fee disclaimer  small, below button */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.4, mt: 1 }}>
        <Typography sx={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.2)', fontWeight: 400 }}>
          {userProfile
            ? userProfile.feeBps < 500
              ? `${userProfile.feePercent}% fee (Lv.${userProfile.level} discount)`
              : `${userProfile.feePercent}% platform fee on winnings`
            : '5% platform fee on winnings'}
        </Typography>
        <Tooltip title="Fee is only charged on winnings, never on losses. Higher levels get lower fees (5% down to 3%)" arrow placement="top" slotProps={{ tooltip: { sx: { bgcolor: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', fontSize: '0.75rem' } }, arrow: { sx: { color: '#1a1f2e' } } }}>
          <InfoOutlined sx={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', cursor: 'help', '&:hover': { color: 'rgba(255,255,255,0.5)' }, transition: 'color 0.15s' }} />
        </Tooltip>
      </Box>
    </Box>
  );
}
