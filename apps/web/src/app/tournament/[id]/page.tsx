'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Box, Typography, CircularProgress, Chip, Button, Alert, Avatar, TextField, Dialog, IconButton } from '@mui/material';
import { ArrowBack, EmojiEvents, CheckCircle, Close, InfoOutlined } from '@mui/icons-material';
import Link from 'next/link';
import {
  fetchTournamentBracket,
  submitTournamentPrediction,
  type TournamentBracket,
  type TournamentMatchData,
} from '@/lib/api';
import { UP_COLOR, DOWN_COLOR, ACCENT_COLOR, GAIN_COLOR, getAvatarUrl } from '@/lib/constants';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { usePriceStream } from '@/hooks/usePriceStream';
import { useTournamentRegister } from '@/hooks/useTournamentRegister';
import { AssetIcon } from '@/components/AssetIcon';
import { InlineChart } from '@/components/pool/InlineChart';
import { AppShell } from '@/components';
import { formatDate } from '@/lib/format';

// ─── Design tokens ───────────────────────────────────────────────────────────

const BG = '#0B0F14';
const SURFACE = '#111820';
const BORDER = 'rgba(255,255,255,0.06)';
const MATCH_W = 280;
const CARD_H = 124;
const CARD_GAP = 32;
const PREDICT_COLOR = '#818CF8';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(w: string | null) {
  return w ? `${w.slice(0, 4)}...${w.slice(-4)}` : 'TBD';
}

function getRoundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinals';
  if (fromFinal === 2) return 'Quarterfinals';
  return `Round of ${Math.pow(2, fromFinal + 1)}`;
}

function formatPrice(price: string | null | undefined): string {
  if (!price) return '—';
  const n = Number(price) / 1_000_000;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDistance(prediction: string, finalPrice: string): string {
  const diff = (Number(prediction) - Number(finalPrice)) / 1_000_000;
  const abs = Math.abs(diff);
  const prefix = diff >= 0 ? '+' : '-';
  return `${prefix}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Countdown Component ─────────────────────────────────────────────────────

function Countdown({ target, label, critical }: { target: string; label: string; critical?: boolean }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(target).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Resolving...'); return; }
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${m}:${s.toString().padStart(2, '0')}`);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [target]);

  const diff = new Date(target).getTime() - Date.now();
  const isCritical = critical !== false && diff > 0 && diff < 60000;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
      <Typography sx={{ fontSize: '0.5rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase' }}>
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: '0.65rem',
          fontWeight: 700,
          fontVariantNumeric: 'tabular-nums',
          color: diff <= 0 ? ACCENT_COLOR : isCritical ? DOWN_COLOR : 'rgba(255,255,255,0.5)',
          ...(isCritical && { animation: 'criticalBlink 1s infinite', '@keyframes criticalBlink': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.5 } } }),
        }}
      >
        {remaining}
      </Typography>
    </Box>
  );
}

// ─── Player Row inside Match Card ────────────────────────────────────────────

function PlayerRow({
  wallet,
  prediction,
  distance,
  isWinner,
  isLoser,
  isPending,
}: {
  wallet: string | null;
  prediction: string | null;
  distance: string | null;
  isWinner: boolean;
  isLoser: boolean;
  isPending: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.5,
        py: 1,
        height: 40,
        position: 'relative',
        bgcolor: isWinner ? `${UP_COLOR}08` : 'transparent',
        opacity: isLoser ? 0.35 : 1,
        transition: 'opacity 0.2s',
      }}
    >
      {/* Win indicator bar */}
      {isWinner && (
        <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, bgcolor: UP_COLOR }} />
      )}

      {/* Avatar */}
      {wallet ? (
        <Avatar
          src={getAvatarUrl(wallet)}
          sx={{ width: 22, height: 22, flexShrink: 0 }}
        />
      ) : (
        <Box sx={{ width: 22, height: 22, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.04)', flexShrink: 0 }} />
      )}

      {/* Wallet address */}
      <Typography
        sx={{
          flex: 1,
          fontSize: '0.8rem',
          fontWeight: isWinner ? 700 : 500,
          color: isWinner ? '#fff' : wallet ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.12)',
          fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {truncate(wallet)}
      </Typography>

      {/* Prediction + distance */}
      {prediction ? (
        <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {formatPrice(prediction)}
          </Typography>
          {distance && (
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: isWinner ? UP_COLOR : DOWN_COLOR, fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
              {distance}
            </Typography>
          )}
        </Box>
      ) : isPending && wallet ? (
        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.12)', flexShrink: 0 }}>
          --
        </Typography>
      ) : null}
    </Box>
  );
}

