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
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

interface TournamentPrizesProps {
  walletAddress: string | null;
  prizes: TournamentPrize[];
  setPrizes: React.Dispatch<React.SetStateAction<TournamentPrize[]>>;
  prizesLoading: boolean;
}

export function TournamentPrizes({ walletAddress, prizes, setPrizes, prizesLoading }: TournamentPrizesProps) {
  const t = useThemeTokens();
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
          <CircularProgress size={28} sx={{ color: t.text.dimmed }} />
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
              bgcolor: t.bg.surfaceAlt,
              border: t.surfaceBorder,
              boxShadow: t.surfaceShadow,
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
                    bgcolor: t.bg.surfaceAlt,
                    border: t.surfaceBorder,
                    boxShadow: t.surfaceShadow,
                    py: 1.5,
                    transition: 'background 0.15s ease',
                    '&:hover': { background: t.border.subtle },
                  }}
                >
                  <Typography sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{prize.name}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: t.text.strong }}>{prize.asset}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>${prizeUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>${feeUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.gain, fontVariantNumeric: 'tabular-nums' }}>${netUsdc}</Typography>
                  <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary }}>
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
                          bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: '0.75rem',
                          textTransform: 'none', px: 2, borderRadius: 1,
                          '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
                          '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
                        }}
                      >
                        {isClaiming ? <CircularProgress size={14} sx={{ color: t.text.contrast }} /> : 'Claim'}
                      </Button>
                    ) : (
                      <>
                        <Typography variant="caption" sx={{ color: t.gain, fontWeight: 600 }}>Claimed</Typography>
                        {tx && (
                          <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                            <OpenInNew sx={{ fontSize: 14, color: t.accent, '&:hover': { color: t.text.primary }, transition: 'color 0.15s' }} />
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
                    bgcolor: t.bg.surfaceAlt,
                    border: t.surfaceBorder,
                    boxShadow: t.surfaceShadow,
                    p: 2,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
                    <Box>
                      <Typography sx={{ fontWeight: 600, fontSize: '0.9rem' }}>{prize.name}</Typography>
                      <Typography variant="caption" sx={{ color: t.text.tertiary }}>
                        {prize.asset} · {prize.completedAt ? formatDate(prize.completedAt) : ''}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontWeight: 700, fontSize: '0.95rem', color: t.gain, fontVariantNumeric: 'tabular-nums' }}>
                      ${netUsdc}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: t.text.quaternary }}>
                      Pool ${prizeUsdc} · Fee ${feeUsdc}
                    </Typography>
                    {!claimed && !justClaimed ? (
                      <Button
                        variant="contained"
                        size="small"
                        disabled={isClaiming}
                        onClick={() => handleClaimPrize(prize.id)}
                        sx={{
                          bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: '0.75rem',
                          textTransform: 'none', px: 2, borderRadius: 1,
                          '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' },
                          '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed },
                        }}
                      >
                        {isClaiming ? <CircularProgress size={14} sx={{ color: t.text.contrast }} /> : 'Claim'}
                      </Button>
                    ) : (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                        <Typography variant="caption" sx={{ color: t.gain, fontWeight: 600 }}>Claimed</Typography>
                        {tx && (
                          <a href={`https://explorer.solana.com/tx/${tx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ display: 'flex' }}>
                            <OpenInNew sx={{ fontSize: 14, color: t.accent }} />
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
        <Alert severity="error" onClose={() => setClaimPrizeError(null)} sx={{ bgcolor: withAlpha(t.down, 0.1), border: 'none', borderRadius: 1 }}>
          {claimPrizeError}
        </Alert>
      )}
    </Box>
  );
}
