'use client';

import { useState } from 'react';
import { Box, Container, Typography, TextField, Button, CircularProgress } from '@mui/material';
import { CheckCircle, ErrorOutline } from '@mui/icons-material';
import { AppShell } from '@/components';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { API_BASE_URL, UP_COLOR, GAIN_COLOR, DOWN_COLOR, ACCENT_COLOR, EXPLORER_URL, SOLANA_CLUSTER } from '@/lib/constants';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function FaucetPage() {
  const { connected, walletAddress } = useWalletBridge();
  const [address, setAddress] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [txSignature, setTxSignature] = useState('');
  const [error, setError] = useState('');
  const [amount, setAmount] = useState(0);
  const [solAmount, setSolAmount] = useState(0);

  const inputAddress = address || walletAddress || '';

  const handleMint = async () => {
    if (!inputAddress) return;
    setStatus('loading');
    setError('');
    setTxSignature('');
    try {
      const res = await fetch(`${API_BASE_URL}/api/transactions/faucet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: inputAddress }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to mint');
      }
      setTxSignature(data.txSignature);
      setAmount(data.amount);
      setSolAmount(data.solAmount || 0);
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setStatus('idle');
    setTxSignature('');
    setError('');
  };

  return (
    <AppShell>
      <Container maxWidth="sm" sx={{ py: { xs: 4, md: 8 } }}>
        <Box sx={{ textAlign: 'center', mb: 4 }}>
          <Box component="img" src="/updown-logos/Logo_cyan_text_white.png" alt="UpDown" sx={{ height: 36, mb: 2 }} />
          <Typography sx={{ fontSize: '1.5rem', fontWeight: 700, mb: 1 }}>
            Devnet USDC Faucet
          </Typography>
          <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            Mint free test USDC + SOL on Solana devnet to start playing on UpDown. 1,000 USDC + 0.05 SOL per request, 1 hour cooldown.
          </Typography>
        </Box>

        <Box sx={{ bgcolor: '#0D1219', p: { xs: 3, md: 4 }, display: 'flex', flexDirection: 'column', gap: 3 }}>
          {/* Wallet input */}
          <Box>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.08em', mb: 1 }}>
              WALLET ADDRESS
            </Typography>
            <TextField
              fullWidth
              placeholder="Enter Solana wallet address"
              value={address || walletAddress || ''}
              onChange={(e) => setAddress(e.target.value)}
              disabled={status === 'loading'}
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: 'rgba(255,255,255,0.03)',
                  color: '#fff',
                  fontSize: '0.9rem',
                  '& fieldset': { borderColor: 'rgba(255,255,255,0.1)' },
                  '&:hover fieldset': { borderColor: 'rgba(255,255,255,0.2)' },
                  '&.Mui-focused fieldset': { borderColor: UP_COLOR },
                },
                '& .MuiOutlinedInput-input': {
                  py: 1.5,
                  '&::placeholder': { color: 'rgba(255,255,255,0.3)', opacity: 1 },
                },
              }}
            />
            {connected && !address && (
              <Typography sx={{ fontSize: '0.8rem', color: UP_COLOR, mt: 0.5 }}>
                Using your connected wallet
              </Typography>
            )}
          </Box>

          {/* Mint button */}
          {status === 'idle' && (
            <Button
              fullWidth
              variant="contained"
              onClick={handleMint}
              disabled={!inputAddress}
              sx={{
                py: 1.5,
                fontSize: '1rem',
                fontWeight: 700,
                textTransform: 'none',
                background: `linear-gradient(135deg, ${UP_COLOR}, ${GAIN_COLOR})`,
                color: '#000',
                '&:hover': { background: `linear-gradient(135deg, ${UP_COLOR}DD, ${GAIN_COLOR}DD)` },
                '&:disabled': { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' },
              }}
            >
              Mint 1,000 USDC + 0.05 SOL
            </Button>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
              <CircularProgress size={40} sx={{ color: UP_COLOR }} />
              <Typography sx={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.7)' }}>
                Minting USDC + SOL to your wallet...
              </Typography>
            </Box>
          )}

          {/* Success */}
          {status === 'success' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
              <CheckCircle sx={{ fontSize: 48, color: GAIN_COLOR }} />
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 700, color: GAIN_COLOR }}>
                {amount} USDC{solAmount > 0 ? ` + ${solAmount} SOL` : ''} Minted!
              </Typography>
              {txSignature && (
                <Box
                  component="a"
                  href={`${EXPLORER_URL}/tx/${txSignature}?cluster=${SOLANA_CLUSTER}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    fontSize: '0.85rem',
                    color: ACCENT_COLOR,
                    textDecoration: 'none',
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  View transaction on Solana Explorer
                </Box>
              )}
              <Button
                variant="outlined"
                onClick={handleReset}
                sx={{
                  mt: 1,
                  textTransform: 'none',
                  borderColor: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.4)' },
                }}
              >
                Mint Again
              </Button>
            </Box>
          )}

          {/* Error */}
          {status === 'error' && (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, py: 2 }}>
              <ErrorOutline sx={{ fontSize: 48, color: DOWN_COLOR }} />
              <Typography sx={{ fontSize: '0.95rem', color: DOWN_COLOR, textAlign: 'center' }}>
                {error}
              </Typography>
              <Button
                variant="outlined"
                onClick={handleReset}
                sx={{
                  textTransform: 'none',
                  borderColor: 'rgba(255,255,255,0.2)',
                  color: '#fff',
                  '&:hover': { borderColor: 'rgba(255,255,255,0.4)' },
                }}
              >
                Try Again
              </Button>
            </Box>
          )}
        </Box>

        {/* Info */}
        <Box sx={{ mt: 3, display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {[
            { label: 'Network', value: 'Solana Devnet', color: UP_COLOR },
            { label: 'USDC per mint', value: '1,000 USDC', color: GAIN_COLOR },
            { label: 'SOL per mint', value: '0.05 SOL (for tx fees)', color: ACCENT_COLOR },
            { label: 'Cooldown', value: '1 hour per wallet', color: ACCENT_COLOR },
            { label: 'Tokens', value: 'Devnet only (not real)', color: 'rgba(255,255,255,0.5)' },
          ].map((row) => (
            <Box key={row.label} sx={{ display: 'flex', justifyContent: 'space-between', px: 2, py: 1, bgcolor: '#0D1219' }}>
              <Typography sx={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>{row.label}</Typography>
              <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: row.color }}>{row.value}</Typography>
            </Box>
          ))}
        </Box>
      </Container>
    </AppShell>
  );
}
