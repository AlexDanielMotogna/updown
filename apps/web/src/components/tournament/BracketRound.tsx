'use client';

import { Box, Typography } from '@mui/material';
import { type TournamentMatchData, type TournamentFixture } from '@/lib/api';
import { CARD_H, CARD_GAP, getRoundLabel, getHeaderHeight } from './tournament-utils';
import { MatchCard, EmptyMatchCard } from './MatchCard';

export function BracketRound({
  roundNum,
  expectedMatchCount,
  matches,
  totalRounds,
  walletAddress,
  tournamentId,
  asset,
  livePrice,
  onRefresh,
  isSports,
  fixtureCount,
  fixtures,
  sideLabels,
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
  isSports?: boolean;
  fixtureCount?: number;
  fixtures?: TournamentFixture[];
  sideLabels?: string[];
}) {
  const rn = Number(roundNum);
  const tr = Number(totalRounds);
  const label = getRoundLabel(rn, tr);
  const sorted = [...matches].sort((a, b) => a.matchIndex - b.matchIndex);
  const slotH = CARD_H * Math.pow(2, rn - 1) + CARD_GAP * (Math.pow(2, rn - 1) - 1);
  const headerH = getHeaderHeight(isSports ? (fixtureCount || 0) : 0);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      {/* Fixed-height header: label + optional fixtures */}
      <Box sx={{ height: headerH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <Typography
          sx={{
            fontSize: '0.68rem',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            textAlign: 'center',
            height: 20,
            lineHeight: '20px',
          }}
        >
          {label}
        </Typography>

        {isSports && fixtures && fixtures.length > 0 && (
          <Box sx={{ mt: '4px', textAlign: 'center' }}>
            {fixtures.map((f, i) => (
              <Box key={i} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, height: 18 }}>
                {f.homeTeamCrest && <Box component="img" src={f.homeTeamCrest} alt="" sx={{ width: 12, height: 12, objectFit: 'contain' }} />}
                <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, lineHeight: 1 }}>
                  {f.homeTeam} vs {f.awayTeam}
                  {f.resultHome != null ? ` (${f.resultHome}-${f.resultAway})` : ''}
                </Typography>
                {f.awayTeamCrest && <Box component="img" src={f.awayTeamCrest} alt="" sx={{ width: 12, height: 12, objectFit: 'contain' }} />}
              </Box>
            ))}
          </Box>
        )}
      </Box>

      {/* Match cards */}
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
                  isSports={isSports}
                  fixtureCount={fixtureCount}
                  fixtures={fixtures}
                  sideLabels={sideLabels}
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

export function Connectors({ matchCount, roundNum, headerHeight }: { matchCount: number; roundNum: number; headerHeight: number }) {
  const pairs = Math.floor(matchCount / 2);
  if (pairs === 0) return null;

  const rn = Number(roundNum);
  const slotH = CARD_H * Math.pow(2, rn - 1) + CARD_GAP * (Math.pow(2, rn - 1) - 1);
  const pairH = slotH * 2 + CARD_GAP;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        width: 32,
        flexShrink: 0,
        mx: 0.5,
        pt: `${headerHeight}px`,
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
          <Box sx={{ position: 'absolute', top: slotH / 2, left: 0, width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          <Box sx={{ position: 'absolute', top: slotH + CARD_GAP + slotH / 2, left: 0, width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
          <Box sx={{ position: 'absolute', top: slotH / 2, left: '50%', height: slotH + CARD_GAP, borderLeft: '1px solid rgba(255,255,255,0.08)' }} />
          <Box sx={{ position: 'absolute', top: pairH / 2, left: '50%', width: '50%', borderTop: '1px solid rgba(255,255,255,0.08)' }} />
        </Box>
      ))}
    </Box>
  );
}
