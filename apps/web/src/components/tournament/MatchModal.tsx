'use client';

import { Box, Typography, Chip, Dialog, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { UP_COLOR, ACCENT_COLOR } from '@/lib/constants';
import { type TournamentMatchData, type TournamentFixture } from '@/lib/api';
import { InlineChart } from '@/components/pool/InlineChart';
import { BG, BORDER, PREDICT_COLOR, formatPrice, formatDistance, formatScore, parseMatchdayPrediction } from './tournament-utils';
import { Countdown } from './Countdown';
import { PlayerRow } from './PlayerRow';
import { PredictionInput } from './PredictionInput';
import { MatchdayPredictionForm } from './MatchdayPredictionForm';
import { MatchdayFixtureRow } from './MatchdayFixtureRow';

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
  fixtureCount,
  fixtures,
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
  fixtureCount?: number;
  fixtures?: TournamentFixture[];
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
        <PlayerRow wallet={match.player1Wallet} prediction={match.player1Prediction} distance={p1Distance} isWinner={p1Won} isLoser={isResolved && !p1Won && !!match.player1Wallet} isPending={isPending || isActive} isSports={isSports} score={match.player1Score} fixtureCount={fixtureCount} />
        <Box sx={{ height: '1px', bgcolor: BORDER, position: 'relative', my: 0.25 }}>
          <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.5rem', fontWeight: 700, color: isResolved && match.finalPrice ? ACCENT_COLOR : 'rgba(255,255,255,0.15)', bgcolor: BG, px: 0.75, lineHeight: 1 }}>
            {isResolved && match.finalPrice ? (isSports ? 'Done' : formatPrice(match.finalPrice)) : 'VS'}
          </Typography>
        </Box>
        <PlayerRow wallet={match.player2Wallet} prediction={match.player2Prediction} distance={p2Distance} isWinner={p2Won} isLoser={isResolved && !p2Won && !!match.player2Wallet} isPending={isPending || isActive} isSports={isSports} score={match.player2Score} fixtureCount={fixtureCount} />
      </Box>

      {/* Fixtures list (sports — show results if resolved) */}
      {isSports && fixtures && fixtures.length > 0 && (isResolved || isActive) && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, px: 2, py: 1 }}>
          <Typography sx={{ fontSize: '0.65rem', fontWeight: 600, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.05em', mb: 0.5 }}>
            Matchday Results
          </Typography>
          {fixtures.map((f, i) => {
            const myPred = isP1 ? parseMatchdayPrediction(match.player1Prediction) : isP2 ? parseMatchdayPrediction(match.player2Prediction) : null;
            return (
              <MatchdayFixtureRow
                key={f.id}
                homeTeam={f.homeTeam}
                awayTeam={f.awayTeam}
                homeTeamCrest={f.homeTeamCrest}
                awayTeamCrest={f.awayTeamCrest}
                selected={myPred?.outcomes[i] || null}
                result={f.resultOutcome}
                resultHome={f.resultHome}
                resultAway={f.resultAway}
                disabled
              />
            );
          })}
        </Box>
      )}

      {/* Chart (crypto only) */}
      {!isSports && (
        <Box sx={{ borderTop: `1px solid ${BORDER}` }}>
          <InlineChart asset={asset} livePrice={livePrice} />
        </Box>
      )}

      {/* Prediction input */}
      {needsToPredict && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, p: 2 }}>
          {isSports && fixtures && fixtures.length > 0 ? (
            <MatchdayPredictionForm
              fixtures={fixtures}
              tournamentId={tournamentId}
              matchId={match.id}
              walletAddress={walletAddress!}
              onSubmitted={() => { onRefresh(); onClose(); }}
            />
          ) : !isSports ? (
            <>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: PREDICT_COLOR, mb: 1 }}>
                Submit Your Price Prediction
              </Typography>
              <PredictionInput matchId={match.id} tournamentId={tournamentId} currentPrice={livePrice} onSubmitted={() => { onRefresh(); onClose(); }} />
            </>
          ) : null}
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
