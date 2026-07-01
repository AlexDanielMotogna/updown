'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { AppSwitch } from '@/components/ui/SegmentedToggle';
import { SectionCard, LoadingState, Label } from '../ui';

interface BotConfig {
  enabled: boolean;
  perPoolCap: string; perCycleCap: string; maxTotalExposure: string; treasuryFloor: string;
  betMin: string; betMax: string; walletUsdcTopup: string;
  perPoolVariancePct: number;
  intervalSeconds: number; lockMarginSeconds: number; walletSolTopup: number;
  poolTypesCrypto: boolean; poolTypesSports: boolean; poolTypesPm: boolean;
  sideStrategy: string;
  targetPoolIds: string[];
}
interface AdminPool {
  id: string;
  asset: string | null;
  homeTeam: string | null;
  awayTeam: string | null;
  poolType: string;
  status: string;
}
interface BotStatus {
  cluster: string;
  funder: { pubkey: string; usdc: string; sol: number } | null;
  treasuryConfigured: boolean;
  walletCount: number;
  wallets: { pubkey: string; usdc: string; sol: number }[];
  openExposure: string;
  diagnostics?: {
    at: string | null; enabled: boolean; reason: string | null;
    poolsConsidered: number; placed: number; spent: string;
    lastError: string | null; lastErrorAt: string | null;
  };
  recentBets: {
    id: string; poolId: string; side: string; amount: string; createdAt: string; walletAddress: string;
    pool: { asset: string; interval: string | null; poolType: string; homeTeam: string | null; awayTeam: string | null; status: string } | null;
  }[];
}

const USDC = (micro: string) => (Number(micro) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 });
const toMicro = (usdc: string) => String(Math.round(Number(usdc) * 1e6));
const fromMicro = (micro: string) => String(Number(micro) / 1e6);

// Human label for a pool (match name for sports/PM, asset for crypto, id fallback).
type PoolLike = { id: string; asset?: string | null; homeTeam?: string | null; awayTeam?: string | null };
const poolLabelOf = (p: PoolLike) => (p.homeTeam && p.awayTeam ? `${p.homeTeam} vs ${p.awayTeam}` : (p.asset || p.id.slice(0, 8)));

