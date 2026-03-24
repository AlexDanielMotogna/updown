'use client';

import { Box, Typography, Chip, Dialog, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { type TournamentMatchData } from '@/lib/api';
import { InlineChart } from '@/components/pool/InlineChart';
import { BG, BORDER, PREDICT_COLOR, formatPrice, formatDistance, formatOutcome } from './tournament-utils';
import { Countdown } from './Countdown';
import { PlayerRow } from './PlayerRow';
import { PredictionInput } from './PredictionInput';
import { OutcomePicker } from './OutcomePicker';

export function MatchModal({
  open,
  onClose,
  match,
  matchLabel,
  asset,
  walletAddress,
  tournamentId,
  livePrice,
  onRefresh,
  isSports,
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
  isSports?: boolean;
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

      {/* Sports match context */}
      {isSports && match.homeTeam && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: `1px solid ${BORDER}` }}>
          {match.homeTeamCrest && <Box component="img" src={match.homeTeamCrest} alt="" sx={{ width: 28, height: 28, objectFit: 'contain' }} />}
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{match.homeTeam}</Typography>
          <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.2)' }}>vs</Typography>
          <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{match.awayTeam}</Typography>
          {match.awayTeamCrest && <Box component="img" src={match.awayTeamCrest} alt="" sx={{ width: 28, height: 28, objectFit: 'contain' }} />}
        </Box>
      )}

      {/* Players */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <PlayerRow wallet={match.player1Wallet} prediction={match.player1Prediction} distance={p1Distance} isWinner={p1Won} isLoser={isResolved && !p1Won && !!match.player1Wallet} isPending={isPending || isActive} isSports={isSports} />
        <Box sx={{ height: '1px', bgcolor: BORDER, position: 'relative', my: 0.25 }}>
          <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.5rem', fontWeight: 700, color: isResolved && match.finalPrice ? ACCENT_COLOR : 'rgba(255,255,255,0.15)', bgcolor: BG, px: 0.75, lineHeight: 1 }}>
            {isResolved && match.finalPrice ? (isSports ? formatOutcome(match.finalPrice) : formatPrice(match.finalPrice)) : 'VS'}
          </Typography>
        </Box>
        <PlayerRow wallet={match.player2Wallet} prediction={match.player2Prediction} distance={p2Distance} isWinner={p2Won} isLoser={isResolved && !p2Won && !!match.player2Wallet} isPending={isPending || isActive} isSports={isSports} />
      </Box>

      {/* Chart (crypto only) */}
      {!isSports && (
        <Box sx={{ borderTop: `1px solid ${BORDER}` }}>
          <InlineChart asset={asset} livePrice={livePrice} />
        </Box>
      )}

      {/* Prediction input */}
      {needsToPredict && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, p: 2 }}>
          {isSports ? (
            <OutcomePicker
              homeTeam={match.homeTeam}
              awayTeam={match.awayTeam}
              onSubmit={async (prediction) => {
                const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';
                await fetch(`${API}/api/tournaments/${tournamentId}/matches/${match.id}/predict`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ walletAddress, prediction }),
                });
                onRefresh();
                onClose();
              }}
            />
          ) : (
            <>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: PREDICT_COLOR, mb: 1 }}>
                Submit Your Price Prediction
              </Typography>
              <PredictionInput matchId={match.id} tournamentId={tournamentId} currentPrice={livePrice} onSubmitted={() => { onRefresh(); onClose(); }} />
            </>
          )}
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
