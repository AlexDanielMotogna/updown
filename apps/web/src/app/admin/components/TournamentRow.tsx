'use client';

import { Box, Chip } from '@mui/material';
import { darkTokens as dt, palette, withAlpha } from '@/lib/theme';
import { StatusChip, ActionButton, Meta } from '../ui';
import {
  type Tournament, type ActionKey,
  SINGLE_LEAGUE_SPORTS, SPORT_OPTIONS, FOOTBALL_LEAGUES, STATUS_TO_KIND, USDC_DIVISOR,
} from './tournament-config';

export function TournamentRow({
  tournament: t,
  onEdit,
  onAction,
  onAssign,
  onResolve,
}: {
  tournament: Tournament;
  onEdit: () => void;
  onAction: (action: ActionKey, round?: number) => void;
  onAssign: (round: number) => void;
  onResolve: () => void;
}) {
  const needsResolution =
    t.status === 'ACTIVE' && t.tournamentType === 'SPORTS' &&
    t.fixturesByRound?.[t.currentRound] &&
    t.fixturesByRound[t.currentRound].some(f => f.status !== 'FINISHED');

  const sportLabel = t.tournamentType === 'SPORTS'
    ? SINGLE_LEAGUE_SPORTS.has(t.sport || '')
      ? SPORT_OPTIONS.find(s => s.value === t.sport)?.label || t.sport
      : `${SPORT_OPTIONS.find(s => s.value === t.sport)?.label || t.sport} · ${FOOTBALL_LEAGUES.find(l => l.value === t.league)?.label || t.league}`
    : t.asset;

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, bgcolor: dt.hover.subtle, borderRadius: 1, flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 200 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <Box sx={{ fontSize: '0.85rem', fontWeight: 600 }}>{t.name}</Box>
          <StatusChip status={STATUS_TO_KIND[t.status] ?? 'neutral'} label={t.status} />
          {needsResolution && (
            <Chip
              label="Needs resolution"
              size="small"
              onClick={onResolve}
              sx={{
                height: 22, fontSize: '0.7rem', fontWeight: 700, borderRadius: 1,
                bgcolor: withAlpha(dt.error, 0.15), color: dt.error, cursor: 'pointer',
              }}
            />
          )}
        </Box>
        <Meta>
          {sportLabel} · ${(Number(t.entryFee) / USDC_DIVISOR).toFixed(2)} entry · {t._count.participants}/{t.size} players · Round {t.currentRound}/{t.totalRounds}
        </Meta>
        {t.scheduledAt && <Meta sx={{ display: 'block', mt: 0.25 }}>Starts: {new Date(t.scheduledAt).toLocaleString()}</Meta>}

        {t.tournamentType === 'SPORTS' && t.totalRounds > 0 && (
          <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
            {Array.from({ length: t.totalRounds }, (_, i) => i + 1).map(r => {
              const fixtures = t.fixturesByRound?.[r];
              const hasFixtures = !!fixtures && fixtures.length > 0;
              const isCurrent = t.currentRound === r;
              return (
                <Box key={r} sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box sx={{
                    fontSize: '0.6rem', fontWeight: 700, width: 16, height: 16, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: hasFixtures ? withAlpha(dt.predict, 0.2) : isCurrent ? withAlpha(dt.accent, 0.2) : dt.hover.subtle,
                    color: hasFixtures ? dt.predict : isCurrent ? dt.accent : dt.text.muted,
                  }}>
                    {hasFixtures ? '✓' : r}
                  </Box>
                  <Box sx={{ fontSize: '0.7rem', color: dt.text.tertiary }}>
                    R{r}: {hasFixtures
                      ? fixtures!.map(f => `${f.homeTeam} vs ${f.awayTeam}`).join(', ')
                      : 'Not assigned'}
                  </Box>
                  {!hasFixtures && (
                    <Box
                      onClick={() => onAssign(r)}
                      sx={{ fontSize: '0.7rem', color: dt.predict, cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                    >
                      assign
                    </Box>
                  )}
                </Box>
              );
            })}
          </Box>
        )}
      </Box>

      <Box sx={{ fontSize: '0.85rem', fontWeight: 600, color: dt.up }}>
        ${(Number(t.prizePool) / USDC_DIVISOR).toFixed(2)}
      </Box>

      <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
        {t.status === 'REGISTERING' && (
          <>
            {t.tournamentType === 'SPORTS' && (
              <ActionButton kind="secondary" label="Setup matches" onClick={() => onAssign(1)} sx={{ bgcolor: withAlpha(dt.predict, 0.12), borderColor: withAlpha(dt.predict, 0.32), color: dt.predict }} />
            )}
            <ActionButton kind="secondary" label="Edit" onClick={onEdit} />
            <ActionButton
              kind="primary"
              label="Start"
              onClick={() => onAction('start')}
              disabled={t._count.participants < 2}
              sx={{ bgcolor: dt.accent, color: dt.text.contrast, '&:hover': { bgcolor: palette.amber600 } }}
            />
            <ActionButton kind="destructive" label="Cancel" onClick={() => onAction('cancel')} />
            <ActionButton kind="destructive" label="Delete" onClick={() => onAction('delete')} />
          </>
        )}
        {t.status === 'ACTIVE' && (
          <>
            {t.tournamentType === 'SPORTS' && (
              <>
                <ActionButton kind="secondary" label="Assign match" onClick={() => onAssign(Math.max(t.currentRound, 1))} sx={{ bgcolor: withAlpha(dt.predict, 0.12), borderColor: withAlpha(dt.predict, 0.32), color: dt.predict }} />
                <ActionButton kind="primary" label="Resolve" onClick={onResolve} />
              </>
            )}
            <ActionButton kind="secondary" label={`Reset R${t.currentRound}`} onClick={() => onAction('reset-round', t.currentRound)} />
            <ActionButton kind="destructive" label="Cancel" onClick={() => onAction('cancel')} />
          </>
        )}
        {t.winnerWallet && (
          <Meta>Winner: {t.winnerWallet.slice(0, 4)}…{t.winnerWallet.slice(-4)}</Meta>
        )}
      </Box>
    </Box>
  );
}
