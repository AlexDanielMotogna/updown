'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Chip, Button, CircularProgress, IconButton } from '@mui/material';
import { ArrowBack, ExpandMore, ExpandLess } from '@mui/icons-material';
import Link from 'next/link';
import { UP_COLOR, ACCENT_COLOR, GAIN_COLOR } from '@/lib/constants';
import { AssetIcon } from '@/components/AssetIcon';
import { formatDate } from '@/lib/format';
import { truncate, getRoundLabel } from './tournament-utils';
import type { TournamentSummary } from '@/lib/api';
import type { RegisterStatus } from '@/hooks/useTournamentRegister';

interface Props {
  tournament: TournamentSummary;
  filled: number;
  entryFee: string;
  prizePool: string;
  connected: boolean;
  walletAddress: string | null;
  alreadyRegistered: boolean;
  regStatus: RegisterStatus;
  regTx: string | null;
  isBusy: boolean;
  onRegister: () => void;
  onInfoClick: () => void;
}

export function TournamentHeader({
  tournament: t, filled, entryFee, prizePool, connected, walletAddress,
  alreadyRegistered, regStatus, regTx, isBusy, onRegister, onInfoClick,
}: Props) {
  const isReg = t.status === 'REGISTERING';
  const isActive = t.status === 'ACTIVE';
  const statusColor = isReg ? UP_COLOR : isActive ? ACCENT_COLOR : 'rgba(255,255,255,0.35)';
  const statusLabel = isReg ? 'Open' : isActive ? 'Live' : t.status === 'COMPLETED' ? 'Done' : t.status;

  const [statsOpen, setStatsOpen] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem('tournament-stats-open');
    if (saved === '0') setStatsOpen(false);
  }, []);
  const toggleStats = () => {
    const next = !statsOpen;
    setStatsOpen(next);
    localStorage.setItem('tournament-stats-open', next ? '1' : '0');
  };

  const cards = [
    { label: 'Asset', value: t.asset, color: '#fff', icon: true },
    { label: 'Prize', value: `$${prizePool}`, color: GAIN_COLOR },
    { label: 'Entry', value: `$${entryFee}`, color: '#fff' },
    { label: 'Players', value: `${filled}/${t.size}`, color: '#fff' },
    { label: 'Round', value: Number(t.currentRound) > 0 ? getRoundLabel(Number(t.currentRound), Number(t.totalRounds)) : 'Not started', color: isActive ? ACCENT_COLOR : '#fff' },
    { label: 'Winner', value: t.winnerWallet ? truncate(t.winnerWallet) : '--', color: t.winnerWallet ? '#FFD700' : 'rgba(255,255,255,0.15)' },
    { label: 'Starts', value: t.scheduledAt ? formatDate(t.scheduledAt) : 'TBD', color: t.scheduledAt ? '#fff' : 'rgba(255,255,255,0.15)' },
    { label: 'Status', value: alreadyRegistered || regStatus === 'success' ? 'Registered' : isReg ? 'Not Registered' : '--', color: alreadyRegistered || regStatus === 'success' ? UP_COLOR : 'rgba(255,255,255,0.15)' },
  ];

  return (
    <Box sx={{ bgcolor: '#0D1219' }}>
      {/* Title bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, md: 2 }, py: 0.75, borderBottom: statsOpen ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
        <Link href="/tournaments">
          <Box component="button" sx={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', p: 0.25, display: 'flex', '&:hover': { color: '#fff' } }}>
            <ArrowBack sx={{ fontSize: 16 }} />
          </Box>
        </Link>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {t.name}
        </Typography>
        <Chip label={statusLabel} size="small" sx={{ fontWeight: 700, fontSize: '0.6rem', height: 18, bgcolor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}25`, borderRadius: 0 }} />
        <Button
          onClick={onInfoClick}
          size="small"
          sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'none', '&:hover': { color: '#fff', bgcolor: 'rgba(255,255,255,0.04)' } }}
        >
          Readme
        </Button>
        <IconButton onClick={toggleStats} size="small" sx={{ color: 'rgba(255,255,255,0.3)', p: 0.25, '&:hover': { color: '#fff' } }}>
          {statsOpen ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* Stats grid — collapsible */}
      {statsOpen && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' }, gap: 0.5, px: { xs: 0.5, md: 2 }, py: { xs: 0.5, md: 1.25 } }}>
            {cards.map(({ label, value, color, icon }) => (
              <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: { xs: 0.75, md: 1.5 }, py: { xs: 0.5, md: 1 }, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: '100%' }}>
                  <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.65rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.35)', mb: 0.25 }}>{label}</Typography>
                  {label === 'Status' && isReg && !alreadyRegistered && regStatus !== 'success' && connected && walletAddress ? (
                    <Button
                      variant="contained" size="small" fullWidth disabled={isBusy}
                      onClick={onRegister}
                      sx={{ bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: { xs: '0.6rem', md: '0.7rem' }, textTransform: 'none', py: { xs: 0.25, md: 0.5 }, borderRadius: 0, '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' }, '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' } }}
                    >
                      {isBusy ? <CircularProgress size={10} sx={{ color: '#000' }} /> : `$${entryFee}`}
                    </Button>
                  ) : (
                    <>
                      {icon ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AssetIcon asset={value} size={14} />
                          <Typography sx={{ fontSize: { xs: '0.7rem', md: '1rem' }, fontWeight: 700, color }}>{value}</Typography>
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: { xs: '0.7rem', md: '1rem' }, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
                      )}
                      {label === 'Status' && regTx && (
                        <a href={`https://explorer.solana.com/tx/${regTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                          <Typography sx={{ fontSize: '0.55rem', color: ACCENT_COLOR, '&:hover': { textDecoration: 'underline' } }}>View tx</Typography>
                        </a>
                      )}
                    </>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
      )}
    </Box>
  );
}
