'use client';

import { useState } from 'react';
import {
  Box,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { UpIcon } from '@/components/UpIcon';
import {
  SectionCard, StatCard, LoadingState, EmptyState, ErrorState, Label, POLL_MEDIUM_MS,
} from '../ui';

interface EmissionConfigRow {
  epoch: number;
  dailyCoinsCap: string;
  totalAllocated: string;
  totalDistributed: string;
  coinsPerUsdcBet: string;
  winMultiplier: number;
  active: boolean;
  epochStartDate: string;
}
interface EconomyResponse {
  data: {
    emission: {
      stats: { active: boolean; epoch: number | null; dailyCoinsCap: string; todayDistributed: string; totalAllocated: string; totalDistributed: string };
      configs: EmissionConfigRow[];
    };
    sinks: {
      stats: { todaySpent: string; todayBurned: string; totalRedeemed: string };
      byType: Array<{ type: string; total: string; count: number }>;
    };
  };
}

// Coins are stored in units where display UP = stored / 100.
const toUp = (stored: string) => Number(stored) / 100;
const fmtUp = (stored: string) => toUp(stored).toLocaleString(undefined, { maximumFractionDigits: 0 });
const capLabel = (stored: string) => (stored === '0' ? 'Unlimited' : `${fmtUp(stored)} UP`);

function UpAmount({ stored, color }: { stored: string; color?: string }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: color ?? t.text.primary, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
      {fmtUp(stored)}
      <UpIcon size={13} />
    </Box>
  );
}

