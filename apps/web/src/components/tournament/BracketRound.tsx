'use client';

import { Box, Typography } from '@mui/material';
import { type TournamentMatchData } from '@/lib/api';
import { CARD_H, CARD_GAP, getRoundLabel } from './tournament-utils';
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
                  isSports={isSports}
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

export function Connectors({ matchCount, roundNum }: { matchCount: number; roundNum: number }) {
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
