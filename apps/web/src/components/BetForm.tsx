'use client';

import { useState } from 'react';
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

interface BetFormProps {
  pool: PoolDetail;
  onSubmit: (side: 'UP' | 'DOWN', amount: number) => void;
  isSubmitting?: boolean;
  error?: string;
}

const PRESET_AMOUNTS = [10, 50, 100, 500];

export function BetForm({ pool, onSubmit, isSubmitting, error }: BetFormProps) {
  const { connected } = useWalletBridge();
  const { data: balance } = useUsdcBalance();
  const [side, setSide] = useState<'UP' | 'DOWN'>('UP');
  const [amount, setAmount] = useState<string>('');

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
  const potentialPayout = newTotalSide > 0 ? (amountNum / newTotalSide) * newTotal : 0;
  const potentialOdds = amountNum > 0 ? potentialPayout / amountNum : 0;

  const currentOddsUp = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalUp || 1) : 2;
  const currentOddsDown = totalUp + totalDown > 0 ? (totalUp + totalDown) / (totalDown || 1) : 2;

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
            py: 3,
            flexDirection: 'column',
            gap: 0.5,
            transition: 'all 0.3s ease',
            '&.Mui-selected': {
              background: 'rgba(0, 229, 255, 0.08)',
              borderColor: '#00E5FF !important',
              '&:hover': {
                background: 'rgba(0, 229, 255, 0.12)',
              },
            },
          }}
        >
          <TrendingUp sx={{ fontSize: 28, color: side === 'UP' ? '#00E5FF' : 'text.secondary' }} />
          <Typography variant="h6" sx={{ color: side === 'UP' ? '#00E5FF' : 'text.primary' }}>
            UP
          </Typography>
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {currentOddsUp.toFixed(2)}x
          </Typography>
        </ToggleButton>

        <ToggleButton
          value="DOWN"
          sx={{
            py: 3,
            flexDirection: 'column',
            gap: 0.5,
            transition: 'all 0.3s ease',
            '&.Mui-selected': {
              background: 'rgba(255, 82, 82, 0.08)',
              borderColor: '#FF5252 !important',
              '&:hover': {
                background: 'rgba(255, 82, 82, 0.12)',
              },
            },
          }}
        >
          <TrendingDown sx={{ fontSize: 28, color: side === 'DOWN' ? '#FF5252' : 'text.secondary' }} />
          <Typography variant="h6" sx={{ color: side === 'DOWN' ? '#FF5252' : 'text.primary' }}>
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
              py: 1,
              borderColor: 'rgba(255, 255, 255, 0.1)',
              color: 'text.secondary',
              fontWeight: 400,
              transition: 'all 0.2s ease',
              '&:hover': {
                borderColor: 'rgba(255, 255, 255, 0.3)',
                color: '#FFFFFF',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
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
            p: 2.5,
            mb: 3,
            borderRadius: 1,
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
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
            <Typography variant="body2" sx={{ color: side === 'UP' ? '#00E5FF' : '#FF5252', fontWeight: 500 }}>
              {potentialOdds.toFixed(2)}x
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 300 }}>
              Potential Payout
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, color: '#00E5FF' }}>
              ${potentialPayout.toFixed(2)} USDC
            </Typography>
          </Box>
        </Box>
      )}

      {/* Error */}
      {error && (
        <Alert
          severity="error"
          sx={{
            mb: 3,
            backgroundColor: 'rgba(255, 82, 82, 0.1)',
            border: '1px solid rgba(255, 82, 82, 0.3)',
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
            background: pool.status === 'UPCOMING'
              ? 'rgba(255, 255, 255, 0.03)'
              : pool.status === 'ACTIVE'
              ? 'rgba(255, 255, 255, 0.05)'
              : 'rgba(255, 255, 255, 0.05)',
            border: pool.status === 'UPCOMING'
              ? '1px solid rgba(255, 255, 255, 0.1)'
              : pool.status === 'ACTIVE'
              ? '1px solid rgba(255, 255, 255, 0.1)'
              : '1px solid rgba(255, 255, 255, 0.1)',
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
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Betting closed - Waiting for result</Typography>
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
                <AccountBalanceWallet sx={{ fontSize: 18 }} />
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Check Portfolio to claim winnings</Typography>
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
          background: side === 'UP' ? '#00E5FF' : '#FF5252',
          color: side === 'UP' ? '#000' : '#FFF',
          '&:hover': {
            background: side === 'UP' ? 'rgba(0, 229, 255, 0.85)' : 'rgba(255, 82, 82, 0.85)',
          },
          '&:disabled': {
            background: 'rgba(255, 255, 255, 0.1)',
            color: 'rgba(255, 255, 255, 0.3)',
          },
        }}
      >
        {!connected
          ? 'Connect Wallet'
          : pool.status === 'UPCOMING'
          ? 'Pool Not Open Yet'
          : pool.status === 'ACTIVE'
          ? 'Betting Closed'
          : pool.status === 'RESOLVED' || pool.status === 'CLAIMABLE'
          ? 'Pool Ended'
          : isSubmitting
          ? 'Processing...'
          : `Place ${side} Bet`}
      </Button>
    </Box>
  );
}
