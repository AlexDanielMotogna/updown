'use client';

import { useEffect, useState, useCallback } from 'react';
import { Box } from '@mui/material';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import { SectionCard, LoadingState } from '../ui';

interface Cfg {
  allow3m: boolean;
  allow5m: boolean;
  allow15m: boolean;
  allow1h: boolean;
}

const INTERVALS: { key: keyof Cfg; label: string }[] = [
  { key: 'allow3m', label: '3m' },
  { key: 'allow5m', label: '5m' },
  { key: 'allow15m', label: '15m' },
  { key: 'allow1h', label: '1h' },
];

export function PoolCreation() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const c = await adminFetch<{ data: Cfg }>('/pool-creation');
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
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const r = await adminFetch<{ data: Cfg }>('/pool-creation', { method: 'PUT', body: JSON.stringify(cfg) });
      setCfg(r.data);
      setMsg('Saved');
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState variant="block" />;
  if (!cfg) return <Box sx={{ color: t.error }}>{err || 'Failed to load'}</Box>;

  const toggle = (key: keyof Cfg, label: string) => {
    const val = cfg[key];
    return (
      <Box
        key={key}
        component="button"
        onClick={() => setCfg({ ...cfg, [key]: !val })}
        sx={{
          px: 2, py: 0.7, borderRadius: '999px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
          border: `1px solid ${val ? 'transparent' : t.border.subtle}`,
          bgcolor: val ? t.success : 'transparent', color: val ? '#000' : t.text.secondary,
        }}
      >
        {label}: {val ? 'ON' : 'OFF'}
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <SectionCard title="Pool Creation — per interval">
        <Box sx={{ fontSize: '0.82rem', color: t.text.secondary, mb: 2 }}>
          Toggle creation of new prediction pools per interval. Turning one OFF stops creating new
          pools for it (saves on-chain RPC); existing pools still resolve/close. Short intervals
          (3m/5m/15m) are off by default while in testing — flip them on when users arrive.
        </Box>
        {err && <Box sx={{ color: t.error, fontSize: '0.82rem', mb: 1 }}>{err}</Box>}
        {msg && <Box sx={{ color: t.success, fontSize: '0.82rem', mb: 1 }}>{msg}</Box>}

        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
          {INTERVALS.map((i) => toggle(i.key, i.label))}
        </Box>

        <Box
          component="button"
          onClick={save}
          disabled={saving}
          sx={{
            px: 2.5, py: 1, borderRadius: 1, fontSize: '0.85rem', fontWeight: 800, cursor: 'pointer',
            border: 'none', bgcolor: t.success, color: '#000', opacity: saving ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </Box>
      </SectionCard>
    </Box>
  );
}