// ─── Prediction Input ────────────────────────────────────────────────────────

function PredictionInput({
  matchId,
  tournamentId,
  currentPrice,
  onSubmitted,
}: {
  matchId: string;
  tournamentId: string;
  currentPrice: string | null;
  onSubmitted: () => void;
}) {
  const { walletAddress } = useWalletBridge();
  const [price, setPrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!walletAddress || !price) return;
    const num = parseFloat(price);
    if (isNaN(num) || num <= 0) {
      setError('Enter a valid price');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await submitTournamentPrediction(tournamentId, matchId, walletAddress, num);
      if (res.success) {
        onSubmitted();
      } else {
        setError(res.error?.message || 'Failed to submit');
      }
    } catch {
      setError('Failed to submit prediction');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Box sx={{ px: 1.25, pb: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
        <TextField
          size="small"
          placeholder="Price prediction"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          type="number"
          inputProps={{ step: 'any', min: 0 }}
          sx={{
            flex: 1,
            '& .MuiInputBase-root': { height: 28, fontSize: '0.72rem', bgcolor: 'rgba(255,255,255,0.03)', borderRadius: '4px' },
            '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,0.08)' },
            '& .MuiInputBase-input': { color: '#fff', py: 0.5, px: 1 },
          }}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
        />
        <Button
          size="small"
          variant="contained"
          disabled={submitting || !price}
          onClick={handleSubmit}
          sx={{
            minWidth: 0,
            px: 1.5,
            py: 0.5,
            height: 28,
            fontSize: '0.65rem',
            fontWeight: 700,
            bgcolor: PREDICT_COLOR,
            color: '#fff',
            textTransform: 'none',
            borderRadius: 0,
            '&:hover': { bgcolor: PREDICT_COLOR, filter: 'brightness(1.15)' },
            '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
          }}
        >
          {submitting ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : 'Predict'}
        </Button>
      </Box>
      {currentPrice && !price && (
        <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.2)' }}>
          Current: ${Number(currentPrice).toLocaleString('en-US', { maximumFractionDigits: 2 })}
        </Typography>
      )}
      {error && (
        <Typography sx={{ fontSize: '0.6rem', color: DOWN_COLOR }}>{error}</Typography>
      )}
    </Box>
  );
}

// ─── Match Modal ─────────────────────────────────────────────────────────────

