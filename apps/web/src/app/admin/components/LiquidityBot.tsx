'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState, Label } from '../ui';

interface BotConfig {
  enabled: boolean;
  perPoolCap: string; perCycleCap: string; maxTotalExposure: string; treasuryFloor: string;
  betMin: string; betMax: string; walletUsdcTopup: string;
  perPoolVariancePct: number;
  intervalSeconds: number; lockMarginSeconds: number; walletSolTopup: number;
  poolTypesCrypto: boolean; poolTypesSports: boolean; poolTypesPm: boolean;
  sideStrategy: string;
}
interface BotStatus {
  cluster: string;
  funder: { pubkey: string; usdc: string; sol: number } | null;
  treasuryConfigured: boolean;
  walletCount: number;
  wallets: { pubkey: string; usdc: string; sol: number }[];
  openExposure: string;
  recentBets: {
    id: string; poolId: string; side: string; amount: string; createdAt: string; walletAddress: string;
    pool: { asset: string; interval: string | null; poolType: string; homeTeam: string | null; awayTeam: string | null; status: string } | null;
  }[];
}

const USDC = (micro: string) => (Number(micro) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
const toMicro = (usdc: string) => String(Math.round(Number(usdc) * 1e6));
const fromMicro = (micro: string) => String(Number(micro) / 1e6);

// USDC-denominated config fields (stored as micro-USDC).
const USDC_FIELDS: { key: keyof BotConfig; label: string }[] = [
  { key: 'perPoolCap', label: 'Per-pool cap (USDC)' },
  { key: 'perCycleCap', label: 'Per-cycle cap (USDC)' },
  { key: 'maxTotalExposure', label: 'Max total exposure (USDC)' },
  { key: 'treasuryFloor', label: 'Treasury floor (USDC)' },
  { key: 'betMin', label: 'Bet min (USDC)' },
  { key: 'betMax', label: 'Bet max (USDC)' },
  { key: 'walletUsdcTopup', label: 'Wallet USDC top-up target' },
];

export function LiquidityBot() {
  const [cfg, setCfg] = useState<BotConfig | null>(null);
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // USDC fields edited as decimal strings.
  const [usdcInputs, setUsdcInputs] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, s] = await Promise.all([
        adminFetch<{ data: BotConfig }>('/liquidity-bot'),
        adminFetch<{ data: BotStatus }>('/liquidity-bot/status'),
      ]);
      setCfg(c.data);
      setStatus(s.data);
      const inputs: Record<string, string> = {};
      for (const f of USDC_FIELDS) inputs[f.key] = fromMicro(c.data[f.key] as string);
      setUsdcInputs(inputs);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!cfg) return;
    setSaving(true); setErr(null); setMsg(null);
    try {
      const body: Record<string, unknown> = {
        enabled: cfg.enabled,
        intervalSeconds: cfg.intervalSeconds,
        lockMarginSeconds: cfg.lockMarginSeconds,
        walletSolTopup: cfg.walletSolTopup,
        perPoolVariancePct: cfg.perPoolVariancePct,
        poolTypesCrypto: cfg.poolTypesCrypto,
        poolTypesSports: cfg.poolTypesSports,
        poolTypesPm: cfg.poolTypesPm,
        sideStrategy: cfg.sideStrategy,
      };
      for (const f of USDC_FIELDS) body[f.key] = toMicro(usdcInputs[f.key] || '0');
      const r = await adminFetch<{ data: BotConfig }>('/liquidity-bot', { method: 'PUT', body: JSON.stringify(body) });
      setCfg(r.data);
      setMsg('Saved');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const kill = async () => {
    setSaving(true); setErr(null);
    try {
      await adminFetch('/liquidity-bot/kill', { method: 'POST' });
      setMsg('Bot stopped');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState variant="block" />;
  if (!cfg) return <Box sx={{ color: t.error }}>{err || 'Failed to load'}</Box>;

  const isMainnet = status?.cluster === 'mainnet';
  const input = (val: string | number, onChange: (v: string) => void, w = 120) => (
    <Box component="input" value={val}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
      sx={{ width: w, px: 1, py: 0.6, fontSize: '0.82rem', borderRadius: 1, bgcolor: t.bg.app, color: t.text.primary, border: `1px solid ${t.border.subtle}`, outline: 'none', '&:focus': { borderColor: t.border.medium } }} />
  );
  const toggle = (label: string, val: boolean, onChange: (v: boolean) => void) => (
    <Box component="button" onClick={() => onChange(!val)}
      sx={{ px: 1.5, py: 0.6, borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${val ? 'transparent' : t.border.subtle}`, bgcolor: val ? t.success : 'transparent', color: val ? '#000' : t.text.secondary }}>
      {label}: {val ? 'ON' : 'OFF'}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* Status */}
      <SectionCard title="Liquidity bot - status">
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
          <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, color: isMainnet ? t.error : t.success, bgcolor: `${isMainnet ? t.error : t.success}22` }}>
            {status?.cluster?.toUpperCase() ?? '?'}
          </Box>
          <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, color: cfg.enabled ? t.success : t.text.tertiary, bgcolor: `${cfg.enabled ? t.success : t.text.tertiary}22` }}>
            {cfg.enabled ? 'RUNNING' : 'STOPPED'}
          </Box>
          <span style={{ fontSize: '0.8rem', color: t.text.secondary }}><Label>Wallets</Label> {status?.walletCount ?? 0}</span>
          <span style={{ fontSize: '0.8rem', color: t.text.secondary }}><Label>Open exposure</Label> {status ? USDC(status.openExposure) : '-'} USDC</span>
        </Box>
        {isMainnet && !status?.treasuryConfigured && (
          <Box sx={{ color: t.warning, fontSize: '0.8rem', mb: 1 }}>⚠ Mainnet: TREASURY_SECRET_KEY not configured - bot cannot fund wallets.</Box>
        )}
        {status?.funder && (
          <Box sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 1 }}>
            <Label>Funder</Label> {status.funder.pubkey.slice(0, 8)}… · {USDC(status.funder.usdc)} USDC · {status.funder.sol.toFixed(3)} SOL
          </Box>
        )}
        {status && status.wallets.length > 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.3, mb: 1 }}>
            {status.wallets.map(w => (
              <Box key={w.pubkey} sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>
                {w.pubkey.slice(0, 8)}… · {USDC(w.usdc)} USDC · {w.sol.toFixed(3)} SOL
              </Box>
            ))}
          </Box>
        )}
      </SectionCard>

      {/* Bot bets - clean table */}
      <SectionCard title={`Bot bets${status ? ` (${status.recentBets.length})` : ''}`}>
        {!status || status.recentBets.length === 0 ? (
          <Box sx={{ fontSize: '0.82rem', color: t.text.tertiary }}>No bets yet.</Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <Box sx={{ display: 'grid', gridTemplateColumns: '1.6fr 0.6fr 0.7fr 0.8fr 0.7fr', gap: 1, px: 1, py: 0.75, borderBottom: `1px solid ${t.border.subtle}`, fontSize: '0.7rem', fontWeight: 800, color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              <Box>Market</Box>
              <Box>Side</Box>
              <Box sx={{ textAlign: 'right' }}>Amount</Box>
              <Box>Wallet</Box>
              <Box sx={{ textAlign: 'right' }}>Time</Box>
            </Box>
            {/* Rows */}
            {status.recentBets.map((b, i) => {
              const p = b.pool;
              const market = p?.homeTeam && p?.awayTeam ? `${p.homeTeam} vs ${p.awayTeam}` : (p?.asset || b.poolId.slice(0, 10));
              const sub = [p?.poolType, p?.interval].filter(Boolean).join(' · ');
              const sideColor = b.side === 'UP' ? t.success : b.side === 'DOWN' ? t.error : t.text.secondary;
              return (
                <Box key={b.id} sx={{ display: 'grid', gridTemplateColumns: '1.6fr 0.6fr 0.7fr 0.8fr 0.7fr', gap: 1, px: 1, py: 0.85, alignItems: 'center', bgcolor: i % 2 ? 'transparent' : t.bg.app, borderRadius: 0.5, fontSize: '0.78rem', color: t.text.secondary }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Box sx={{ color: t.text.primary, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{market}</Box>
                    {sub && <Box sx={{ fontSize: '0.68rem', color: t.text.tertiary }}>{sub}</Box>}
                  </Box>
                  <Box sx={{ fontWeight: 800, color: sideColor }}>{b.side}</Box>
                  <Box sx={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: t.text.primary }}>{USDC(b.amount)}</Box>
                  <Box sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{b.walletAddress.slice(0, 4)}…{b.walletAddress.slice(-4)}</Box>
                  <Box sx={{ textAlign: 'right', fontSize: '0.72rem', color: t.text.tertiary }}>{new Date(b.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Box>
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>

      {/* Config */}
      <SectionCard title="Liquidity bot - config">
        {err && <Box sx={{ color: t.error, fontSize: '0.82rem', mb: 1 }}>{err}</Box>}
        {msg && <Box sx={{ color: t.success, fontSize: '0.82rem', mb: 1 }}>{msg}</Box>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {toggle('Enabled', cfg.enabled, v => setCfg({ ...cfg, enabled: v }))}
          {toggle('Crypto', cfg.poolTypesCrypto, v => setCfg({ ...cfg, poolTypesCrypto: v }))}
          {toggle('Sports', cfg.poolTypesSports, v => setCfg({ ...cfg, poolTypesSports: v }))}
          {toggle('PM', cfg.poolTypesPm, v => setCfg({ ...cfg, poolTypesPm: v }))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 2 }}>
          {USDC_FIELDS.map(f => (
            <Box key={f.key} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>{f.label}</Box>
              {input(usdcInputs[f.key] ?? '', v => setUsdcInputs({ ...usdcInputs, [f.key]: v }))}
            </Box>
          ))}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Per-pool variance (%)<Box component="span" sx={{ display: 'block', fontSize: '0.66rem', color: t.text.tertiary }}>0 = every pool to cap · 50 = 50–100% of cap</Box></Box>
            {input(cfg.perPoolVariancePct, v => setCfg({ ...cfg, perPoolVariancePct: Number(v) }))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Interval (s)</Box>
            {input(cfg.intervalSeconds, v => setCfg({ ...cfg, intervalSeconds: Number(v) }))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Lock margin (s)</Box>
            {input(cfg.lockMarginSeconds, v => setCfg({ ...cfg, lockMarginSeconds: Number(v) }))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Wallet SOL top-up (lamports)</Box>
            {input(cfg.walletSolTopup, v => setCfg({ ...cfg, walletSolTopup: Number(v) }), 140)}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, mt: 1 }}>
          <Box component="button" onClick={save} disabled={saving}
            sx={{ px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save config'}
          </Box>
          <Box component="button" onClick={kill} disabled={saving}
            sx={{ px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', border: `1px solid ${t.error}`, bgcolor: 'transparent', color: t.error }}>
            Kill switch (stop)
          </Box>
        </Box>
      </SectionCard>
    </Box>
  );
}
