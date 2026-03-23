'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Chip,
} from '@mui/material';
import { EmojiEvents } from '@mui/icons-material';
import Link from 'next/link';
import { AppShell, AssetIcon } from '@/components';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { UP_COLOR, ACCENT_COLOR, GAIN_COLOR } from '@/lib/constants';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useTournamentRegister, type RegisterStatus } from '@/hooks/useTournamentRegister';

const STATUS_COLORS: Record<string, string> = {
  REGISTERING: UP_COLOR,
  ACTIVE: ACCENT_COLOR,
  COMPLETED: 'rgba(255,255,255,0.35)',
};

const STATUS_LABELS: Record<string, string> = {
  REGISTERING: 'Open',
  ACTIVE: 'Live',
  COMPLETED: 'Ended',
};

const STATUS_BUTTON_LABEL: Record<RegisterStatus, string> = {
  idle: 'Register',
  preparing: 'Preparing...',
  signing: 'Sign in Wallet...',
  confirming: 'Confirming...',
  registering: 'Registering...',
  success: 'Registered',
  error: 'Try Again',
};

function TournamentCard({ t, onRegistered }: { t: TournamentSummary; onRegistered: () => void }) {
  const { connected, walletAddress } = useWalletBridge();
  const { register, status: regStatus, error: regError, reset } = useTournamentRegister();
  const entryFeeUsdc = (Number(t.entryFee) / 1_000_000).toFixed(2);
  const prizePoolUsdc = (Number(t.prizePool) / 1_000_000).toFixed(2);
  const statusColor = STATUS_COLORS[t.status] || 'rgba(255,255,255,0.35)';
  const statusLabel = STATUS_LABELS[t.status] || t.status;
  const filled = t.participantCount ?? t._count?.participants ?? 0;
  const isRegistering = t.status === 'REGISTERING';
  const alreadyRegistered = !!(walletAddress && t.participantWallets?.includes(walletAddress));
  const isRegistered = alreadyRegistered || regStatus === 'success';
  const isBusy = regStatus !== 'idle' && regStatus !== 'success' && regStatus !== 'error';

  return (
    <Box
      sx={{
        bgcolor: '#0D1219',
        borderRadius: 0,
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'background 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            component="img"
            src={`/tournaments/tournament-${t.asset.toLowerCase()}.png`}
            alt={t.asset}
            sx={{ width: 36, height: 36, objectFit: 'contain' }}
          />
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.name}</Typography>
        </Box>
        <Chip
          label={statusLabel}
          size="small"
          sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}25`, borderRadius: 0 }}
        />
      </Box>

      {/* Info grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        <Box>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Asset</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <AssetIcon asset={t.asset} size={20} />
            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.asset}</Typography>
          </Box>
        </Box>
        <InfoItem label="Entry Fee" value={`$${entryFeeUsdc}`} />
        <InfoItem label="Players" value={`${filled} / ${t.size}`} />
        <InfoItem label="Prize Pool" value={`$${prizePoolUsdc}`} color={GAIN_COLOR} />
      </Box>

      {/* Round info */}
      {t.status !== 'REGISTERING' && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          Round {t.currentRound} / {t.totalRounds}
        </Typography>
      )}

      {/* Buttons — always same structure */}
      <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
        {/* Register / Registered button */}
        {isRegistering && connected ? (
          <Button
            variant="contained"
            disabled={isBusy || isRegistered}
            onClick={async () => {
              if (regStatus === 'error') reset();
              const ok = await register(t.id);
              if (ok) onRegistered();
            }}
            sx={{
              flex: 1,
              bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : regStatus === 'error' ? 'rgba(248,113,113,0.15)' : UP_COLOR,
              color: isRegistered ? UP_COLOR : regStatus === 'error' ? '#F87171' : '#000',
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 0,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : `${UP_COLOR}CC`, boxShadow: 'none' },
              '&:disabled': isRegistered
                ? { bgcolor: 'rgba(255,255,255,0.04)', color: UP_COLOR }
                : { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' },
            }}
          >
            {isBusy ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
                {STATUS_BUTTON_LABEL[regStatus]}
              </Box>
            ) : isRegistered ? 'Registered' : regStatus === 'error' ? 'Try Again' : `Register · $${entryFeeUsdc}`}
          </Button>
        ) : isRegistering ? (
          <Button disabled fullWidth sx={{ flex: 1, fontSize: '0.8rem', textTransform: 'none', borderRadius: 0, py: 0.75, color: 'rgba(255,255,255,0.25)' }}>
            Connect wallet
          </Button>
        ) : null}

        {/* View button */}
        <Link href={`/tournament/${t.id}`} style={{ textDecoration: 'none', flex: isRegistering ? undefined : 1 }}>
          <Button
            fullWidth
            variant="contained"
            sx={{
              bgcolor: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 0,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', boxShadow: 'none' },
            }}
          >
            View
          </Button>
        </Link>
      </Box>

      {/* Error */}
      {regError && (
        <Typography sx={{ fontSize: '0.65rem', color: '#F87171', textAlign: 'center' }}>{regError}</Typography>
      )}
    </Box>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: color || '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function TournamentsPage() {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetchTournaments();
      if (res.success && res.data) {
        setTournaments(res.data);
        setError(null);
      } else {
        setError(res.error?.message || 'Failed to load tournaments');
      }
    } catch {
      setError('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
        {/* Page header */}
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', md: '1.6rem' }, mb: 0.5 }}>
            Tournaments
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            Compete head-to-head in bracket-style elimination tournaments.
          </Typography>
        </Box>

        {/* Error */}
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              bgcolor: 'rgba(248,113,113,0.1)',
              border: 'none',
              borderRadius: 1,
            }}
          >
            {error}
          </Alert>
        )}

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: UP_COLOR }} />
          </Box>
        )}

        {/* Tournament cards */}
        {!loading && tournaments.length === 0 && !error && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <EmojiEvents sx={{ fontSize: 48, color: 'rgba(255,255,255,0.1)', mb: 2 }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
              No tournaments available right now. Check back soon!
            </Typography>
          </Box>
        )}

        {!loading && tournaments.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {tournaments.map((t) => (
              <TournamentCard key={t.id} t={t} onRegistered={load} />
            ))}
          </Box>
        )}
      </Container>
    </AppShell>
  );
}
