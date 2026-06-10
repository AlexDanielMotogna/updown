'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { useAdminResource } from '../lib/useAdminResource';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState, Label, EmptyState } from '../ui';

interface Suggestion {
  id: string;
  poolId: string;
  matchId: string | null;
  homeTeam: string;
  awayTeam: string;
  league: string | null;
  matchDate: string;
  homeScore: number;
  awayScore: number;
  suggestedWinner: 'UP' | 'DOWN' | 'DRAW';
  confident: boolean;
  note: string | null;
  model: string;
  createdAt: string;
  pool: { id: string; status: string; asset: string; winner: string | null } | null;
}

export function ResolutionSuggestions() {
  const { data: items = [], loading, error: err, setError: setErr, reload } = useAdminResource<Suggestion[]>('/resolution-suggestions');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const act = async (id: string, action: 'apply' | 'dismiss') => {
    setBusyId(id); setErr(null);
    try {
      await adminFetch(`/resolution-suggestions/${id}/${action}`, { method: 'POST' });
      setConfirmId(null);
      await reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const winnerLabel = (s: Suggestion) =>
    s.suggestedWinner === 'UP' ? s.homeTeam : s.suggestedWinner === 'DOWN' ? s.awayTeam : 'Draw';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard title="Needs review - LLM result suggestions">
        <Box sx={{ fontSize: '0.72rem', color: t.text.tertiary, mb: 2 }}>
          Stuck sports pools (TheSportsDB never posted the final score) with a web-search LLM suggestion.
          Verify against a real source, then Apply to resolve or Dismiss.
        </Box>

        {loading && <LoadingState variant="block" />}
        {err && <Box sx={{ color: t.error, fontSize: '0.85rem', mb: 1 }}>{err}</Box>}
        {!loading && items.length === 0 && <EmptyState title="No pending suggestions" />}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          {items.map(s => (
            <Box key={s.id} sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.app }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Box sx={{ fontSize: '0.95rem', fontWeight: 800, color: t.text.primary }}>
                  {s.homeTeam} {s.homeScore} - {s.awayScore} {s.awayTeam}
                </Box>
                <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color: s.confident ? t.success : t.warning, bgcolor: `${s.confident ? t.success : t.warning}22` }}>
                  {s.confident ? 'CONFIDENT' : 'LOW CONFIDENCE'}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.75, fontSize: '0.78rem', color: t.text.secondary }}>
                <span><Label>Winner</Label> <b style={{ color: t.text.primary }}>{winnerLabel(s)}</b> ({s.suggestedWinner})</span>
                <span><Label>Date</Label> {s.matchDate}</span>
                {s.league && <span><Label>League</Label> {s.league}</span>}
                {s.pool && <span><Label>Pool</Label> {s.pool.status}</span>}
                <span style={{ opacity: 0.6 }}>{s.model}</span>
              </Box>
              {s.note && <Box sx={{ mt: 0.5, fontSize: '0.76rem', color: t.text.tertiary, fontStyle: 'italic' }}>{s.note}</Box>}
              <Box sx={{ mt: 0.5, fontSize: '0.68rem', color: t.text.tertiary }}>pool {s.poolId}{s.matchId ? ` · match ${s.matchId}` : ''}</Box>

              <Box sx={{ display: 'flex', gap: 1, mt: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                {confirmId === s.id ? (
                  <>
                    <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Resolve as <b style={{ color: t.text.primary }}>{winnerLabel(s)}</b>? This pays out on-chain.</Box>
                    <Box component="button" onClick={() => act(s.id, 'apply')} disabled={busyId === s.id}
                      sx={{ px: 2, py: 0.75, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000', opacity: busyId === s.id ? 0.6 : 1 }}>
                      {busyId === s.id ? 'Resolving…' : 'Confirm'}
                    </Box>
                    <Box component="button" onClick={() => setConfirmId(null)} disabled={busyId === s.id}
                      sx={{ px: 2, py: 0.75, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.primary }}>
                      Cancel
                    </Box>
                  </>
                ) : (
                  <>
                    <Box component="button" onClick={() => setConfirmId(s.id)} disabled={busyId != null}
                      sx={{ px: 2, py: 0.75, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000' }}>
                      Apply &amp; resolve
                    </Box>
                    <Box component="button" onClick={() => act(s.id, 'dismiss')} disabled={busyId === s.id}
                      sx={{ px: 2, py: 0.75, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, opacity: busyId === s.id ? 0.6 : 1 }}>
                      Dismiss
                    </Box>
                  </>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      </SectionCard>
    </Box>
  );
}
