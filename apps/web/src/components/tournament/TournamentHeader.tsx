'use client';

import { Box, Typography, Chip, Button, CircularProgress, IconButton } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
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

  return (
    <Box sx={{ bgcolor: '#0D1219' }}>
      {/* Compact title bar */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: { xs: 1, md: 2 }, py: 0.75, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <Link href="/tournaments">
          <Box component="button" sx={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', p: 0.25, display: 'flex', '&:hover': { color: '#fff' } }}>
            <ArrowBack sx={{ fontSize: 16 }} />
          </Box>
        </Link>
        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
      </Box>

      {/* Stats grid */}
      <Box sx={{ px: { xs: 1, md: 2 }, py: { xs: 1, md: 1.25 } }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, 1fr)', sm: 'repeat(4, 1fr)', md: 'repeat(8, 1fr)' }, gap: 0.5 }}>
          {[
            { label: 'Asset', value: t.asset, color: '#fff', icon: true },
            { label: 'Prize Pool', value: `$${prizePool}`, color: GAIN_COLOR },
            { label: 'Entry', value: `$${entryFee}`, color: '#fff' },
            { label: 'Players', value: `${filled}/${t.size}`, color: '#fff' },
            { label: 'Round', value: Number(t.currentRound) > 0 ? getRoundLabel(Number(t.currentRound), Number(t.totalRounds)) : 'Not started', color: isActive ? ACCENT_COLOR : '#fff' },
            { label: 'Winner', value: t.winnerWallet ? truncate(t.winnerWallet) : '--', color: t.winnerWallet ? '#FFD700' : 'rgba(255,255,255,0.15)' },
            { label: 'Starts', value: t.scheduledAt ? formatDate(t.scheduledAt) : 'TBD', color: t.scheduledAt ? '#fff' : 'rgba(255,255,255,0.15)' },
            { label: 'Status', value: alreadyRegistered || regStatus === 'success' ? 'Registered' : isReg ? 'Not Registered' : '--', color: alreadyRegistered || regStatus === 'success' ? UP_COLOR : 'rgba(255,255,255,0.15)' },
          ].map(({ label, value, color, icon }) => (
            <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: 1.5, py: 1, display: 'flex', alignItems: 'center' }}>
              <Box sx={{ width: '100%' }}>
                <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', mb: 0.25 }}>{label}</Typography>
                {label === 'Status' && isReg && !alreadyRegistered && regStatus !== 'success' && connected && walletAddress ? (
                  <Button
                    variant="contained" size="small" fullWidth disabled={isBusy}
                    onClick={onRegister}
                    sx={{ bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', py: 0.5, borderRadius: 0, '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' }, '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' } }}
                  >
                    {isBusy ? <CircularProgress size={12} sx={{ color: '#000' }} /> : `Register · $${entryFee}`}
                  </Button>
                ) : (
                  <>
                    {icon ? (
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <AssetIcon asset={value} size={18} />
                        <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, fontWeight: 700, color }}>{value}</Typography>
                      </Box>
                    ) : (
                      <Typography sx={{ fontSize: { xs: '0.85rem', md: '1rem' }, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
                    )}
                    {label === 'Status' && regTx && (
                      <a href={`https://explorer.solana.com/tx/${regTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <Typography sx={{ fontSize: '0.6rem', color: ACCENT_COLOR, '&:hover': { textDecoration: 'underline' } }}>View tx</Typography>
                      </a>
                    )}
                  </>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