function MatchModal({
  open,
  onClose,
  match,
  matchLabel,
  asset,
  walletAddress,
  tournamentId,
  livePrice,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  match: TournamentMatchData;
  matchLabel: string;
  asset: string;
  walletAddress: string | null;
  tournamentId: string;
  livePrice: string | null;
  onRefresh: () => void;
}) {
  const isResolved = match.status === 'RESOLVED';
  const isActive = match.status === 'ACTIVE';
  const isPending = match.status === 'PENDING';
  const p1Won = isResolved && match.winnerWallet === match.player1Wallet;
  const p2Won = isResolved && match.winnerWallet === match.player2Wallet;
  const isP1 = walletAddress === match.player1Wallet;
  const isP2 = walletAddress === match.player2Wallet;
  const isMyMatch = isP1 || isP2;
  const myPrediction = isP1 ? match.player1Prediction : isP2 ? match.player2Prediction : null;
  const needsToPredict = isPending && isMyMatch && !myPrediction;

  const p1Distance = isResolved && match.finalPrice && match.player1Prediction
    ? formatDistance(match.player1Prediction, match.finalPrice) : null;
  const p2Distance = isResolved && match.finalPrice && match.player2Prediction
    ? formatDistance(match.player2Prediction, match.finalPrice) : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      sx={{
        '& .MuiDialog-container': {
          alignItems: { xs: 'flex-end', md: 'center' },
        },
      }}
      PaperProps={{
        sx: {
          bgcolor: BG,
          border: `1px solid ${BORDER}`,
          borderRadius: 0,
          overflow: 'hidden',
          m: { xs: 0, md: 4 },
          maxHeight: { xs: '85vh', md: '90vh' },
          width: { xs: '100%', md: undefined },
          animation: { xs: 'slideUp 0.25s ease-out', md: 'none' },
          '@keyframes slideUp': {
            from: { transform: 'translateY(100%)' },
            to: { transform: 'translateY(0)' },
          },
        },
      }}
      TransitionProps={{ timeout: { enter: 250, exit: 200 } }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{matchLabel}</Typography>
          {isPending && match.predictionDeadline && <Countdown target={match.predictionDeadline} label="Predict" />}
          {isActive && match.endTime && <Countdown target={match.endTime} label="Match" />}
          {isResolved && (
            <Chip label="DONE" size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, bgcolor: `${UP_COLOR}15`, color: UP_COLOR }} />
          )}
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: 'rgba(255,255,255,0.4)' }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Players */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <PlayerRow wallet={match.player1Wallet} prediction={match.player1Prediction} distance={p1Distance} isWinner={p1Won} isLoser={isResolved && !p1Won && !!match.player1Wallet} isPending={isPending || isActive} />
        <Box sx={{ height: '1px', bgcolor: BORDER, position: 'relative', my: 0.25 }}>
          <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.5rem', fontWeight: 700, color: isResolved && match.finalPrice ? ACCENT_COLOR : 'rgba(255,255,255,0.15)', bgcolor: BG, px: 0.75, lineHeight: 1 }}>
            {isResolved && match.finalPrice ? formatPrice(match.finalPrice) : 'VS'}
          </Typography>
        </Box>
        <PlayerRow wallet={match.player2Wallet} prediction={match.player2Prediction} distance={p2Distance} isWinner={p2Won} isLoser={isResolved && !p2Won && !!match.player2Wallet} isPending={isPending || isActive} />
      </Box>

      {/* Chart */}
      <Box sx={{ borderTop: `1px solid ${BORDER}` }}>
        <InlineChart asset={asset} livePrice={livePrice} />
      </Box>

      {/* Prediction input — only if hasn't predicted yet */}
      {needsToPredict && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, p: 2 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: PREDICT_COLOR, mb: 1 }}>
            Submit Your Price Prediction
          </Typography>
          <PredictionInput matchId={match.id} tournamentId={tournamentId} currentPrice={livePrice} onSubmitted={() => { onRefresh(); onClose(); }} />
        </Box>
      )}

      {/* Locked — waiting for opponent */}
      {isPending && isMyMatch && myPrediction && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, px: 2, py: 1.5 }}>
          <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
            Prediction locked · Waiting for opponent
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}

// ─── Match Card ──────────────────────────────────────────────────────────────

function MatchCard({
  match,
  matchLabel,
  walletAddress,
  tournamentId,
  asset,
  livePrice,
  onRefresh,
}: {
  match: TournamentMatchData;
  matchLabel: string;
  walletAddress: string | null;
  tournamentId: string;
  asset: string;
  livePrice: string | null;
  onRefresh: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const isResolved = match.status === 'RESOLVED';
  const isActive = match.status === 'ACTIVE';
  const isPending = match.status === 'PENDING';
  const p1Won = isResolved && match.winnerWallet === match.player1Wallet;
  const p2Won = isResolved && match.winnerWallet === match.player2Wallet;

  const isP1 = walletAddress === match.player1Wallet;
  const isP2 = walletAddress === match.player2Wallet;
  const isMyMatch = isP1 || isP2;
  const myPrediction = isP1 ? match.player1Prediction : isP2 ? match.player2Prediction : null;
  const needsToPredict = isPending && isMyMatch && !myPrediction;

  const p1Distance = isResolved && match.finalPrice && match.player1Prediction
    ? formatDistance(match.player1Prediction, match.finalPrice) : null;
  const p2Distance = isResolved && match.finalPrice && match.player2Prediction
    ? formatDistance(match.player2Prediction, match.finalPrice) : null;

  return (
    <>
      <Box
        onClick={() => setModalOpen(true)}
        sx={{
          width: MATCH_W,
          height: CARD_H,
          borderRadius: 0,
          overflow: 'hidden',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          border: needsToPredict ? `1px solid ${PREDICT_COLOR}40`
            : isActive ? `1px solid ${ACCENT_COLOR}30`
            : 'none',
          bgcolor: SURFACE,
          transition: 'border-color 0.2s, box-shadow 0.2s, transform 0.15s',
          ...(needsToPredict && { boxShadow: `0 0 16px ${PREDICT_COLOR}15` }),
          ...(isActive && { boxShadow: `0 0 16px ${ACCENT_COLOR}10` }),
          '&:hover': { bgcolor: '#151c27', transform: 'translateY(-1px)' },
        }}
      >
        {/* Match header */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: `1px solid ${BORDER}` }}>
          <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {matchLabel}
          </Typography>
          {isPending && match.predictionDeadline ? (
            <Countdown target={match.predictionDeadline} label="Predict" />
          ) : isActive && match.endTime ? (
            <Countdown target={match.endTime} label="Live" />
          ) : isResolved ? (
            <Typography variant="caption" sx={{ fontWeight: 700, color: UP_COLOR }}>Done</Typography>
          ) : (
            <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.15)' }}>Pending</Typography>
          )}
        </Box>

        {/* Players */}
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <PlayerRow wallet={match.player1Wallet} prediction={match.player1Prediction} distance={p1Distance} isWinner={p1Won} isLoser={isResolved && !p1Won && !!match.player1Wallet} isPending={isPending || isActive} />
          <Box sx={{ height: '1px', bgcolor: BORDER, position: 'relative' }}>
            <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.6rem', fontWeight: 700, color: isResolved && match.finalPrice ? ACCENT_COLOR : 'rgba(255,255,255,0.1)', bgcolor: SURFACE, px: 1, lineHeight: 1 }}>
              {isResolved && match.finalPrice ? formatPrice(match.finalPrice) : 'vs'}
            </Typography>
          </Box>
          <PlayerRow wallet={match.player2Wallet} prediction={match.player2Prediction} distance={p2Distance} isWinner={p2Won} isLoser={isResolved && !p2Won && !!match.player2Wallet} isPending={isPending || isActive} />
        </Box>
      </Box>

      <MatchModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        match={match}
        matchLabel={matchLabel}
        asset={asset}
        walletAddress={walletAddress}
        tournamentId={tournamentId}
        livePrice={livePrice}
        onRefresh={onRefresh}
      />
    </>
  );
}

