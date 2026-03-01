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
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useUsdcBalance } from '@/hooks/useUsdcBalance';
import type { PoolDetail } from '@/lib/api';
import { USDC_DIVISOR } from '@/lib/format';
import { UP_COLOR, DOWN_COLOR, GAIN_COLOR } from '@/lib/constants';

interface BetFormProps {
  pool: PoolDetail;
  onSubmit: (side: 'UP' | 'DOWN', amount: number) => void;
  isSubmitting?: boolean;
  error?: string;
  initialSide?: 'UP' | 'DOWN';
}

const PRESET_AMOUNTS = [10, 50, 100, 500];

export function BetForm({ pool, onSubmit, isSubmitting, error, initialSide }: BetFormProps) {
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const [side, setSide] = useState<'UP' | 'DOWN'>(initialSide || 'UP');
  const [amount, setAmount] = useState<string>('');

  useEffect(() => {
    if (initialSide) setSide(initialSide);
  }, [initialSide]);

  const handleSideChange = (_: React.MouseEvent, newSide: 'UP' | 'DOWN' | null) => {
    if (newSide) {
      setSide(newSide);
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
  const potentialPayout = grossPayout * 0.95;
  const potentialOdds = amountNum > 0 ? potentialPayout / amountNum : 0;

  const currentOddsUp = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalUp || 1) : 2;
  const currentOddsDown = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalDown || 1) : 2;

  const sideColor = side === 'UP' ? UP_COLOR : DOWN_COLOR;

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {/* Side Selection */}
      <Typography
        variant="caption"
        sx={{ color: 'text.secondary', mb: 1.5, display: 'block' }}
      >
        CHOOSE SIDE
      </Typography>
      <ToggleButtonGroup
        value={side}
        exclusive
        onChange={handleSideChange}
        fullWidth
        sx={{
          mb: 4,
          gap: 2,
          '& .MuiToggleButtonGroup-grouped': {
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px !important',
            flex: 1,
          },
        }}
      >
        <ToggleButton
          value="UP"
          sx={{
            py: { xs: 2, sm: 3 },
            flexDirection: 'column',
            gap: 0.5,
            transition: 'all 0.3s ease',
            '&.Mui-selected': {
              background: `${UP_COLOR}14`,
              borderColor: `${UP_COLOR} !important`,
              boxShadow: `0 0 20px ${UP_COLOR}20`,
              '&:hover': {
                background: `${UP_COLOR}1F`,
              },
            },
          }}
        >
          <TrendingUp sx={{ fontSize: 28, color: side === 'UP' ? UP_COLOR : 'text.secondary' }} />
          <Typography variant="h6" sx={{ color: side === 'UP' ? UP_COLOR : 'text.primary' }}>
            UP
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {currentOddsUp.toFixed(2)}x
          </Typography>
        </ToggleButton>

        <ToggleButton
          value="DOWN"
          sx={{
            py: { xs: 2, sm: 3 },
            flexDirection: 'column',
            gap: 0.5,
            transition: 'all 0.3s ease',
            '&.Mui-selected': {
              background: `${DOWN_COLOR}14`,
              borderColor: `${DOWN_COLOR} !important`,
              boxShadow: `0 0 20px ${DOWN_COLOR}20`,
              '&:hover': {
                background: `${DOWN_COLOR}1F`,
              },
            },
          }}
        >
          <TrendingDown sx={{ fontSize: 28, color: side === 'DOWN' ? DOWN_COLOR : 'text.secondary' }} />
          <Typography variant="h6" sx={{ color: side === 'DOWN' ? DOWN_COLOR : 'text.primary' }}>
            DOWN
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {currentOddsDown.toFixed(2)}x
          </Typography>
        </ToggleButton>
      </ToggleButtonGroup>

      {/* Amount Input */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          AMOUNT
        </Typography>
        {connected && balance && (
          <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
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
          startAdornment: <InputAdornment position="start">$</InputAdornment>,
          endAdornment: <InputAdornment position="end">USDC</InputAdornment>,
        }}
        sx={{
          mb: 2,
          '& .MuiOutlinedInput-root': {
            fontSize: '1.25rem',
            fontWeight: 300,
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            '& fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            '&:hover fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.2)',
            },
            '&.Mui-focused fieldset': {
              borderColor: 'rgba(255, 255, 255, 0.3)',
              borderWidth: 1,
            },
          },
        }}
      />

      {/* Preset Amounts */}
      <Box sx={{ display: 'flex', gap: 1.5, mb: 4 }}>
        {PRESET_AMOUNTS.map((preset) => (
          <Button
            key={preset}
            variant="outlined"
            size="small"
            onClick={() => handlePresetClick(preset)}
            disabled={!canInteract}
            sx={{
              flex: 1,
              py: { xs: 0.75, sm: 1 },
              borderColor: 'rgba(255, 255, 255, 0.1)',
              color: 'text.secondary',
              fontWeight: 400,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: `${UP_COLOR}60`,
                color: UP_COLOR,
                backgroundColor: `${UP_COLOR}08`,
              },
            }}
          >
            ${preset}
          </Button>
        ))}
      </Box>

      {/* Potential Payout */}
      {amountNum > 0 && (
        <Box
          sx={{
            p: { xs: 2, sm: 2.5 },
            mb: 3,
            borderRadius: 1,
            background: `${GAIN_COLOR}08`,
            border: `1px solid ${GAIN_COLOR}20`,
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
              {potentialOdds.toFixed(2)}x
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
              Potential Payout
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: GAIN_COLOR }}>
              ${potentialPayout.toFixed(2)} USDC
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: 'text.secondary', mt: 1.5, display: 'block', textAlign: 'right', fontWeight: 300 }}>
            Includes 5% platform fee
          </Typography>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            backgroundColor: `${DOWN_COLOR}15`,
            border: `1px solid ${DOWN_COLOR}40`,
            borderRadius: 1,
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
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
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
                <Typography variant="body2" sx={{ fontWeight: 500, color: GAIN_COLOR }}>Check Portfolio to claim winnings</Typography>
              </>
            )}
          </Box>
        </Box>
      )}

      {/* Submit Button */}
      <Button
        type="submit"
        variant="contained"
        fullWidth
        size="large"
        disabled={!canBet}
        sx={{
          py: 2,
          fontSize: '1rem',
          fontWeight: 600,
          letterSpacing: '0.02em',
          background: side === 'UP'
            ? `linear-gradient(135deg, ${UP_COLOR}, #16A34A)`
            : `linear-gradient(135deg, ${DOWN_COLOR}, #DC2626)`,
          color: '#000',
          '&:hover': {
            background: side === 'UP'
              ? `linear-gradient(135deg, ${UP_COLOR}DD, #16A34ADD)`
              : `linear-gradient(135deg, ${DOWN_COLOR}DD, #DC2626DD)`,
          },
          '&:disabled': {
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.3)',
          },
          ...(canBet && {
            animation: 'submitPulse 2s infinite',
            '@keyframes submitPulse': {
              '0%, 100%': {
                boxShadow: `0 0 0 0 ${sideColor}40`,
              },
              '50%': {
                boxShadow: `0 0 0 8px ${sideColor}00`,
              },
            },
          }),
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
    </Box>
  );
}