const POOL_TYPE_FILTERS: { key: string; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'CRYPTO', label: 'Crypto' },
  { key: 'SPORTS', label: 'Sports' },
  { key: 'POLYMARKET', label: 'PM' },
];

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
  // Pool picker (target specific pools).
  const [openPools, setOpenPools] = useState<AdminPool[]>([]);
  const [poolSearch, setPoolSearch] = useState('');
  const [poolTypeFilter, setPoolTypeFilter] = useState('ALL');
  // id -> label, so selected chips can show a name even when the pool isn't in
  // the current (crypto-dominated) open-pool page.
  const [namesById, setNamesById] = useState<Record<string, string>>({});
  const fetchedNames = useRef<Set<string>>(new Set());

  // Fetch the picker's open-pool list, filtered by type at the API so sports/PM
  // pools aren't buried under the flood of short-lived crypto pools.
  const loadPools = useCallback(async (type: string) => {
    try {
      const qs = `/pools?status=JOINING,ACTIVE&limit=200${type !== 'ALL' ? `&poolType=${type}` : ''}`;
      const p = await adminFetch<{ data: AdminPool[] }>(qs);
      const pools = p.data ?? [];
      setOpenPools(pools);
      setNamesById(prev => {
        const next = { ...prev };
        for (const pool of pools) next[pool.id] = poolLabelOf(pool);
        return next;
      });
    } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const [c, s] = await Promise.all([
        adminFetch<{ data: BotConfig }>('/liquidity-bot'),
        adminFetch<{ data: BotStatus }>('/liquidity-bot/status'),
      ]);
      setCfg({ ...c.data, targetPoolIds: c.data.targetPoolIds ?? [] });
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
  useEffect(() => { loadPools(poolTypeFilter); }, [poolTypeFilter, loadPools]);

  // Resolve names for selected target pools that aren't in the current page
  // (e.g. sports pools while the picker shows crypto). Fetch each by id once.
  useEffect(() => {
    const ids = cfg?.targetPoolIds ?? [];
    const inOpen = new Set(openPools.map(p => p.id));
    const toFetch = ids.filter(id => !inOpen.has(id) && !fetchedNames.current.has(id));
    if (toFetch.length === 0) return;
    toFetch.forEach(id => fetchedNames.current.add(id));
    (async () => {
      const results = await Promise.all(
        toFetch.map(id => adminFetch<{ data: PoolLike }>(`/pools/${id}`).catch(() => null)),
      );
      setNamesById(prev => {
        const next = { ...prev };
        for (const r of results) if (r?.data) next[r.data.id] = poolLabelOf(r.data);
        return next;
      });
    })();
  }, [cfg?.targetPoolIds, openPools]);

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
        targetPoolIds: cfg.targetPoolIds,
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
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, px: 1.25, py: 0.55, borderRadius: '8px', bgcolor: t.bg.app, border: `1px solid ${t.border.subtle}` }}>
      <Box component="span" sx={{ fontSize: '0.78rem', fontWeight: 700, color: val ? t.text.primary : t.text.secondary }}>{label}</Box>
      <AppSwitch checked={val} onChange={onChange} size="sm" tokens={t} />
    </Box>
  );
  const selectedIds = new Set(cfg.targetPoolIds);
  const q = poolSearch.trim().toLowerCase();
  const availablePools = openPools
    .filter(p => !selectedIds.has(p.id) && (q === '' || poolLabelOf(p).toLowerCase().includes(q) || p.id.toLowerCase().includes(q)))
    .slice(0, 40);

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
        {/* Last-cycle diagnostics — why the bot is or isn't betting */}
        {status?.diagnostics && (
          <Box sx={{ mb: 1, p: 1, borderRadius: 1, bgcolor: t.bg.app, border: `1px solid ${status.diagnostics.lastError ? t.error : t.border.subtle}` }}>
            <Box sx={{ fontSize: '0.74rem', color: t.text.secondary }}>
              <Label>Last cycle</Label>{' '}
              {status.diagnostics.at ? new Date(status.diagnostics.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'never run'}
              {' · '}<Box component="span" sx={{ color: status.diagnostics.placed > 0 ? t.success : t.text.tertiary }}>{status.diagnostics.placed} bets</Box>
              {' · '}{status.diagnostics.poolsConsidered} pools seen
            </Box>
            {status.diagnostics.reason && (
              <Box sx={{ fontSize: '0.74rem', color: t.warning, mt: 0.3 }}>Reason no bets: {status.diagnostics.reason}</Box>
            )}
            {status.diagnostics.lastError && (
              <Box sx={{ fontSize: '0.7rem', color: t.error, mt: 0.3, fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {status.diagnostics.lastError}
                {status.diagnostics.lastErrorAt && ` (${new Date(status.diagnostics.lastErrorAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
              </Box>
            )}
          </Box>
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

        {/* Target specific pools - when any are selected the bot bets ONLY on them */}
        <Box sx={{ mb: 2, p: 1.5, borderRadius: 1, border: `1px solid ${cfg.targetPoolIds.length > 0 ? t.success : t.border.subtle}`, bgcolor: t.bg.app }}>
          <Box sx={{ fontSize: '0.82rem', fontWeight: 700, color: t.text.primary }}>
            Target pools {cfg.targetPoolIds.length > 0 && <Box component="span" sx={{ color: t.success }}>· bot bets ONLY on these ({cfg.targetPoolIds.length})</Box>}
          </Box>
          <Box sx={{ fontSize: '0.68rem', color: t.text.tertiary, mb: 1 }}>
            Empty = all open pools by type. Pick pools to bet only on them until you clear the list or stop the bot. Per-pool/cycle caps still apply.
          </Box>

          {cfg.targetPoolIds.length > 0 && (
            <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mb: 1 }}>
              {cfg.targetPoolIds.map(id => (
                <Box key={id} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.4, borderRadius: '8px', bgcolor: `${t.success}22`, border: `1px solid ${t.border.medium}`, fontSize: '0.74rem', color: t.text.primary }}>
                  <span>{namesById[id] ?? `${id.slice(0, 8)}…`}</span>
                  <Box component="button" onClick={() => setCfg({ ...cfg, targetPoolIds: cfg.targetPoolIds.filter(x => x !== id) })}
                    sx={{ border: 'none', bgcolor: 'transparent', color: t.text.tertiary, cursor: 'pointer', fontSize: '0.95rem', lineHeight: 1, p: 0, '&:hover': { color: t.error } }}>×</Box>
                </Box>
              ))}
              <Box component="button" onClick={() => setCfg({ ...cfg, targetPoolIds: [] })}
                sx={{ px: 1, py: 0.4, borderRadius: '8px', border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', color: t.text.secondary, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700 }}>Clear all</Box>
            </Box>
          )}

          {/* Type filter — API-side, so sports/PM aren't buried under crypto pools */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1 }}>
            {POOL_TYPE_FILTERS.map(f => (
              <Box key={f.key} component="button" onClick={() => setPoolTypeFilter(f.key)}
                sx={{ px: 1.25, py: 0.4, borderRadius: '8px', border: `1px solid ${poolTypeFilter === f.key ? t.border.medium : t.border.subtle}`, cursor: 'pointer', fontSize: '0.72rem', fontWeight: 700,
                  bgcolor: poolTypeFilter === f.key ? `${t.success}22` : 'transparent',
                  color: poolTypeFilter === f.key ? t.text.primary : t.text.secondary }}>
                {f.label}
              </Box>
            ))}
          </Box>

          <Box component="input" value={poolSearch} placeholder="Search open pools to add…"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPoolSearch(e.target.value)}
            sx={{ width: '100%', px: 1, py: 0.6, fontSize: '0.82rem', borderRadius: 1, bgcolor: t.bg.surface, color: t.text.primary, border: `1px solid ${t.border.subtle}`, outline: 'none', mb: 1, '&:focus': { borderColor: t.border.medium } }} />

          <Box sx={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 0.3 }}>
            {availablePools.length === 0 ? (
              <Box sx={{ fontSize: '0.74rem', color: t.text.tertiary, py: 0.5 }}>{openPools.length === 0 ? 'No open pools.' : 'No matches.'}</Box>
            ) : availablePools.map(p => (
              <Box key={p.id} component="button"
                onClick={() => setCfg({ ...cfg, targetPoolIds: [...cfg.targetPoolIds, p.id] })}
                sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1, px: 1, py: 0.55, borderRadius: 0.5, border: 'none', textAlign: 'left', cursor: 'pointer', bgcolor: 'transparent', color: t.text.secondary, '&:hover': { bgcolor: t.bg.surface } }}>
                <Box sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text.primary, fontSize: '0.78rem' }}>{poolLabelOf(p)}</Box>
                <Box sx={{ flexShrink: 0, fontSize: '0.66rem', color: t.text.tertiary }}>{p.poolType} · {p.status}</Box>
              </Box>
            ))}
          </Box>
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
