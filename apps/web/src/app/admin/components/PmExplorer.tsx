'use client';

/**
 * Polymarket admin explorer - mirror of MatchExplorer for prediction markets.
 *
 *   ┌─────────────────────────┬──────────────────────────────────────────────┐
 *   │  Categories sidebar     │  Selected category header (refresh / browse) │
 *   │  (PM cats + counts)     │  Markets table (upcoming / past)             │
 *   │                         │   ├─ row: question · endDate · subcat · pool │
 *   │                         │   └─ action: Create pool / Resolve manually  │
 *   └─────────────────────────┴──────────────────────────────────────────────┘
 *
 * Backed by /api/admin/polymarket/* (see polymarket-explorer.ts).
 * See PLAN-ADMIN-REFACTOR.md Phase 4.
 */
import { useMemo, useState } from 'react';
import {
  Box, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import LaunchRoundedIcon from '@mui/icons-material/LaunchRounded';
import GavelRoundedIcon from '@mui/icons-material/GavelRounded';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';
import {
  SectionCard, StatusChip, AdminDialog, ConfirmDialog,
  ActionButton, RefreshButton, LoadingState, EmptyState,
  FilterBar, TimeCell, IdCell, Body, Meta, Label,
  useMutationFeedback,
  POLL_MEDIUM_MS,
} from '../ui';
import {
  type PmCategory, type PmMarketRow,
  MARKET_STATUS_KIND, PM_ACCENT,
} from './pm-explorer-config';
import { BrowseGammaTagsModal } from './PmExplorerDialogs';

export function PmExplorer() {
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [direction, setDirection] = useState<'upcoming' | 'past'>('upcoming');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [browseTagsOpen, setBrowseTagsOpen] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<{ poolId: string; question: string } | null>(null);
  const [resolveWinner, setResolveWinner] = useState<'HOME' | 'AWAY'>('HOME');
  const [createTarget, setCreateTarget] = useState<PmMarketRow | null>(null);

  const catsQ = useQuery({
    queryKey: ['admin-pm-categories'],
    queryFn: () => adminFetch<{ data: PmCategory[] }>('/polymarket/categories'),
    refetchInterval: POLL_MEDIUM_MS,
  });
  const cats: PmCategory[] = catsQ.data?.data ?? [];

  const filteredCats = useMemo(() => {
    const q = categoryFilter.trim().toLowerCase();
    if (!q) return cats;
    return cats.filter(c =>
      c.code.toLowerCase().includes(q) ||
      c.label.toLowerCase().includes(q) ||
      c.tags.some(tg => tg.toLowerCase().includes(q)),
    );
  }, [cats, categoryFilter]);

  const selected = useMemo(() => cats.find(c => c.code === selectedCode) ?? null, [cats, selectedCode]);

  // Right-pane markets table for the selected category.
  const marketsQ = useQuery({
    queryKey: ['admin-pm-markets', selectedCode, direction],
    queryFn: () => adminFetch<{ data: PmMarketRow[] }>(`/polymarket/markets?category=${selectedCode}&status=${direction}`),
    enabled: !!selectedCode,
    refetchInterval: POLL_MEDIUM_MS,
  });
  const markets: PmMarketRow[] = marketsQ.data?.data ?? [];

  const refreshMutation = useMutation({
    mutationFn: (code: string) =>
      adminPost<{ data: { eventsFetched: number; marketsUpserted: number; markets: number } }>('/polymarket/refresh-category', { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pm-categories'] });
      qc.invalidateQueries({ queryKey: ['admin-pm-markets', selectedCode] });
    },
  });

  const createPoolMutation = useMutation({
    mutationFn: (vars: { matchId: string; category: string }) =>
      adminPost<{ data: { poolId: string } }>('/polymarket/create-pool', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pm-categories'] });
      qc.invalidateQueries({ queryKey: ['admin-pm-markets', selectedCode] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      setCreateTarget(null);
    },
    onError: () => setCreateTarget(null),
  });

  const resolveMutation = useMutation({
    mutationFn: (vars: { poolId: string; winner: 'HOME' | 'AWAY'; reason?: string }) =>
      adminPost<{ data: { poolId: string; winner: 'HOME' | 'AWAY' } }>('/polymarket/resolve-market', vars),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pm-markets', selectedCode] });
      qc.invalidateQueries({ queryKey: ['admin-pools'] });
      setResolveTarget(null);
    },
    onError: () => setResolveTarget(null),
  });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: 2, alignItems: 'flex-start' }}>
      {/* ─── Left: categories sidebar ─────────────────────────────── */}
      <SectionCard
        dense
        title="Polymarket categories"
        actions={
          <Tooltip title="Browse Gamma active tags">
            <span>
              <ActionButton
                kind="secondary"
                label="Browse tags"
                icon={<TravelExploreRoundedIcon sx={{ fontSize: 16 }} />}
                onClick={() => setBrowseTagsOpen(true)}
              />
            </span>
          </Tooltip>
        }
      >
        <Box sx={{ mb: 1 }}>
          <FilterBar
            value={categoryFilter}
            onChange={setCategoryFilter}
            placeholder="Filter by code, label, or tag…"
          />
        </Box>
        {catsQ.isLoading ? (
          <LoadingState variant="block" />
        ) : filteredCats.length === 0 ? (
          <EmptyState
            title={cats.length === 0 ? 'No PM categories configured' : 'No matches'}
            hint={cats.length === 0
              ? 'Add a Polymarket category in the Categories tab first, then assign one or more Gamma tag IDs to it.'
              : 'Clear the filter to see every category.'}
          />
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
            {filteredCats.map(c => {
              const isSelected = selectedCode === c.code;
              return (
                <Box
                  key={c.code}
                  onClick={() => setSelectedCode(c.code)}
                  sx={{
                    px: 1.5, py: 1.25, cursor: 'pointer',
                    borderLeft: '3px solid',
                    borderLeftColor: isSelected ? PM_ACCENT : 'transparent',
                    bgcolor: isSelected ? t.hover.medium : 'transparent',
                    borderBottom: `1px solid ${t.border.subtle}`,
                    '&:hover': { bgcolor: t.hover.subtle },
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.25, flexWrap: 'wrap' }}>
                    <Box sx={{
                      px: 0.75, py: 0.125, borderRadius: 1,
                      fontSize: '0.62rem', fontWeight: 700,
                      bgcolor: withAlpha(PM_ACCENT, 0.18), color: PM_ACCENT,
                    }}>{c.code}</Box>
                    {c.tagIds.length > 0 && (
                      <Box sx={{ fontSize: '0.6rem', color: t.text.tertiary }}>{c.tagIds.length} tag(s)</Box>
                    )}
                  </Box>
                  <Body sx={{ fontSize: '0.78rem', fontWeight: 500, color: t.text.primary, lineHeight: 1.3 }}>{c.label}</Body>
                  <Box sx={{ display: 'flex', gap: 1, mt: 0.5, fontSize: '0.65rem', color: t.text.tertiary, fontVariantNumeric: 'tabular-nums' }}>
                    <Box component="span">{c.poolCount} pool{c.poolCount === 1 ? '' : 's'}</Box>
                    <Box component="span">·</Box>
                    <Box component="span">{c.cachedMarketCount} cached</Box>
                    <Box component="span">·</Box>
                    <Box component="span">
                      {c.lastBulkSyncAt
                        ? <TimeCell value={c.lastBulkSyncAt} mode="relative" tooltip={false} />
                        : 'never synced'}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        )}
      </SectionCard>

      {/* ─── Right: selected category detail ─────────────────────── */}
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {!selected ? (
          <SectionCard dense>
            <EmptyState
              title="Pick a category"
              hint="Select a Polymarket category on the left to browse cached markets, refresh from Gamma, or create pools."
            />
          </SectionCard>
        ) : (
          <>
            <SectionCard
              accentColor={PM_ACCENT}
              title={selected.label}
              subtitle={
                <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
                  <Meta>code <Box component="strong" sx={{ color: t.text.secondary }}>{selected.code}</Box></Meta>
                  <Meta>tagIds <Box component="strong" sx={{ color: t.text.secondary }}>{selected.tagIds.length}</Box></Meta>
                  <Meta>min vol/24h <Box component="strong" sx={{ color: t.text.secondary }}>${selected.minVolume24h.toLocaleString()}</Box></Meta>
                  <Meta>max markets <Box component="strong" sx={{ color: t.text.secondary }}>{selected.maxMarkets}</Box></Meta>
                  <Meta>window <Box component="strong" sx={{ color: t.text.secondary }}>{selected.maxDaysAhead}d</Box></Meta>
                  <Meta>
                    last sync{' '}
                    {selected.lastBulkSyncAt
                      ? <TimeCell value={selected.lastBulkSyncAt} mode="relative" />
                      : <Box component="strong" sx={{ color: t.text.secondary }}>never</Box>}
                  </Meta>
                </Box>
              }
              actions={
                <Box sx={{ display: 'inline-flex', gap: 1, alignItems: 'center' }}>
                  <SegmentedToggle
                    size="sm"
                    value={direction}
                    onChange={setDirection}
                    tokens={t}
                    options={[
                      { value: 'upcoming', label: 'Upcoming' },
                      { value: 'past', label: 'Past' },
                    ]}
                  />
                  <ActionButton
                    kind="secondary"
                    label="Refresh"
                    icon={<RefreshRoundedIcon sx={{ fontSize: 16 }} />}
                    loading={refreshMutation.isPending}
                    onClick={() => feedback.run(refreshMutation, selected.code, {
                      success: (d) => `Refreshed: ${d.data.eventsFetched} events → ${d.data.marketsUpserted} markets upserted`,
                    })}
                  />
                </Box>
              }
            >
              {selected.tags.length > 0 && (
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mb: 1 }}>
                  {selected.tags.map(tg => (
                    <Box
                      key={tg}
                      sx={{
                        fontSize: '0.62rem', fontWeight: 600, px: 0.75, py: 0.125,
                        borderRadius: 1,
                        bgcolor: t.hover.medium, color: t.text.tertiary,
                      }}
                    >
                      {tg}
                    </Box>
                  ))}
                </Box>
              )}
            </SectionCard>

            <SectionCard
              title={`Markets (${markets.length})`}
              actions={<RefreshButton onRefresh={() => marketsQ.refetch()} isFetching={marketsQ.isFetching} />}
            >
              {marketsQ.isLoading ? (
                <LoadingState variant="block" />
              ) : markets.length === 0 ? (
                <EmptyState
                  title={direction === 'upcoming' ? 'No upcoming markets in cache' : 'No past markets in cache'}
                  hint={
                    direction === 'upcoming'
                      ? `Try the Refresh button to pull the latest markets from Gamma for ${selected.code}.`
                      : 'Resolved markets older than 30 days are pruned by the cleanup cron.'
                  }
                />
              ) : (
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell><Label>Question</Label></TableCell>
                        <TableCell><Label>Subcategory</Label></TableCell>
                        <TableCell><Label>Ends</Label></TableCell>
                        <TableCell><Label>Status</Label></TableCell>
                        <TableCell><Label>Odds</Label></TableCell>
                        <TableCell><Label>Pool</Label></TableCell>
                        <TableCell align="right"><Label>Action</Label></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {markets.map(m => (
                        <TableRow key={m.externalId} hover>
                          <TableCell sx={{ maxWidth: 360 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              {m.image && <Box component="img" src={m.image} alt="" sx={{ width: 22, height: 22, objectFit: 'contain', borderRadius: 0.5 }} />}
                              <Tooltip title={m.externalId}>
                                <Body sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: t.text.primary, fontSize: '0.8rem' }}>
                                  {m.question}{m.opponent ? ` vs ${m.opponent}` : ''}
                                </Body>
                              </Tooltip>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {m.subcategory
                              ? <StatusChip status="info" label={m.subcategory} />
                              : <Meta>-</Meta>}
                          </TableCell>
                          <TableCell><TimeCell value={m.endDate} mode="datetime" /></TableCell>
                          <TableCell><StatusChip status={MARKET_STATUS_KIND[m.status] ?? 'neutral'} label={m.status} /></TableCell>
                          <TableCell sx={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.78rem' }}>
                            {m.marketOdds != null ? `${Math.round(m.marketOdds * 100)}%` : '-'}
                          </TableCell>
                          <TableCell>
                            {m.poolExists && m.poolId
                              ? <IdCell value={m.poolId} truncate={10} />
                              : <Meta>none</Meta>}
                          </TableCell>
                          <TableCell align="right">
                            {m.poolExists
                              ? (m.poolStatus === 'JOINING' || m.poolStatus === 'ACTIVE') && (
                                  <ActionButton
                                    kind="secondary"
                                    label="Resolve"
                                    icon={<GavelRoundedIcon sx={{ fontSize: 14 }} />}
                                    onClick={() => {
                                      if (m.poolId) setResolveTarget({ poolId: m.poolId, question: m.question });
                                    }}
                                  />
                                )
                              : <ActionButton
                                  kind="primary"
                                  label="Create pool"
                                  icon={<LaunchRoundedIcon sx={{ fontSize: 14 }} />}
                                  onClick={() => setCreateTarget(m)}
                                />}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </SectionCard>
          </>
        )}
      </Box>

      {/* ─── Browse Gamma tags ───────────────────────────────────── */}
      <BrowseGammaTagsModal
        open={browseTagsOpen}
        onClose={() => setBrowseTagsOpen(false)}
      />

      {/* ─── Create pool confirm ─────────────────────────────────── */}
      <ConfirmDialog
        open={!!createTarget}
        onClose={() => setCreateTarget(null)}
        onConfirm={() => {
          if (!createTarget || !selected) return;
          void feedback.run(createPoolMutation, { matchId: createTarget.externalId, category: selected.code }, {
            success: 'Pool created',
          });
        }}
        loading={createPoolMutation.isPending}
        severity="warning"
        title="Create pool from this market?"
        actionLabel="Create pool"
        consequences={createTarget && selected ? (
          <>
            Will create a 2-way pool from the Polymarket market{' '}
            <Box component="strong" sx={{ color: t.text.primary }}>{createTarget.question}</Box>{' '}
            in category <Box component="strong" sx={{ color: t.text.primary }}>{selected.code}</Box>.
            Pool is on-chain and cannot be undone - to remove later, use the Pools tab's Refund flow.
          </>
        ) : ''}
      />

      {/* ─── Resolve manually ────────────────────────────────────── */}
      <AdminDialog
        open={!!resolveTarget}
        onClose={() => setResolveTarget(null)}
        title="Resolve PM market manually"
        maxWidth="sm"
        loading={resolveMutation.isPending}
        footer={
          <>
            <ActionButton kind="tertiary" label="Cancel" onClick={() => setResolveTarget(null)} disabled={resolveMutation.isPending} />
            <ActionButton
              kind="primary"
              label={`Resolve as ${resolveWinner}`}
              loading={resolveMutation.isPending}
              onClick={() => {
                if (!resolveTarget) return;
                void feedback.run(resolveMutation, {
                  poolId: resolveTarget.poolId,
                  winner: resolveWinner,
                  reason: 'admin-pm-uma-stuck',
                }, { success: `Resolved as ${resolveWinner}` });
              }}
            />
          </>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}` }}>
            <Body sx={{ fontWeight: 600, color: t.text.primary, fontSize: '0.85rem' }}>{resolveTarget?.question}</Body>
            <Meta sx={{ display: 'block', mt: 0.25 }}>
              Use this only when UMA has stalled past the grace window or the market was delisted from Gamma.
              The pool will jump to CLAIMABLE so winners can claim; on-chain resolve still needs the
              standard Pools tab flow.
            </Meta>
          </Box>

          <Box>
            <Label sx={{ display: 'block', mb: 0.5 }}>Winner</Label>
            <SegmentedToggle
              fullWidth
              value={resolveWinner}
              onChange={setResolveWinner}
              tokens={t}
              options={[
                { value: 'HOME', label: 'HOME (UP)' },
                { value: 'AWAY', label: 'AWAY (DOWN)' },
              ]}
            />
            <Meta sx={{ display: 'block', mt: 0.5 }}>
              PM pools are 2-way: HOME → UP side, AWAY → DOWN side. Pick the outcome the market actually settled to per Polymarket's UI.
            </Meta>
          </Box>
        </Box>
      </AdminDialog>
    </Box>
  );
}
