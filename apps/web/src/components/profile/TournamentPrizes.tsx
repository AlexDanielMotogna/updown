'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Alert,
} from '@mui/material';
import { OpenInNew } from '@mui/icons-material';
import {
  fetchMyTournamentPrizes,
  claimTournamentPrize,
  type TournamentPrize,
} from '@/lib/api';
import { formatDate } from '@/lib/format';
import { GAIN_COLOR, UP_COLOR, ACCENT_COLOR } from '@/lib/constants';

interface TournamentPrizesProps {
  walletAddress: string | null;
  prizes: TournamentPrize[];
  setPrizes: React.Dispatch<React.SetStateAction<TournamentPrize[]>>;
  prizesLoading: boolean;
}

export function TournamentPrizes({ walletAddress, prizes, setPrizes, prizesLoading }: TournamentPrizesProps) {
  const [claimingTournamentId, setClaimingTournamentId] = useState<string | null>(null);
  const [claimTxResult, setClaimTxResult] = useState<{ id: string; tx: string } | null>(null);
  const [claimPrizeError, setClaimPrizeError] = useState<string | null>(null);

  const handleClaimPrize = async (tournamentId: string) => {
    if (!walletAddress) return;
    setClaimingTournamentId(tournamentId);
    setClaimPrizeError(null);
    setClaimTxResult(null);
    try {
      const res = await claimTournamentPrize(tournamentId, walletAddress);
      if (res.success && res.data) {
        setClaimTxResult({ id: tournamentId, tx: res.data.txSignature });
        setPrizes(prev => prev.map(p => p.id === tournamentId ? { ...p, prizeClaimedTx: res.data!.txSignature } : p));
      } else {
        setClaimPrizeError(res.error?.message || 'Failed to claim');
      }
    } catch {
      setClaimPrizeError('Failed to claim prize');
    } finally {
      setClaimingTournamentId(null);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      {prizesLoading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={28} sx={{ color: 'rgba(255,255,255,0.3)' }} />
        </Box>
      )}

      {!prizesLoading && prizes.length === 0 && (
        <Box sx={{ textAlign: 'center', py: 12 }}>
          <Typography sx={{ color: 'text.secondary', fontSize: '1rem' }}>
            No tournament prizes yet
          </Typography>
        </Box>
      )}

      {!prizesLoading && prizes.length > 0 && (
        <>
          {/* Table header (desktop) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'grid' },
              gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr',
              px: 0,
              py: 1,
              bgcolor: '#0D1219',
            }}
          >
            {['Tournament', 'Asset', 'Prize Pool', 'Fee', 'Payout', 'Date', 'Action'].map((h) => (
              <Typography key={h} variant="caption" sx={{ color: 'text.secondary', fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em' }}>
                {h}
              </Typography>
            ))}
          </Box>

          {/* Rows */}
          {prizes.map((prize) => {
            const prizeUsdc = (Number(prize.prizePool) / 1_000_000).toFixed(2);
            const feeUsdc = (Number(prize.prizePool) * 0.05 / 1_000_000).toFixed(2);
            const netUsdc = (Number(prize.prizePool) * 0.95 / 1_000_000).toFixed(2);
            const claimed = !!prize.prizeClaimedTx;
            const justClaimed = claimTxResult?.id === prize.id;
            const isClaiming = claimingTournamentId === prize.id;
            const tx = prize.prizeClaimedTx || (justClaimed ? claimTxResult?.tx : null);

            return (
              <Box key={prize.id}>
                {/* Desktop row */}
                <Box
                  sx={{
                    display: { xs: 'none', md: 'grid' },
                    gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.2fr',
                    alignItems: 'center',
                    bgcolor: '#0D1219',
                    py: 1.5,
                    transition: 'background 0.15s ease',
                    '&:hover': { background: 'rgba(255,255,255,0.04)' },
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{prize.name}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)' }}>{prize.asset}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${prizeUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.4)', fontVariantNumeric: 'tabular-nums' }}>${feeUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>${netUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
                    {prize.completedAt ? formatDate(prize.completedAt) : '--'}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {!claimed && !justClaimed ? (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isClaiming}
                        onClick={() => handleClaimPrize(prize.id)}
                        sx={{
                          bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.75rem',
                          textTransform: 'none', px: 2, borderRadius: 0,
                          '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                          '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                        }}
                      >
                        {isClaiming ? <CircularProgress size={14} sx={{ color: '#000' }} /> : 'Claim'}
                      </Button>
                    ) : (
                      <>
                        <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                        {tx && (
                          <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                            <OpenInNew sx={{ fontSize: 14, color: ACCENT_COLOR, '&:hover': { color: '#fff' }, transition: 'color 0.15s' }} />
                          </a>
                        )}
                      </>
                    )}
                  </Box>
                </Box>

                {/* Mobile row */}
                <Box
                  sx={{
                    display: { xs: 'block', md: 'none' },
                    bgcolor: '#0D1219',
                    p: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{prize.name}</Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)' }}>
                        {prize.asset} · {prize.completedAt ? formatDate(prize.completedAt) : ''}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                      ${netUsdc}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
                      Pool ${prizeUsdc} · Fee ${feeUsdc}
                    </Typography>
                    {!claimed && !justClaimed ? (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isClaiming}
                        onClick={() => handleClaimPrize(prize.id)}
                        sx={{
                          bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.75rem',
                          textTransform: 'none', px: 2, borderRadius: 0,
                          '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                          '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                        }}
                      >
                        {isClaiming ? <CircularProgress size={14} sx={{ color: '#000' }} /> : 'Claim'}
                      </Button>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                        {tx && (
                          <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                            <OpenInNew sx={{ fontSize: 14, color: ACCENT_COLOR }} />
                          </a>
                        )}
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            );
          })}
        </>
      )}

      {claimPrizeError && (
        <Alert severity="error" onClose={() => setClaimPrizeError(null)} sx={{ bgcolor: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 0 }}>
          {claimPrizeError}
        </Alert>
      )}
    </Box>
  );
}
