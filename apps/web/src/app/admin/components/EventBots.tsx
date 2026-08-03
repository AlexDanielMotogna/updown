'use client';

import { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, StatCard, LoadingState, POLL_MEDIUM_MS } from '../ui';

const CYAN = '#5FD8EF';

interface Cfg {
  enabled: boolean; perPoolCap: string; perPoolVariancePct: number; perCycleCap: string;
  maxTotalExposure: string; treasuryFloor: string; betMin: string; betMax: string;
  intervalSeconds: number; lockMarginSeconds: number; walletUsdcTopup: string; walletSolTopup: number;
  closingBetEnabled: boolean; closingWindowSeconds: number; closingSafetySeconds: number;
  closingPerPoolCap: string; closingBetMin: string; closingBetMax: string;
}
interface Status {
  cluster: string; funder: { pubkey: string; usdc: string; sol: number } | null; funderConfigured: boolean;
  walletCount: number; wallets: { pubkey: string; usdc: string; sol: number }[]; openExposure: string;
  diagnostics: { at: string | null; reason: string | null; poolsConsidered: number; placed: number; spent: string; lastError: string | null };
  recentBets: { id: string; side: string; amount: string; createdAt: string; pool: { asset: string; status: string } }[];
}

const usdc = (micro: string) => (Number(micro) / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 });
const short = (w: string) => `${w.slice(0, 4)}…${w.slice(-4)}`;

// field key, label, unit: 'usdc' (micro), 'sol' (lamports), or 'int'
const FIELDS: [keyof Cfg, string, 'usdc' | 'sol' | 'int'][] = [
  ['betMin', 'Bet min (USDC)', 'usdc'],
  ['betMax', 'Bet max (USDC)', 'usdc'],
  ['perPoolCap', 'Per-pool cap (USDC)', 'usdc'],
  ['perCycleCap', 'Per-cycle cap (USDC)', 'usdc'],
  ['maxTotalExposure', 'Max exposure (USDC)', 'usdc'],
  ['walletUsdcTopup', 'Wallet USDC top-up', 'usdc'],
  ['treasuryFloor', 'Treasury floor (mainnet)', 'usdc'],
  ['perPoolVariancePct', 'Per-pool variance %', 'int'],
  ['intervalSeconds', 'Interval (seconds)', 'int'],
  ['lockMarginSeconds', 'Lock margin (seconds)', 'int'],
  ['walletSolTopup', 'Wallet SOL top-up', 'sol'],
  // Closing play (late winning-side bets vs a last-second whale)
  ['closingWindowSeconds', 'Closing window (seconds)', 'int'],
  ['closingSafetySeconds', 'Closing safety (seconds)', 'int'],
  ['closingPerPoolCap', 'Closing per-pool cap (USDC)', 'usdc'],
  ['closingBetMin', 'Closing bet min (USDC)', 'usdc'],
  ['closingBetMax', 'Closing bet max (USDC)', 'usdc'],
];

const toDisplay = (v: string | number, unit: 'usdc' | 'sol' | 'int') =>
  unit === 'usdc' ? String(Number(v) / 1_000_000) : unit === 'sol' ? String(Number(v) / 1_000_000_000) : String(v);
const fromDisplay = (v: string, unit: 'usdc' | 'sol' | 'int'): string | number =>
  unit === 'usdc' ? String(Math.round(Number(v) * 1_000_000)) : unit === 'sol' ? Math.round(Number(v) * 1_000_000_000) : Math.round(Number(v));

