'use client';

import { useState } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState, Label } from '../ui';

interface Check { source: string; resolved: boolean | null; summary: string; data?: unknown; }
interface InspectData {
  pool: {
    id: string; poolId: string; poolType: string; asset: string; status: string;
    winner: string | null; matchId: string | null; homeTeam: string | null; awayTeam: string | null;
    league: string | null; endTime: string; ended: boolean;
  };
  checks: Check[];
}

function Badge({ resolved }: { resolved: boolean | null }) {
  const [label, color] = resolved === true ? ['RESOLVED', t.success]
    : resolved === false ? ['PENDING', t.warning]
    : ['N/A', t.text.tertiary];
  return (
    <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 800, color, bgcolor: `${color}22`, whiteSpace: 'nowrap' }}>
      {label}
    </Box>
  );
}

export function ResolutionInspector() {
  const [poolId, setPoolId] = useState('');
  const [data, setData] = useState<InspectData | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    const q = poolId.trim();
    if (!q) return;
    setLoading(true); setErr(null);
    try {
      const r = await adminFetch<{ data: InspectData }>(`/resolution-inspector?poolId=${encodeURIComponent(q)}`);
      setData(r.data);
    } catch (e) {
      setErr((e as Error).message); setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard title="Resolution inspector">
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Box
            component="input"
            value={poolId}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoolId(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') run(); }}
            placeholder="Pool UUID or on-chain poolId"
            sx={{
              flex: 1, minWidth: 280, px: 1.5, py: 1, fontSize: '0.85rem', borderRadius: 1,
              bgcolor: t.bg.app, color: t.text.primary, border: `1px solid ${t.border.subtle}`,
              outline: 'none', '&:focus': { borderColor: t.border.medium },
            }}
          />
          <Box
            component="button"
            onClick={run}
            disabled={loading}
            sx={{ px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000', opacity: loading ? 0.6 : 1 }}
          >
            Check
          </Box>
        </Box>
        <Box sx={{ mt: 1, fontSize: '0.72rem', color: t.text.tertiary }}>
          Checks the source that applies (Polymarket Gamma + UMA/CTF on-chain, TheSportsDB, or crypto price) plus our DB state.
        </Box>
      </SectionCard>

      {loading && <LoadingState variant="block" />}
      {err && <Box sx={{ color: t.error, fontSize: '0.85rem' }}>{err}</Box>}

      {data && (
        <SectionCard title={data.pool.asset || data.pool.poolId}>
          {/* Pool header */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 2, fontSize: '0.78rem', color: t.text.secondary }}>
            <span><Label>Type</Label> {data.pool.poolType}</span>
            <span><Label>Status</Label> {data.pool.status}</span>
            <span><Label>Winner</Label> {data.pool.winner ?? '-'}</span>
            <span><Label>Ended</Label> {data.pool.ended ? 'yes' : 'no'}</span>
            {data.pool.matchId && <span><Label>matchId</Label> {data.pool.matchId}</span>}
          </Box>

          {/* Source checks */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {data.checks.map((c, i) => (
              <Box key={i} sx={{ p: 1.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: t.bg.app }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                  <Box sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>{c.source}</Box>
                  <Badge resolved={c.resolved} />
                </Box>
                <Box sx={{ mt: 0.5, fontSize: '0.78rem', color: t.text.secondary }}>{c.summary}</Box>
                {c.data != null && (
                  <Box component="pre" sx={{ mt: 1, p: 1, borderRadius: 0.5, bgcolor: t.bg.surface, color: t.text.tertiary, fontSize: '0.7rem', overflow: 'auto', maxHeight: 200, m: 0 }}>
                    {JSON.stringify(c.data, null, 2)}
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </SectionCard>
      )}
    </Box>
  );
}
