'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box, TextField, Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adminPost, adminPostSSE, adminGet } from '../lib/adminApi';
import { darkTokens as t } from '@/lib/theme';
import {
  SectionCard, ConfirmDialog, ActionButton,
  ErrorAlert, useMutationFeedback, useToast,
  Body, Meta, H2,
} from '../ui';

interface LogLine {
  type: string;
  message: string;
  [key: string]: unknown;
}

const LOG_COLORS: Record<string, string> = {
  info: t.logColors.info,
  success: t.logColors.success,
  warn: t.logColors.warn,
  error: t.logColors.error,
  pool_start: t.logColors.poolStart,
  complete: t.logColors.complete,
  done: t.logColors.complete,
};

// Per PLAN-ADMIN-REFACTOR.md §3.8: the previous layout coloured every
// "danger zone" card with a red border whether the action was destructive
// or routine. Group by intent instead - destructive cards use the
// destructive ActionButton variant + ConfirmDialog severity, neutral
// cards (Restart scheduler, Create pool) get no accent.
type ActionDef = {
  key: string;
  title: string;
  description: string;
  severity: 'warning' | 'destructive';
  accent?: string;
};

export function ManualActions() {
  const qc = useQueryClient();
  const toast = useToast();
  const feedback = useMutationFeedback();
  const [confirmAction, setConfirmAction] = useState<{ label: string; severity: 'warning' | 'destructive'; fn: () => Promise<unknown> } | null>(null);

  // Pool ID inputs
  const [resolveId, setResolveId] = useState('');
  const [refundId, setRefundId] = useState('');
  const [closeId, setCloseId] = useState('');
  const [forceClose, setForceClose] = useState(false); // Plan §3.8: surface the `force` flag of close-pool

  // Create pool inputs
  const [asset, setAsset] = useState('BTC');
  const [intervalKey, setIntervalKey] = useState('5m');

  // Recovery state
  const [recoveryRunning, setRecoveryRunning] = useState(false);
  const [recoveryLogs, setRecoveryLogs] = useState<LogLine[]>([]);
  const [recoveryError, setRecoveryError] = useState<unknown | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);

  useEffect(() => {
    // Only auto-scroll to the newest line if the user is already at the bottom,
    // so scrolling up to read earlier logs isn't yanked back down every tick.
    if (atBottomRef.current) logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [recoveryLogs]);

  // Subscribe to the (server-side, background) recovery job's SSE stream. The
  // server replays buffered logs + streams new ones; leaving the page only
  // unsubscribes — the scan keeps running and we reconnect on return.
  const subscribeRecovery = async () => {
    setRecoveryError(null);
    try {
      await adminPostSSE('/actions/recover-orphaned-pools', undefined, (event) => {
        setRecoveryLogs(prev => [...prev, event as LogLine]);
      });
      toast.show({ kind: 'success', message: 'Recovery scan finished' });
    } catch (err) {
      setRecoveryLogs(prev => [...prev, { type: 'error', message: `Connection error: ${err instanceof Error ? err.message : String(err)}` }]);
      setRecoveryError(err);
    }

    setRecoveryRunning(false);
    qc.invalidateQueries({ queryKey: ['admin-health'] });
    qc.invalidateQueries({ queryKey: ['admin-finance'] });
  };

  const startRecovery = async () => {
    setRecoveryRunning(true);
    setRecoveryLogs([]);
    setConfirmAction(null);
    await subscribeRecovery();
  };

  // Reconnect to an already-running recovery job (e.g. you navigated away and
  // came back) — it keeps running server-side regardless of this page.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await adminGet<{ data: { running: boolean } }>('/actions/recovery-status');
        if (!cancelled && r.data?.running) {
          setRecoveryRunning(true);
          setRecoveryLogs([]); // server replays its buffer on connect
          subscribeRecovery();
        }
      } catch { /* not running / unauthorized — ignore */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const execMutation = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: () => {
      setConfirmAction(null);
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-stuck-pools'] });
      qc.invalidateQueries({ queryKey: ['admin-health'] });
    },
    onError: () => setConfirmAction(null),
  });

  const runConfirmed = () => {
    if (!confirmAction) return;
    if (confirmAction.label.toLowerCase().includes('orphan')) {
      // SSE - keep its own loop; the toast fires from startRecovery.
      void confirmAction.fn();
      return;
    }
    void feedback.run(execMutation, confirmAction.fn, { success: `${confirmAction.label} succeeded` });
  };

  // Action card definitions for the bottom grid. Defining them as data
  // lets the rendering loop stay tiny and consistent.
  const poolActions: ActionDef[] = useMemo(() => [
    { key: 'resolve', title: 'Force resolve pool', description: 'Resolve a stuck JOINING/ACTIVE pool using the current market price.', severity: 'warning' },
    { key: 'refund', title: 'Force refund pool', description: 'Resolve with synthetic prices and refund every bet on-chain.', severity: 'destructive', accent: t.error },
    { key: 'close', title: 'Force close pool', description: 'Close a CLAIMABLE pool and reclaim rent. Toggle "force" to close even with unclaimed bets.', severity: 'destructive', accent: t.error },
  ], []);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {/* ─── Header notice ─────────────────────────────────────────── */}
      <SectionCard
        dense
        accentColor={t.warning}
        title="Danger zone"
        subtitle="These actions are irreversible and may trigger on-chain transactions. Every action goes through a confirmation dialog."
      >{null}</SectionCard>

      {/* Stuck PM + knockout queues moved to Pools › Needs Attention. */}

      {/* ─── Recovery + restart ────────────────────────────────────── */}
      <H2>Recovery &amp; sync</H2>
      <SectionCard
        accentColor={t.warning}
        title="Recover orphaned pools"
        subtitle="Scan on-chain for pools deleted from the DB. Resolves and closes them to reclaim rent. 1s pause between operations."
        actions={
          recoveryRunning ? (
            <ActionButton
              kind="destructive"
              label="Stop"
              onClick={() => { adminPost('/actions/stop-recovery').catch(() => {}); }}
            />
          ) : (
            <ActionButton
              kind="primary"
              label="Scan &amp; recover"
              onClick={() => setConfirmAction({
                label: 'Scan & recover orphaned pools',
                severity: 'warning',
                fn: startRecovery,
              })}
            />
          )
        }
      >
        {recoveryError ? (
          <Box sx={{ mb: 1 }}>
            <ErrorAlert title="Recovery connection failed" message={recoveryError instanceof Error ? recoveryError.message : String(recoveryError)} details={recoveryError} />
          </Box>
        ) : null}
        {recoveryLogs.length > 0 && (
          <Box
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
            }}
            sx={{
              bgcolor: t.bg.surfaceAlt,
              border: `1px solid ${t.border.subtle}`,
              borderRadius: 1.5,
              p: 1.5,
              maxHeight: 400,
              overflow: 'auto',
              fontSize: '0.75rem',
              lineHeight: 1.6,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              '&::-webkit-scrollbar': { width: 6 },
              '&::-webkit-scrollbar-thumb': { bgcolor: t.scrollbar.thumb, borderRadius: 3 },
            }}
          >
            {recoveryLogs.map((log, i) => (
              <Box key={i} sx={{ color: LOG_COLORS[log.type] || t.text.primary, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {log.type === 'done' ? (
                  <Box sx={{ mt: 1, pt: 1, borderTop: `1px solid ${t.border.subtle}`, fontWeight: 700 }}>
                    {log.message}
                  </Box>
                ) : (
                  log.message
                )}
              </Box>
            ))}
            <div ref={logEndRef} />
          </Box>
        )}
      </SectionCard>

      <SectionCard
        dense
        title="Restart scheduler"
        subtitle="Stop and restart all scheduler cron jobs. Live pools keep their state."
        actions={
          <ActionButton
            kind="secondary"
            label="Restart"
            onClick={() => setConfirmAction({
              label: 'Restart scheduler',
              severity: 'warning',
              fn: () => adminPost('/actions/restart-scheduler'),
            })}
          />
        }
      >{null}</SectionCard>

      {/* ─── Crypto pool emergency ─────────────────────────────────── */}
      <H2>Crypto pool emergency</H2>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 2 }}>
        {poolActions.map(a => (
          <SectionCard
            key={a.key}
            dense
            accentColor={a.accent}
            title={a.title}
            subtitle={a.description}
          >
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
              {a.key === 'resolve' && (
                <>
                  <TextField size="small" placeholder="Pool UUID" value={resolveId} onChange={e => setResolveId(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
                  <ActionButton
                    kind="secondary"
                    label="Resolve"
                    disabled={!resolveId}
                    onClick={() => setConfirmAction({
                      label: `Resolve pool ${resolveId.slice(0, 8)}…`,
                      severity: a.severity,
                      fn: () => adminPost('/actions/resolve-pool', { poolId: resolveId }),
                    })}
                  />
                </>
              )}
              {a.key === 'refund' && (
                <>
                  <TextField size="small" placeholder="Pool UUID" value={refundId} onChange={e => setRefundId(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
                  <ActionButton
                    kind="destructive"
                    label="Refund"
                    disabled={!refundId}
                    onClick={() => setConfirmAction({
                      label: `Refund pool ${refundId.slice(0, 8)}…`,
                      severity: a.severity,
                      fn: () => adminPost('/actions/refund-pool', { poolId: refundId }),
                    })}
                  />
                </>
              )}
              {a.key === 'close' && (
                <>
                  <TextField size="small" placeholder="Pool UUID" value={closeId} onChange={e => setCloseId(e.target.value)} sx={{ flex: 1, minWidth: 180 }} />
                  <Box component="label" htmlFor="forceClose" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      id="forceClose"
                      checked={forceClose}
                      onChange={(e) => setForceClose(e.target.checked)}
                    />
                    <Meta component="span">force</Meta>
                  </Box>
                  <ActionButton
                    kind="destructive"
                    label="Close"
                    disabled={!closeId}
                    onClick={() => setConfirmAction({
                      label: `${forceClose ? 'Force-close' : 'Close'} pool ${closeId.slice(0, 8)}…`,
                      severity: a.severity,
                      fn: () => adminPost('/actions/close-pool', { poolId: closeId, force: forceClose }),
                    })}
                  />
                </>
              )}
            </Box>
          </SectionCard>
        ))}

        <SectionCard
          dense
          title="Create pool"
          subtitle="Manually create a pool. Admin-only, replaces /api/pools/test."
        >
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Asset</InputLabel>
              <Select value={asset} onChange={e => setAsset(e.target.value)} label="Asset">
                <MenuItem value="BTC">BTC</MenuItem>
                <MenuItem value="ETH">ETH</MenuItem>
                <MenuItem value="SOL">SOL</MenuItem>
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 100 }}>
              <InputLabel>Interval</InputLabel>
              <Select value={intervalKey} onChange={e => setIntervalKey(e.target.value)} label="Interval">
                <MenuItem value="3m">3m</MenuItem>
                <MenuItem value="5m">5m</MenuItem>
                <MenuItem value="15m">15m</MenuItem>
                <MenuItem value="1h">1h</MenuItem>
              </Select>
            </FormControl>
            <ActionButton
              kind="primary"
              label="Create"
              onClick={() => setConfirmAction({
                label: `Create ${asset} ${intervalKey} pool`,
                severity: 'warning',
                fn: () => adminPost('/actions/create-pool', { asset, intervalKey }),
              })}
            />
          </Box>
        </SectionCard>
      </Box>

      <ConfirmDialog
        open={!!confirmAction}
        onClose={() => !recoveryRunning && setConfirmAction(null)}
        onConfirm={runConfirmed}
        loading={execMutation.isPending || recoveryRunning}
        title="Confirm action"
        consequences={confirmAction ? <>This will execute: <Body component="strong" sx={{ display: 'inline', fontWeight: 700 }}>{confirmAction.label}</Body>. Many actions trigger on-chain transactions and cannot be undone.</> : ''}
        actionLabel="Confirm"
        severity={confirmAction?.severity ?? 'warning'}
      />
    </Box>
  );
}
