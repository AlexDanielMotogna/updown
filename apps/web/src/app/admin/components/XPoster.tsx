'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState } from '../ui';

interface XConfig {
  enabled: boolean;
  intervalSeconds: number;
  perCycleCap: number;
  postSports: boolean;
  postPm: boolean;
  postCrypto: boolean;
  includeLink: boolean;
  template: string;
  credentialsConfigured: boolean;
}

export function XPoster() {
  const [cfg, setCfg] = useState<XConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [account, setAccount] = useState<{ username: string; name: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setErr(null);
    try {
      const c = await adminFetch<{ data: XConfig }>('/x-poster');
      setCfg(c.data);
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
      const body = {
        enabled: cfg.enabled,
        intervalSeconds: cfg.intervalSeconds,
        perCycleCap: cfg.perCycleCap,
        postSports: cfg.postSports,
        postPm: cfg.postPm,
        postCrypto: cfg.postCrypto,
        includeLink: cfg.includeLink,
        template: cfg.template,
      };
      const r = await adminFetch<{ data: XConfig }>('/x-poster', { method: 'PUT', body: JSON.stringify(body) });
      setCfg(r.data);
      setMsg('Saved');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const kill = async () => {
    setSaving(true); setErr(null);
    try {
      await adminFetch('/x-poster/kill', { method: 'POST' });
      setMsg('Poster stopped');
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const verify = async () => {
    setSaving(true); setErr(null); setMsg(null); setAccount(null);
    try {
      const r = await adminFetch<{ data: { username: string; name: string } }>('/x-poster/verify');
      setAccount(r.data);
      setMsg(`Connected as @${r.data.username}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setSaving(true); setErr(null); setMsg(null);
    try {
      const r = await adminFetch<{ data: { posted: number } }>('/x-poster/run-now', { method: 'POST' });
      setMsg(`Posted ${r.data.posted} tweet(s)`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState variant="block" />;
  if (!cfg) return <Box sx={{ color: t.error }}>{err || 'Failed to load'}</Box>;

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

  // Live preview of the tweet body.
  const sampleTitle = cfg.postSports ? 'Premier League: Arsenal vs Chelsea' : 'Will BTC close above $100k in 2026?';
  const preview = cfg.template.replace('{title}', sampleTitle) + (cfg.includeLink ? '\n\nhttps://updown.my/match/…' : '');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard title="X (Twitter) poster - status">
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, color: cfg.enabled ? t.success : t.text.tertiary, bgcolor: `${cfg.enabled ? t.success : t.text.tertiary}22` }}>
            {cfg.enabled ? 'RUNNING' : 'STOPPED'}
          </Box>
          <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, color: cfg.credentialsConfigured ? t.success : t.error, bgcolor: `${cfg.credentialsConfigured ? t.success : t.error}22` }}>
            {cfg.credentialsConfigured ? 'API KEYS OK' : 'API KEYS MISSING'}
          </Box>
          {account && (
            <Box component="span" sx={{ px: 1, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 800, color: t.text.primary, bgcolor: t.bg.app, border: `1px solid ${t.border.subtle}` }}>
              Posting as @{account.username}
            </Box>
          )}
          <Box component="button" onClick={verify} disabled={saving || !cfg.credentialsConfigured}
            sx={{ px: 1.2, py: 0.3, borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.secondary, opacity: (saving || !cfg.credentialsConfigured) ? 0.5 : 1 }}>
            Verify account
          </Box>
        </Box>
        {!cfg.credentialsConfigured && (
          <Box sx={{ color: t.warning, fontSize: '0.8rem', mt: 1 }}>
            ⚠ Set X_API_KEY / X_API_SECRET / X_ACCESS_TOKEN / X_ACCESS_SECRET in the API env, then redeploy. The poster won&apos;t tweet until keys are present.
          </Box>
        )}
      </SectionCard>

      <SectionCard title="X poster - config">
        {err && <Box sx={{ color: t.error, fontSize: '0.82rem', mb: 1 }}>{err}</Box>}
        {msg && <Box sx={{ color: t.success, fontSize: '0.82rem', mb: 1 }}>{msg}</Box>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {toggle('Enabled', cfg.enabled, v => setCfg({ ...cfg, enabled: v }))}
          {toggle('Sports', cfg.postSports, v => setCfg({ ...cfg, postSports: v }))}
          {toggle('PM', cfg.postPm, v => setCfg({ ...cfg, postPm: v }))}
          {toggle('Crypto', cfg.postCrypto, v => setCfg({ ...cfg, postCrypto: v }))}
          {toggle('Include link', cfg.includeLink, v => setCfg({ ...cfg, includeLink: v }))}
        </Box>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' }, gap: 1.5, mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Interval (s)</Box>
            {input(cfg.intervalSeconds, v => setCfg({ ...cfg, intervalSeconds: Number(v) }))}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Box sx={{ fontSize: '0.78rem', color: t.text.secondary }}>Tweets per cycle</Box>
            {input(cfg.perCycleCap, v => setCfg({ ...cfg, perCycleCap: Number(v) }))}
          </Box>
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ fontSize: '0.78rem', color: t.text.secondary, mb: 0.6 }}>Template (must contain {'{title}'})</Box>
          {input(cfg.template, v => setCfg({ ...cfg, template: v }), '100%' as unknown as number)}
        </Box>

        <Box sx={{ mb: 2 }}>
          <Box sx={{ fontSize: '0.72rem', color: t.text.tertiary, textTransform: 'uppercase', letterSpacing: 0.5, mb: 0.5 }}>Preview</Box>
          <Box sx={{ p: 1.5, borderRadius: 1, bgcolor: t.bg.app, border: `1px solid ${t.border.subtle}`, fontSize: '0.85rem', color: t.text.primary, whiteSpace: 'pre-wrap' }}>{preview}</Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 1.5, mt: 1, flexWrap: 'wrap' }}>
          <Box component="button" onClick={save} disabled={saving}
            sx={{ px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', border: 'none', bgcolor: t.success, color: '#000', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save config'}
          </Box>
          <Box component="button" onClick={runNow} disabled={saving || !cfg.credentialsConfigured}
            sx={{ px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer', border: `1px solid ${t.border.medium}`, bgcolor: 'transparent', color: t.text.primary, opacity: (saving || !cfg.credentialsConfigured) ? 0.5 : 1 }}>
            Run now
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