export function UpEconomy() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-economy'],
    queryFn: () => adminFetch<EconomyResponse>('/economy'),
    refetchInterval: POLL_MEDIUM_MS,
  });

  const [capUp, setCapUp] = useState('');
  const [allocUp, setAllocUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  if (isLoading) return <LoadingState variant="block" />;
  if (error) {
    return <ErrorState title="Couldn’t load economy" message={(error as Error).message} details={error} onRetry={() => refetch()} />;
  }

  const { emission, sinks } = data!.data;
  const st = emission.stats;

  // UP (display) → stored units. Blank → 0 (unlimited).
  const toStored = (up: string): string => {
    const n = up.trim() === '' ? 0 : Math.round(Number(up) * 100);
    return String(n);
  };

  const save = async (active: boolean) => {
    setFormError(null);
    if ((capUp && !Number.isFinite(Number(capUp))) || (allocUp && !Number.isFinite(Number(allocUp)))) {
      setFormError('Caps must be numbers (UP). Leave blank or 0 for unlimited.');
      return;
    }
    setBusy(true);
    try {
      await adminFetch('/economy/emission', {
        method: 'POST',
        body: JSON.stringify({ dailyCoinsCap: toStored(capUp), totalAllocated: toStored(allocUp), active }),
      });
      setCapUp(''); setAllocUp('');
      refetch();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (epoch: number, active: boolean) => {
    setBusy(true);
    try {
      await adminFetch(`/economy/emission/${epoch}/active`, { method: 'POST', body: JSON.stringify({ active }) });
      refetch();
    } finally {
      setBusy(false);
    }
  };

  const inputSx = {
    px: 1.25, py: 0.7, borderRadius: 1, fontSize: '0.85rem', width: 160,
    border: `1px solid ${t.border.medium}`, bgcolor: t.bg.app, color: t.text.primary,
    fontFamily: 'inherit', outline: 'none',
  } as const;
  const btnSx = (primary?: boolean) => ({
    px: 2, py: 0.8, borderRadius: 1, fontSize: '0.8rem', fontWeight: 800, cursor: busy ? 'default' : 'pointer',
    border: primary ? 'none' : `1px solid ${t.border.medium}`,
    bgcolor: primary ? t.success : t.bg.surfaceAlt, color: primary ? '#000' : t.text.primary,
    opacity: busy ? 0.6 : 1, '&:hover': { filter: 'brightness(1.1)' },
  } as const);

  const emittedToday = toUp(st.todayDistributed);
  const spentToday = toUp(sinks.stats.todaySpent);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Faucet vs drain */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' }, gap: 2 }}>
        <StatCard
          label="Emission control"
          value={st.active ? `Epoch ${st.epoch}` : 'OFF'}
          color={st.active ? t.success : t.text.tertiary}
          hint={st.active ? 'Caps enforced' : 'Unlimited (passthrough)'}
        />
        <StatCard label="Emitted today" value={fmtUp(st.todayDistributed)} hint="UP coins to users" />
        <StatCard label="Spent today (sinks)" value={fmtUp(sinks.stats.todaySpent)} color={t.gold} hint="UP coins drained" />
        <StatCard label="Burned today" value={fmtUp(sinks.stats.todayBurned)} hint="Hard sink" />
        <StatCard
          label="Faucet − Drain (today)"
          value={(emittedToday - spentToday).toLocaleString(undefined, { maximumFractionDigits: 0 })}
          color={emittedToday - spentToday > 0 ? t.error : t.success}
          hint="Positive = net inflation"
        />
      </Box>

      {/* Emission config */}
      <SectionCard title="Emission budget">
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 2 }}>
          <Box>
            <Label>Daily cap (UP, blank = unlimited)</Label>
            <Box component="input" type="number" min={0} value={capUp} placeholder={capLabel(st.dailyCoinsCap)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCapUp(e.target.value)} sx={inputSx} />
          </Box>
          <Box>
            <Label>Epoch budget (UP, blank = unlimited)</Label>
            <Box component="input" type="number" min={0} value={allocUp} placeholder={capLabel(st.totalAllocated)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAllocUp(e.target.value)} sx={inputSx} />
          </Box>
          <Box component="button" disabled={busy} onClick={() => save(true)} sx={btnSx(true)}>Save &amp; activate</Box>
          <Box component="button" disabled={busy} onClick={() => save(false)} sx={btnSx(false)}>Save inactive</Box>
        </Box>
        {formError && <Box sx={{ mt: 1.5, fontSize: '0.78rem', color: t.error, fontWeight: 600 }}>{formError}</Box>}
        <Box sx={{ mt: 1.5, fontSize: '0.72rem', color: t.text.tertiary }}>
          Decay = seed each new epoch with a smaller budget. Activating one epoch deactivates the others.
          While OFF, emission is uncapped (legacy behavior).
        </Box>
      </SectionCard>

      {/* Epochs table */}
      <SectionCard title="Epochs">
        {emission.configs.length === 0 ? (
          <EmptyState title="No emission epochs yet" />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell align="right"><Label>Epoch</Label></TableCell>
                  <TableCell align="right"><Label>Daily cap</Label></TableCell>
                  <TableCell align="right"><Label>Budget</Label></TableCell>
                  <TableCell align="right"><Label>Distributed</Label></TableCell>
                  <TableCell><Label>State</Label></TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {emission.configs.map((c) => (
                  <TableRow key={c.epoch}>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{c.epoch}</TableCell>
                    <TableCell align="right" sx={{ color: t.text.secondary }}>{capLabel(c.dailyCoinsCap)}</TableCell>
                    <TableCell align="right" sx={{ color: t.text.secondary }}>{capLabel(c.totalAllocated)}</TableCell>
                    <TableCell align="right"><UpAmount stored={c.totalDistributed} /></TableCell>
                    <TableCell>
                      <Box component="span" sx={{ px: 0.8, py: 0.2, borderRadius: '4px', fontSize: '0.7rem', fontWeight: 700, color: c.active ? t.success : t.text.tertiary, bgcolor: c.active ? `${t.success}22` : t.hover.medium }}>
                        {c.active ? 'Active' : 'Inactive'}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Box component="button" disabled={busy} onClick={() => toggle(c.epoch, !c.active)}
                        sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}>
                        {c.active ? 'Deactivate' : 'Activate'}
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>

      {/* Sinks breakdown */}
      <SectionCard title="Sinks (all-time)">
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 2 }}>
          <StatCard label="Total redeemed" value={fmtUp(sinks.stats.totalRedeemed)} color={t.gold} hint="Lifetime UP drained" />
          <StatCard label="Burned today" value={fmtUp(sinks.stats.todayBurned)} hint="Deflationary" />
        </Box>
        {sinks.byType.length === 0 ? (
          <EmptyState title="No spends yet" hint="Buy a streak-saver / cosmetic / boost to see drains here" />
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell><Label>Sink</Label></TableCell>
                  <TableCell align="right"><Label>Spends</Label></TableCell>
                  <TableCell align="right"><Label>Total UP</Label></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sinks.byType.map((r) => (
                  <TableRow key={r.type}>
                    <TableCell sx={{ fontWeight: 600, color: t.text.primary }}>{r.type}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{r.count}</TableCell>
                    <TableCell align="right"><UpAmount stored={r.total} color={t.gold} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </SectionCard>
    </Box>
  );
}