export function EventBots() {
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const cfgQ = useQuery({ queryKey: ['event-bot-config'], queryFn: () => adminFetch<{ data: Cfg }>('/event-bot') });
  const statusQ = useQuery({ queryKey: ['event-bot-status'], queryFn: () => adminFetch<{ data: Status }>('/event-bot/status'), refetchInterval: POLL_MEDIUM_MS });

  const cfg = cfgQ.data?.data;
  const status = statusQ.data?.data;

  useEffect(() => {
    if (!cfg) return;
    const f: Record<string, string> = {};
    for (const [k, , unit] of FIELDS) f[k] = toDisplay(cfg[k] as string | number, unit);
    setForm(f);
  }, [cfg]);

  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const payload: Record<string, string | number> = {};
      for (const [k, , unit] of FIELDS) if (form[k] !== undefined && form[k] !== '') payload[k] = fromDisplay(form[k], unit);
      await adminFetch('/event-bot', { method: 'PUT', body: JSON.stringify(payload) });
      await cfgQ.refetch(); setMsg('Saved.');
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const setEnabled = async (enabled: boolean) => {
    setBusy(true); setMsg(null);
    try { await adminFetch('/event-bot', { method: 'PUT', body: JSON.stringify({ enabled }) }); await cfgQ.refetch(); await statusQ.refetch(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const kill = async () => {
    if (!window.confirm('Stop the event bots now?')) return;
    setBusy(true); setMsg(null);
    try { await adminFetch('/event-bot/kill', { method: 'POST' }); await cfgQ.refetch(); await statusQ.refetch(); }
    catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };

  const btn = (label: string, onClick: () => void, opts?: { primary?: boolean; danger?: boolean }) => (
    <Box component="button" onClick={onClick} disabled={busy} sx={{ px: 2, py: 0.7, borderRadius: 1, fontSize: '0.78rem', fontWeight: 800, cursor: busy ? 'default' : 'pointer', border: opts?.primary ? 'none' : `1px solid ${t.border.medium}`, bgcolor: opts?.primary ? CYAN : 'transparent', color: opts?.danger ? t.error : opts?.primary ? '#04121a' : t.text.primary, opacity: busy ? 0.6 : 1, fontFamily: 'inherit' }}>{label}</Box>
  );
  const th = { color: t.text.tertiary, fontSize: '0.66rem', fontWeight: 700, borderColor: t.border.subtle, py: 0.75 } as const;
  const td = { color: t.text.primary, fontSize: '0.76rem', borderColor: t.border.subtle, py: 0.6 } as const;

  if (cfgQ.isLoading) return <LoadingState variant="inline" />;

  const enabled = cfg?.enabled ?? false;

  return (
    <SectionCard
      title="Event bots"
      subtitle="Bots that place predictions only on the Crypto event pools (BTC/ETH/SOL, 5m)"
      accentColor={enabled ? t.success : t.text.tertiary}
      actions={
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {btn(enabled ? 'Running' : 'Start', () => setEnabled(!enabled), { primary: !enabled, danger: enabled })}
          {btn('Save config', save, { primary: true })}
          {btn('Kill switch', kill, { danger: true })}
        </Box>
      }
    >
      {/* Status */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5, mb: 2 }}>
        <StatCard label="State" value={enabled ? 'RUNNING' : 'STOPPED'} color={enabled ? t.success : t.text.tertiary} />
        <StatCard label="Cluster" value={status?.cluster ?? '—'} />
        <StatCard label="Bot wallets" value={status?.walletCount ?? 0} />
        <StatCard label="Open exposure" value={status ? `$${usdc(status.openExposure)}` : '—'} />
        <StatCard label="Last cycle" value={status ? `${status.diagnostics.placed} bets` : '—'} />
      </Box>

      {status && status.walletCount === 0 && (
        <Box sx={{ mb: 2, px: 1.5, py: 1, borderRadius: 1, bgcolor: `${t.warning}18`, border: `1px solid ${t.warning}44` }}>
          <Typography sx={{ fontSize: '0.78rem', color: t.warning }}>No bot wallets configured. Set <code>EVENT_BOT_KEYS</code> (JSON array of secret keys) on the API.</Typography>
        </Box>
      )}
      {status?.diagnostics.reason && (
        <Typography sx={{ fontSize: '0.74rem', color: t.text.tertiary, mb: 1.5 }}>Last cycle: {status.diagnostics.reason}{status.diagnostics.lastError ? ` — ${status.diagnostics.lastError}` : ''}</Typography>
      )}

      {/* Closing play toggle */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
        <Box component="input" type="checkbox" checked={cfg?.closingBetEnabled ?? true}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.checked; adminFetch('/event-bot', { method: 'PUT', body: JSON.stringify({ closingBetEnabled: v }) }).then(() => cfgQ.refetch()); }} />
        <Typography sx={{ fontSize: '0.78rem', color: t.text.primary }}>Closing play <Box component="span" sx={{ color: t.text.tertiary }}>— seconds before lock, bots pile the price-implied winning side (3 UP / 3 DOWN, no hedging) to blunt a last-second whale</Box></Typography>
      </Box>

      {/* Config form */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.25, mb: 1.5 }}>
        {FIELDS.map(([k, label]) => (
          <Box key={k}>
            <Typography sx={{ fontSize: '0.66rem', color: t.text.tertiary, mb: 0.4 }}>{label}</Typography>
            <Box component="input" type="number" value={form[k] ?? ''} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))}
              sx={{ width: '100%', px: 1, py: 0.6, borderRadius: 1, fontSize: '0.82rem', border: `1px solid ${t.border.medium}`, bgcolor: t.bg.app, color: t.text.primary, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
          </Box>
        ))}
      </Box>
      {msg && <Typography sx={{ fontSize: '0.76rem', color: msg === 'Saved.' ? t.success : t.error, mb: 1 }}>{msg}</Typography>}

      {/* Recent bot bets */}
      {status && status.recentBets.length > 0 && (
        <TableContainer sx={{ mt: 1 }}>
          <Table size="small">
            <TableHead><TableRow>{['When', 'Side', 'Asset', 'Amount', 'Status'].map((h) => <TableCell key={h} sx={th}>{h}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {status.recentBets.slice(0, 12).map((r) => (
                <TableRow key={r.id}>
                  <TableCell sx={td}>{new Date(r.createdAt).toLocaleTimeString()}</TableCell>
                  <TableCell sx={{ ...td, color: r.side === 'UP' ? t.up : t.down, fontWeight: 700 }}>{r.side}</TableCell>
                  <TableCell sx={td}>{r.pool.asset}</TableCell>
                  <TableCell sx={td}>${usdc(r.amount)}</TableCell>
                  <TableCell sx={{ ...td, color: t.text.tertiary }}>{r.pool.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {status && status.wallets.length > 0 && (
        <Typography sx={{ fontSize: '0.68rem', color: t.text.tertiary, mt: 1.5 }}>
          Wallets: {status.wallets.map((w) => `${short(w.pubkey)} ($${usdc(w.usdc)} · ${w.sol.toFixed(2)} SOL)`).join('  ·  ')}
        </Typography>
      )}
    </SectionCard>
  );
}
