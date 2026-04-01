'use client';

import { useState, useEffect } from 'react';
import { Box, Typography, Chip, Button, CircularProgress, IconButton } from '@mui/material';
import { ArrowBack, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useBadgeLookup } from '@/hooks/useCategories';
import Link from 'next/link';
import { AssetIcon } from '@/components/AssetIcon';
import { formatDate } from '@/lib/format';
import { truncate, getRoundLabel } from './tournament-utils';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
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
  tournament: tour, filled, entryFee, prizePool, connected, walletAddress,
  alreadyRegistered, regStatus, regTx, isBusy, onRegister, onInfoClick,
}: Props) {
  const t = useThemeTokens();
  const getBadge = useBadgeLookup();
  const isReg = tour.status === 'REGISTERING';
  const isActive = tour.status === 'ACTIVE';
  const statusColor = isReg ? t.up : isActive ? t.accent : t.text.quaternary;
  const statusLabel = isReg ? 'Open' : isActive ? 'Live' : tour.status === 'COMPLETED' ? 'Done' : tour.status;

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

  const isSports = tour.tournamentType === 'SPORTS';
  const leagueNames: Record<string, string> = { CL: 'UCL', PL: 'Premier', PD: 'La Liga', SA: 'Serie A', BL1: 'Bundesliga', FL1: 'Ligue 1' };

  const cards: Array<{ label: string; value: string; color: string; icon?: boolean; leagueCode?: string | null }> = [
    isSports
      ? { label: 'League', value: leagueNames[tour.league || ''] || tour.league || 'Soccer', color: t.text.primary, leagueCode: tour.league }
      : { label: 'Asset', value: tour.asset, color: t.text.primary, icon: true },
    { label: 'Prize', value: `$${prizePool}`, color: t.gain },
    { label: 'Entry', value: `$${entryFee}`, color: t.text.primary },
    { label: 'Players', value: `${filled}/${tour.size}`, color: t.text.primary },
    { label: 'Round', value: Number(tour.currentRound) > 0 ? getRoundLabel(Number(tour.currentRound), Number(tour.totalRounds)) : 'Not started', color: isActive ? t.accent : t.text.primary },
    { label: 'Winner', value: tour.winnerWallet ? truncate(tour.winnerWallet) : '--', color: tour.winnerWallet ? t.gold : 'rgba(255,255,255,0.15)' },
    { label: 'Starts', value: tour.scheduledAt ? formatDate(tour.scheduledAt) : 'TBD', color: tour.scheduledAt ? t.text.primary : 'rgba(255,255,255,0.15)' },
    { label: 'Status', value: alreadyRegistered || regStatus === 'success' ? 'Registered' : isReg ? 'Not Registered' : '--', color: alreadyRegistered || regStatus === 'success' ? t.up : 'rgba(255,255,255,0.15)' },
  ];

  return (
    <Box sx={{ bgcolor: t.bg.surfaceAlt }}>
      {/* Title bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, md: 2 }, py: 0.75, borderBottom: statsOpen ? `1px solid ${t.border.subtle}` : 'none' }}>
        <Link href="/tournaments">
          <Box component="button" sx={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text.quaternary, p: 0.25, display: 'flex', '&:hover': { color: t.text.primary } }}>
            <ArrowBack sx={{ fontSize: 16 }} />
          </Box>
        </Link>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {tour.name}
        </Typography>
        <Chip label={statusLabel} size="small" sx={{ fontWeight: 700, fontSize: '0.6rem', height: 18, bgcolor: withAlpha(statusColor, 0.08), color: statusColor, border: `1px solid ${withAlpha(statusColor, 0.15)}`, borderRadius: 0 }} />
        <Button
          onClick={onInfoClick}
          size="small"
          sx={{ minWidth: 0, px: 1, py: 0.25, fontSize: '0.65rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'none', '&:hover': { color: t.text.primary, bgcolor: t.hover.default } }}
        >
          Readme
        </Button>
        <IconButton onClick={toggleStats} size="small" sx={{ color: t.text.dimmed, p: 0.25, '&:hover': { color: t.text.primary } }}>
          {statsOpen ? <ExpandLess sx={{ fontSize: 16 }} /> : <ExpandMore sx={{ fontSize: 16 }} />}
        </IconButton>
      </Box>

      {/* Stats grid — collapsible */}
      {statsOpen && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' }, gap: 0.5, px: { xs: 0.5, md: 2 }, py: { xs: 0.5, md: 1.25 } }}>
            {cards.map(({ label, value, color, icon, leagueCode }) => (
              <Box key={label} sx={{ bgcolor: t.hover.light, px: { xs: 0.75, md: 1.5 }, py: { xs: 0.5, md: 1 }, display: 'flex', alignItems: 'center' }}>
                <Box sx={{ width: '100%' }}>
                  <Typography sx={{ fontSize: { xs: '0.55rem', md: '0.65rem' }, fontWeight: 600, color: t.text.quaternary, mb: 0.25 }}>{label}</Typography>
                  {label === 'Status' && isReg && !alreadyRegistered && regStatus !== 'success' && connected && walletAddress ? (
                    <Button
                      variant="contained" size="small" fullWidth disabled={isBusy}
                      onClick={onRegister}
                      sx={{ bgcolor: t.up, color: t.text.contrast, fontWeight: 700, fontSize: { xs: '0.6rem', md: '0.7rem' }, textTransform: 'none', py: { xs: 0.25, md: 0.5 }, borderRadius: 0, '&:hover': { bgcolor: t.up, filter: 'brightness(1.15)' }, '&:disabled': { bgcolor: t.border.default, color: t.text.dimmed } }}
                    >
                      {isBusy ? <CircularProgress size={10} sx={{ color: t.text.contrast }} /> : `$${entryFee}`}
                    </Button>
                  ) : (
                    <>
                      {(icon || leagueCode) ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          {leagueCode ? (
                            <Box component="img" src={getBadge(leagueCode) || ''} alt="" sx={{ width: 14, height: 14, objectFit: 'contain', bgcolor: t.text.vivid, borderRadius: '50%', p: '1px' }} />
                          ) : (
                            <AssetIcon asset={value} size={14} />
                          )}
                          <Typography sx={{ fontSize: { xs: '0.7rem', md: '1rem' }, fontWeight: 700, color }}>{value}</Typography>
                        </Box>
                      ) : (
                        <Typography sx={{ fontSize: { xs: '0.7rem', md: '1rem' }, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</Typography>
                      )}
                      {label === 'Status' && regTx && (
                        <a href={`https://explorer.solana.com/tx/${regTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                          <Typography sx={{ fontSize: '0.55rem', color: t.accent, '&:hover': { textDecoration: 'underline' } }}>View tx</Typography>
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
