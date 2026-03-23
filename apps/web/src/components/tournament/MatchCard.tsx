'use client';

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { type TournamentMatchData } from '@/lib/api';
import { MATCH_W, CARD_H, SURFACE, BORDER, PREDICT_COLOR, formatPrice, formatDistance } from './tournament-utils';
import { Countdown } from './Countdown';
import { PlayerRow } from './PlayerRow';
import { MatchModal } from './MatchModal';

export function MatchCard({
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

export function EmptyMatchCard({ matchLabel }: { matchLabel: string }) {
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