// ─── Empty Match Placeholder ─────────────────────────────────────────────────

function EmptyMatchCard({ matchLabel }: { matchLabel: string }) {
  return (
    <Box
      sx={{
        width: MATCH_W,
        height: CARD_H,
        borderRadius: 0,
        overflow: 'hidden',
        border: 'none',
        bgcolor: 'rgba(255,255,255,0.035)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.12)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {matchLabel}
        </Typography>
        <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.08)' }}>Pending</Typography>
      </Box>
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, height: 32 }}>
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.1)' }}>TBD</Typography>
        </Box>
        <Box sx={{ height: '1px', bgcolor: 'rgba(255,255,255,0.03)', position: 'relative' }}>
          <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.08)', bgcolor: 'rgba(255,255,255,0.01)', px: 0.75, lineHeight: 1 }}>VS</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.25, height: 32 }}>
          <Box sx={{ width: 20, height: 20, borderRadius: '50%', bgcolor: 'rgba(255,255,255,0.03)', flexShrink: 0 }} />
          <Typography sx={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.1)' }}>TBD</Typography>
        </Box>
      </Box>
    </Box>
  );
}

// ─── Bracket Round Column ────────────────────────────────────────────────────

function BracketRound({
  roundNum,
  expectedMatchCount,
  matches,
  totalRounds,
  walletAddress,
  tournamentId,
  asset,
  livePrice,
  onRefresh,
}: {
  roundNum: number;
  expectedMatchCount: number;
  matches: TournamentMatchData[];
  totalRounds: number;
  walletAddress: string | null;
  tournamentId: string;
  asset: string;
  livePrice: string | null;
  onRefresh: () => void;
}) {
  const rn = Number(roundNum);
  const tr = Number(totalRounds);
  const label = getRoundLabel(rn, tr);

  const sorted = [...matches].sort((a, b) => a.matchIndex - b.matchIndex);

  // Each card occupies a "slot". In round 1, slot = CARD_H.
  // In round 2, each card is centered between 2 round-1 slots, so slot = 2 * round1Slot.
  // Slot height for round r: CARD_H * 2^(r-1) + CARD_GAP * (2^(r-1) - 1)
  const slotH = CARD_H * Math.pow(2, rn - 1) + CARD_GAP * (Math.pow(2, rn - 1) - 1);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <Typography
        sx={{
          fontSize: '0.68rem',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          textAlign: 'center',
          mb: 2,
          height: 20,
        }}
      >
        {label}
      </Typography>

      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        {Array.from({ length: expectedMatchCount }).map((_, i) => {
          const match = sorted.find(m => m.matchIndex === i);
          return (
            <Box
              key={match?.id || `empty-${rn}-${i}`}
              sx={{
                height: slotH,
                display: 'flex',
                alignItems: 'center',
                mb: i < expectedMatchCount - 1 ? `${CARD_GAP}px` : 0,
              }}
            >
              {match ? (
                <MatchCard
                  match={match}
                  matchLabel={`Match ${rn}.${i + 1}`}
                  walletAddress={walletAddress}
                  tournamentId={tournamentId}
                  asset={asset}
                  livePrice={livePrice}
                  onRefresh={onRefresh}
                />
              ) : (
                <EmptyMatchCard matchLabel={`Match ${rn}.${i + 1}`} />
              )}
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

// ─── Connector Lines ─────────────────────────────────────────────────────────

function Connectors({ matchCount, roundNum }: { matchCount: number; roundNum: number }) {
  const pairs = Math.floor(matchCount / 2);
  if (pairs === 0) return null;

  // Slot height matches BracketRound's calculation
  const rn = Number(roundNum);
  const slotH = CARD_H * Math.pow(2, rn - 1) + CARD_GAP * (Math.pow(2, rn - 1) - 1);
  // Each connector pair spans 2 slots + the gap between them
  const pairH = slotH * 2 + CARD_GAP;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: 32,
        flexShrink: 0,
        mx: 0.5,
        pt: '36px', // 20px label height + 16px mb:2
      }}
    >
      {Array.from({ length: pairs }).map((_, i) => (
        <Box
          key={i}
          sx={{
            height: pairH,
            position: 'relative',
            mb: i < pairs - 1 ? `${CARD_GAP}px` : 0,
          }}
        >
          {/* Top arm: from center of top card to middle */}
          <Box sx={{ position: 'absolute', top: slotH / 2, left: 0, width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          {/* Bottom arm: from center of bottom card to middle */}
          <Box sx={{ position: 'absolute', top: slotH + CARD_GAP + slotH / 2, left: 0, width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          {/* Vertical: connecting top and bottom arms */}
          <Box sx={{ position: 'absolute', top: slotH / 2, left: '50%', height: slotH + CARD_GAP, borderLeft: '1px solid rgba(255,255,255,0.08)' }} />
          {/* Output: from vertical midpoint to right */}
          <Box sx={{ position: 'absolute', top: pairH / 2, left: '50%', width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
        </Box>
      ))}
    </Box>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TournamentBracketPage() {
  const params = useParams();
  const id = params.id as string;
  const { connected, walletAddress } = useWalletBridge();
  const { register, status: regStatus, error: regError, txSignature: regTx, reset } = useTournamentRegister();

  const [bracket, setBracket] = useState<TournamentBracket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);

  const { getPrice } = usePriceStream(bracket ? [bracket.tournament.asset] : []);

  const load = useCallback(async () => {
    try {
      const res = await fetchTournamentBracket(id, walletAddress || undefined);
      if (res.success && res.data) {
        setBracket(res.data);
        setError(null);
      } else {
        setError(res.error?.message || 'Failed to load bracket');
      }
    } catch {
      setError('Failed to load bracket');
    } finally {
      setLoading(false);
    }
  }, [id, walletAddress]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 5_000);
    return () => clearInterval(iv);
  }, [load]);

  if (loading) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', py: 12 }}>
          <CircularProgress size={32} sx={{ color: UP_COLOR }} />
        </Box>
      </AppShell>
    );
  }

  if (error || !bracket) {
    return (
      <AppShell>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, py: 12 }}>
          <Typography sx={{ color: 'rgba(255,255,255,0.5)' }}>{error || 'Tournament not found'}</Typography>
          <Link href="/tournaments" style={{ textDecoration: 'none' }}>
            <Typography sx={{ color: UP_COLOR, fontSize: '0.85rem', '&:hover': { textDecoration: 'underline' } }}>Back to Tournaments</Typography>
          </Link>
        </Box>
      </AppShell>
    );
  }

  const { tournament: t, rounds, participants } = bracket;
  const entryFee = (Number(t.entryFee) / 1_000_000).toFixed(2);
  const prizePool = (Number(t.prizePool) / 1_000_000).toFixed(2);
  const filled = participants?.length ?? 0;
  const isReg = t.status === 'REGISTERING';
  const isActive = t.status === 'ACTIVE';
  const alreadyRegistered = !!(walletAddress && participants?.some(p => p.walletAddress === walletAddress));
  const isBusy = regStatus !== 'idle' && regStatus !== 'success' && regStatus !== 'error';

  const statusColor = isReg ? UP_COLOR : isActive ? ACCENT_COLOR : 'rgba(255,255,255,0.35)';
  const statusLabel = isReg ? 'Registration Open' : isActive ? 'Live' : t.status === 'COMPLETED' ? 'Completed' : t.status;

  const fillPct = Math.round((filled / t.size) * 100);
  const livePrice = getPrice(t.asset);

  return (
    <AppShell>
    <Box sx={{
      '&::-webkit-scrollbar': { width: 3 },
      '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
      '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 0 },
    }}>

      {/* ══════ HEADER ══════ */}
      <Box sx={{ bgcolor: '#0B0F14', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        {/* Title row */}
        <Box sx={{ px: { xs: 1.5, md: 3 }, pt: { xs: 2, md: 3 }, pb: { xs: 1.5, md: 2 } }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Link href="/tournaments">
              <Box component="button" sx={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.4)', p: 0.5, display: 'flex', '&:hover': { color: '#fff' } }}>
                <ArrowBack sx={{ fontSize: 20 }} />
              </Box>
            </Link>
            <AssetIcon asset={t.asset} size={36} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.25 }}>
                <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.name}
                </Typography>
                <Chip
                  label={statusLabel}
                  size="small"
                  sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}25`, borderRadius: 0 }}
                />
                <IconButton
                  onClick={() => setRulesOpen(true)}
                  size="small"
                  sx={{ color: 'rgba(255,255,255,0.3)', p: 0.5, '&:hover': { color: '#fff' } }}
                >
                  <InfoOutlined sx={{ fontSize: 18 }} />
                </IconButton>
              </Box>
              <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>
                {t.asset}/USD · {Number(t.matchDuration) / 60}min matches · {t.size}-player bracket{t.scheduledAt ? ` · Starts ${formatDate(t.scheduledAt)}` : ''}
              </Typography>
            </Box>
          </Box>
        </Box>

        {/* Stats grid — same pattern as ProfileHeader cards */}
        <Box sx={{ bgcolor: '#0D1219' }}>
          <Box sx={{ px: { xs: 1.5, md: 3 }, py: { xs: 1.5, md: 2 } }}>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(6, 1fr)' },
                gap: 0.5,
              }}
            >
              {[
                { label: 'Prize Pool', value: `$${prizePool}`, color: GAIN_COLOR },
                { label: 'Entry Fee', value: `$${entryFee}`, color: '#fff' },
                { label: 'Players', value: `${filled} / ${t.size}`, color: '#fff' },
                { label: 'Current Round', value: Number(t.currentRound) > 0 ? getRoundLabel(Number(t.currentRound), Number(t.totalRounds)) : 'Not started', color: isActive ? ACCENT_COLOR : '#fff' },
                { label: 'Winner', value: t.winnerWallet ? truncate(t.winnerWallet) : '--', color: t.winnerWallet ? '#FFD700' : 'rgba(255,255,255,0.15)' },
                { label: 'Your Status', value: alreadyRegistered || regStatus === 'success' ? 'Registered' : isReg ? 'Not Registered' : '--', color: alreadyRegistered || regStatus === 'success' ? UP_COLOR : 'rgba(255,255,255,0.15)' },
              ].map(({ label, value, color }) => (
                <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', borderRadius: 2, px: { xs: 1.5, md: 3 }, py: 1.5, display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: '100%' }}>
                    <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: 600, color: 'rgba(255,255,255,0.4)', mb: 0.25 }}>
                      {label}
                    </Typography>
                    {/* Register button inside the "Your Status" card */}
                    {label === 'Your Status' && isReg && !alreadyRegistered && regStatus !== 'success' && connected && walletAddress ? (
                      <Button
                        variant="contained"
                        size="small"
                        fullWidth
                        disabled={isBusy}
                        onClick={async () => {
                          if (regStatus === 'error') reset();
                          const ok = await register(id);
                          if (ok) load();
                        }}
                        sx={{
                          bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.8rem',
                          textTransform: 'none', py: 0.75, borderRadius: 0, mt: 0.25,
                          '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' },
                          '&:disabled': { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)' },
                        }}
                      >
                        {isBusy ? <CircularProgress size={14} sx={{ color: '#000' }} /> : `Register · $${entryFee}`}
                      </Button>
                    ) : (
                      <>
                        <Typography sx={{ fontSize: { xs: '1rem', md: '1.25rem' }, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
                          {value}
                        </Typography>
                        {label === 'Your Status' && regTx && (
                          <a href={`https://explorer.solana.com/tx/${regTx}?cluster=devnet`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                            <Typography sx={{ fontSize: '0.65rem', color: ACCENT_COLOR, '&:hover': { textDecoration: 'underline' } }}>
                              View tx
                            </Typography>
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
      </Box>

      {/* Registration error (if any) */}
      {regError && (
        <Alert severity="error" onClose={() => reset()} sx={{ bgcolor: 'rgba(248,113,113,0.1)', border: 'none', borderRadius: 0 }}>
          {regError}
        </Alert>
      )}

      {/* ══════ RULES DIALOG ══════ */}
      <Dialog
        open={rulesOpen}
        onClose={() => setRulesOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#111820', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 0 } }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2.5, pt: 2, pb: 1 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>How it works</Typography>
          <IconButton onClick={() => setRulesOpen(false)} size="small" sx={{ color: 'rgba(255,255,255,0.4)' }}>
            <Close sx={{ fontSize: 18 }} />
          </IconButton>
        </Box>
        <Box sx={{ px: 2.5, pb: 2.5, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Tournament config */}
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
            {[
              { label: 'Players', value: `${t.size}` },
              { label: 'Rounds', value: `${t.totalRounds}` },
              { label: 'Prediction window', value: `${Math.floor(Number(t.predictionWindow) / 60)}min` },
              { label: 'Match duration', value: `${Math.floor(Number(t.matchDuration) / 60)}min` },
              { label: 'Entry fee', value: `$${entryFee}` },
              { label: 'Prize pool', value: `$${prizePool}` },
            ].map(({ label, value }) => (
              <Box key={label} sx={{ bgcolor: 'rgba(255,255,255,0.03)', px: 1.5, py: 1 }}>
                <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', mb: 0.25 }}>{label}</Typography>
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
              </Box>
            ))}
          </Box>

          {/* Flow steps */}
          {[
            { step: '1', title: 'Register', desc: `Pay $${entryFee} entry fee. All fees go to the prize pool.` },
            { step: '2', title: 'Predict', desc: `Each round you have ${Math.floor(Number(t.predictionWindow) / 60)} minutes to predict the closing price of ${t.asset}/USD.` },
            { step: '3', title: 'Wait', desc: `After predictions close, the match runs for ${Math.floor(Number(t.matchDuration) / 60)} minutes while the price moves.` },
            { step: '4', title: 'Closest wins', desc: 'The player whose prediction is closest to the final price advances to the next round.' },
            { step: '5', title: 'Prize', desc: `Last player standing wins $${prizePool} (minus 5% platform fee).` },
          ].map(({ step, title, desc }) => (
            <Box key={step} sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: UP_COLOR, bgcolor: `${UP_COLOR}15`, width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{step}</Typography>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '0.85rem', mb: 0.25 }}>{title}</Typography>
                <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>{desc}</Typography>
              </Box>
            </Box>
          ))}

          <Box sx={{ p: 1.5, bgcolor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
              If you don&apos;t predict before the deadline, your opponent advances automatically.
            </Typography>
          </Box>
        </Box>
      </Dialog>

      {/* ══════ BRACKET VISUALIZATION ══════ */}
      {(() => {
        const totalR = Number(t.totalRounds);
        const size = Number(t.size);
        // Always show all rounds based on tournament size
        const allRounds = Array.from({ length: totalR }, (_, i) => i + 1);
        const isMe = walletAddress === t.winnerWallet;
        const claimed = !!(t as unknown as { prizeClaimedTx?: string }).prizeClaimedTx;

        return (
          <Box
            sx={{
              overflowX: 'auto',
              px: { xs: 1.5, md: 4 },
              py: { xs: 2, md: 4 },
              '&::-webkit-scrollbar': { height: 3, width: 3 },
              '&::-webkit-scrollbar-track': { bgcolor: 'transparent' },
              '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.06)', borderRadius: 0 },
              scrollbarWidth: 'thin',
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'stretch', minWidth: 'max-content', mx: 'auto', maxWidth: 1400 }}>
              {allRounds.map((rn, idx) => {
                const expectedMatches = size / Math.pow(2, rn); // round 1: size/2, round 2: size/4, etc
                const rm = rounds[rn] || [];
                const isLast = idx === allRounds.length - 1;
                return (
                  <Box key={rn} sx={{ display: 'flex', alignItems: 'stretch' }}>
                    <BracketRound
                      roundNum={rn}
                      expectedMatchCount={expectedMatches}
                      matches={rm}
                      totalRounds={totalR}
                      walletAddress={walletAddress}
                      tournamentId={t.id}
                      asset={t.asset}
                      livePrice={livePrice}
                      onRefresh={load}
                    />
                    {!isLast && expectedMatches > 1 && <Connectors matchCount={expectedMatches} roundNum={rn} />}
                  </Box>
                );
              })}

              {/* Champion card — same style as match cards */}
              <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                <Box sx={{ height: 20, mb: 2 }} />
                <Box sx={{ flex: 1, display: 'flex', alignItems: 'center' }}>
                  <Box sx={{ width: 32, display: 'flex', alignItems: 'center', flexShrink: 0, mx: 0.5 }}>
                    <Box sx={{ width: '100%', borderTop: `1px solid rgba(255,255,255,0.08)` }} />
                  </Box>
                  <Box
                    sx={{
                      width: MATCH_W,
                      height: CARD_H,
                      bgcolor: SURFACE,
                      border: 'none',
                      borderRadius: 0,
                      overflow: 'hidden',
                      display: 'flex',
                      flexDirection: 'column',
                      flexShrink: 0,
                    }}
                  >
                    {/* Header — same as match cards */}
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 1.5, py: 0.75, borderBottom: `1px solid ${BORDER}` }}>
                      <Typography variant="caption" sx={{ fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Champion
                      </Typography>
                      <EmojiEvents sx={{ fontSize: 16, color: t.winnerWallet ? '#FFD700' : 'rgba(255,255,255,0.08)' }} />
                    </Box>

                    {/* Content */}
                    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 0.5, px: 1.5 }}>
                      {t.winnerWallet ? (
                        <>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Avatar src={getAvatarUrl(t.winnerWallet)} sx={{ width: 24, height: 24 }} />
                            <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                              {isMe ? 'You!' : truncate(t.winnerWallet)}
                            </Typography>
                          </Box>
                          <Typography sx={{ fontSize: '0.82rem', fontWeight: 700, color: GAIN_COLOR, fontVariantNumeric: 'tabular-nums' }}>
                            ${prizePool} USDC
                          </Typography>
                          {isMe && !claimed && (
                            <Link href="/profile?tab=tournaments" style={{ textDecoration: 'none' }}>
                              <Button size="small" variant="contained" sx={{ bgcolor: UP_COLOR, color: '#000', fontWeight: 700, fontSize: '0.7rem', textTransform: 'none', px: 2, py: 0.5, borderRadius: 0, '&:hover': { bgcolor: UP_COLOR, filter: 'brightness(1.15)' } }}>
                                Claim Prize
                              </Button>
                            </Link>
                          )}
                          {claimed && (
                            <Typography variant="caption" sx={{ color: GAIN_COLOR, fontWeight: 600 }}>Claimed</Typography>
                          )}
                        </>
                      ) : (
                        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.1)' }}>--</Typography>
                      )}
                    </Box>
                  </Box>
                </Box>
              </Box>
            </Box>
          </Box>
        );
      })()}

      {/* (Winner info is now inline in the bracket) */}

      {/* Mobile participants */}
      {!isReg && participants && participants.length > 0 && (
        <Box sx={{ display: { xs: 'block', md: 'none' }, px: 1.5, pb: 4 }}>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 600, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', mb: 1 }}>
            Participants ({participants.length})
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {participants.sort((a, b) => a.seed - b.seed).map((p) => (
              <Chip
                key={p.walletAddress}
                avatar={<Avatar src={getAvatarUrl(p.walletAddress)} sx={{ width: 16, height: 16 }} />}
                label={`#${p.seed} ${truncate(p.walletAddress)}`}
                size="small"
                sx={{
                  fontFamily: 'monospace',
                  fontSize: '0.62rem',
                  height: 22,
                  bgcolor: p.eliminatedRound ? 'rgba(255,255,255,0.02)' : `${UP_COLOR}08`,
                  color: p.eliminatedRound ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.55)',
                  textDecoration: p.eliminatedRound ? 'line-through' : 'none',
                  '& .MuiChip-avatar': { width: 16, height: 16 },
                }}
              />
            ))}
          </Box>
        </Box>
      )}
    </Box>
    </AppShell>
  );
}
