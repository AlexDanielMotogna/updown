'use client';

import { Box, Typography, Chip, Dialog, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { type TournamentMatchData, type TournamentFixture } from '@/lib/api';
import { InlineChart } from '@/components/pool/InlineChart';
import { isMatchActive, isMatchFinished, formatLiveStatus, type LiveScore } from '@/hooks/useLiveScores';
import { BG, BORDER, PREDICT_COLOR, formatPrice, formatDistance, parseMatchdayPrediction, formatOutcome, formatKickoff, truncate } from './tournament-utils';
import { Countdown } from './Countdown';
import { PlayerRow } from './PlayerRow';
import { PredictionInput } from './PredictionInput';
import { MatchdayPredictionForm } from './MatchdayPredictionForm';
import { MatchdayFixtureRow } from './MatchdayFixtureRow';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';

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
  sideLabels,
  liveScores,
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
  sideLabels?: string[];
  liveScores?: Map<string, LiveScore>;
}) {
  const t = useThemeTokens();
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
            <Chip label="DONE" size="small" sx={{ height: 20, fontSize: '0.6rem', fontWeight: 700, bgcolor: withAlpha(t.up, 0.08), color: t.up }} />
          )}
        </Box>
        <IconButton onClick={onClose} size="small" sx={{ color: t.text.tertiary }}>
          <Close sx={{ fontSize: 18 }} />
        </IconButton>
      </Box>

      {/* Result banner */}
      {isResolved && isMyMatch && (() => {
        const iWon = (isP1 && p1Won) || (isP2 && p2Won);
        const myScore = isP1 ? match.player1Score : match.player2Score;
        const oppScore = isP1 ? match.player2Score : match.player1Score;
        return (
          <Box sx={{ px: 2, py: 1.5, textAlign: 'center', borderBottom: `1px solid ${BORDER}`, bgcolor: iWon ? withAlpha(t.up, 0.03) : 'rgba(248,113,113,0.05)' }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: iWon ? t.up : t.down, mb: 0.25 }}>
              {iWon ? 'YOU WIN' : 'YOU LOST'}
            </Typography>
            {myScore != null && oppScore != null && (
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: t.text.rich }}>
                Score: {myScore} – {oppScore}
              </Typography>
            )}
          </Box>
        );
      })()}

      {/* Players */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <PlayerRow wallet={match.player1Wallet} prediction={match.player1Prediction} distance={p1Distance} isWinner={p1Won} isLoser={isResolved && !p1Won && !!match.player1Wallet} isPending={isPending || isActive} isSports={isSports} score={match.player1Score} fixtureCount={fixtureCount} isMe={isP1} />
        <Box sx={{ height: '1px', bgcolor: BORDER, position: 'relative', my: 0.25 }}>
          <Typography sx={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', fontSize: '0.5rem', fontWeight: 700, color: isResolved && match.finalPrice ? t.accent : 'rgba(255,255,255,0.15)', bgcolor: BG, px: 0.75, lineHeight: 1 }}>
            {isResolved && match.finalPrice ? (isSports ? 'Done' : formatPrice(match.finalPrice)) : 'VS'}
          </Typography>
        </Box>
        <PlayerRow wallet={match.player2Wallet} prediction={match.player2Prediction} distance={p2Distance} isWinner={p2Won} isLoser={isResolved && !p2Won && !!match.player2Wallet} isPending={isPending || isActive} isSports={isSports} score={match.player2Score} fixtureCount={fixtureCount} isMe={isP2} />
      </Box>

      {/* Fixtures breakdown — card per match */}
      {isSports && fixtures && fixtures.length > 0 && (match.player1Prediction || match.player2Prediction) && (
        <Box sx={{ borderTop: `1px solid ${BORDER}`, px: 2, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {isResolved ? 'Matchday Results' : 'Predictions'}
          </Typography>

          {fixtures.map((f, i) => {
            const p1Pred = parseMatchdayPrediction(match.player1Prediction);
            const p2Pred = parseMatchdayPrediction(match.player2Prediction);
            const p1Pick = p1Pred?.outcomes[i];
            const p2Pick = p2Pred?.outcomes[i];
            const result = f.resultOutcome;
            const p1Correct = result && p1Pick === result;
            const p2Correct = result && p2Pick === result;
            const myPick = isP1 ? p1Pick : isP2 ? p2Pick : null;
            const oppPick = isP1 ? p2Pick : isP2 ? p1Pick : null;
            const myCorrect = isP1 ? p1Correct : p2Correct;
            const oppCorrect = isP1 ? p2Correct : p1Correct;

            // Convert HOME/DRAW/AWAY to team name
            const pickToName = (pick: string | undefined | null) => {
              if (!pick) return '—';
              if (pick === 'HOME') return f.homeTeam;
              if (pick === 'AWAY') return f.awayTeam;
              return 'Draw';
            };

            const ls = liveScores?.get(f.footballMatchId);
            const live = ls && isMatchActive(ls);
            const liveFinished = ls && isMatchFinished(ls.status);
            const hasScore = live ? true : f.resultHome != null && f.resultAway != null;
            const displayHome = live ? ls!.homeScore : f.resultHome;
            const displayAway = live ? ls!.awayScore : f.resultAway;
            const homeWon = result === 'HOME';
            const awayWon = result === 'AWAY';

            return (
              <Box key={f.id} sx={{ bgcolor: t.hover.light, borderRadius: '8px', p: 1.5, ...(live && { border: `1px solid ${withAlpha(t.gain, 0.2)}` }) }}>
                {/* Match header: crests + teams + score + live status */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1, flexWrap: 'wrap' }}>
                  {f.homeTeamCrest && <Box component="img" src={f.homeTeamCrest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain' }} />}
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: homeWon ? t.up : t.text.primary }}>
                    {f.homeTeam}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: live ? t.gain : t.text.primary }}>
                    {hasScore ? `${displayHome} - ${displayAway}` : 'vs'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: awayWon ? t.up : t.text.primary }}>
                    {f.awayTeam}
                  </Typography>
                  {f.awayTeamCrest && <Box component="img" src={f.awayTeamCrest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain' }} />}
                  {live && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, ml: 'auto' }}>
                      <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: t.gain, animation: 'livePulse 1.5s infinite', '@keyframes livePulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.4 } } }} />
                      <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: t.gain }}>
                        {formatLiveStatus(ls!.status, ls!.progress)}
                      </Typography>
                    </Box>
                  )}
                  {liveFinished && !f.resultOutcome && (
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.secondary, ml: 'auto' }}>Full Time</Typography>
                  )}
                  {!live && !liveFinished && f.kickoff && !f.resultOutcome && (
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.quaternary, ml: 'auto' }}>
                      {formatKickoff(f.kickoff)}
                    </Typography>
                  )}
                </Box>

                {/* Predictions with team names */}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  {myPick && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.accent, width: 70 }}>You:</Typography>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: myCorrect ? t.up : result ? t.down : t.text.primary }}>
                        {pickToName(myPick)}
                      </Typography>
                    </Box>
                  )}
                  {oppPick && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.secondary, width: 70 }}>Opponent:</Typography>
                      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: oppCorrect ? t.up : result ? t.down : t.text.bright }}>
                        {pickToName(oppPick)}
                      </Typography>
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}

          {/* Total goals tiebreaker */}
          {(match.player1TotalGoals != null || match.player2TotalGoals != null) && (() => {
            const actualTg = match.finalPrice ? parseMatchdayPrediction(match.finalPrice)?.totalGoals : null;
            return (
              <Box sx={{ bgcolor: t.hover.light, borderRadius: '8px', p: 1.5 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: actualTg != null ? 1 : 0 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: t.text.secondary }}>Total Goals Tiebreaker</Typography>
                  {actualTg != null && (
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>
                      Actual: {actualTg}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: isP1 ? t.accent : t.text.bright }}>
                    {isP1 ? 'You' : 'Opponent'}: {match.player1TotalGoals ?? '—'}
                  </Typography>
                  <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: isP2 ? t.accent : t.text.bright }}>
                    {isP2 ? 'You' : 'Opponent'}: {match.player2TotalGoals ?? '—'}
                  </Typography>
                </Box>
              </Box>
            );
          })()}
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
              sideLabels={sideLabels}
            />
          ) : !isSports ? (
            <>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: t.predict, mb: 1 }}>
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
          <Typography sx={{ fontSize: '0.75rem', color: t.text.dimmed, textAlign: 'center' }}>
            Prediction locked · Waiting for opponent
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}
