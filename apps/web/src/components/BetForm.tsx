'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  InputAdornment,
  Alert,
  Tooltip,
} from '@mui/material';
import {
  HourglassEmpty,
  Lock,
  CheckCircle,
  AccountBalanceWallet,
  InfoOutlined,
} from '@mui/icons-material';
import { motion } from 'framer-motion';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import { useUserProfile } from '@/hooks/useUserProfile';
import type { PoolDetail } from '@/lib/api';
import { USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR, UP_COINS_DIVISOR, FEE_BPS_DIVISOR, DEFAULT_FEE_PERCENT, UP_COINS_PER_DOLLAR } from '@/lib/constants';
import { SideSelector } from './bet/SideSelector';
import { PayoutPreview } from './bet/PayoutPreview';

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

const PRESET_AMOUNTS = [10, 50, 100, 500];

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
      {!hideToggle && (
        <SideSelector
          side={side}
          onSideChange={handleSideChange}
          currentOddsUp={currentOddsUp}
          currentOddsDown={currentOddsDown}
          totalUp={totalUp}
          totalDown={totalDown}
          tugTotal={tugTotal}
        />
      )}

      {/* Preset Amounts  image buttons */}
      <Box sx={{ display: 'flex', gap: 0.75, mb: 1.5 }}>
        {PRESET_AMOUNTS.map((preset) => {
          const isActive = amount === preset.toString();
          return (
            <Button
              key={preset}
              size="small"
              onClick={() => canInteract && handlePresetClick(preset)}
              disabled={!canInteract}
              sx={{
                flex: 1, minWidth: 0, py: 0.75,
                fontSize: '0.8rem', fontWeight: 600,
                bgcolor: isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.5)',
                textTransform: 'none', borderRadius: '5px',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' },
                '&:disabled': { bgcolor: 'rgba(255,255,255,0.02)', color: 'rgba(255,255,255,0.2)' },
              }}
            >
              ${preset}
            </Button>
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
      <PayoutPreview
        amountNum={amountNum}
        potentialOdds={potentialOdds}
        potentialPayout={potentialPayout}
        estimatedCoins={estimatedCoins}
        sideColor={sideColor}
      />

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
        style={{ borderRadius: 5 }}
      >
      <Button
        type="submit"
        variant="contained"
        fullWidth
        disabled={!canBet}
        sx={{
          py: 1,
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.06em',
          borderRadius: '5px',
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
