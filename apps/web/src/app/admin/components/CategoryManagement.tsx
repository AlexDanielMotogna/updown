'use client';

import { useState } from 'react';
import { Box, Typography } from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as dt } from '@/lib/theme';
import {
  ConfirmDialog, ActionButton,
  LoadingState,
  useMutationFeedback,
} from '../ui';
import { type Category, TYPE_LABELS, TYPE_COLORS } from './category-management-config';
import { CategoryCard } from './CategoryCard';
import { EditDialog } from './CategoryEditDialog';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export function CategoryManagement() {
  const qc = useQueryClient();
  const feedback = useMutationFeedback();
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  // ConfirmDialog target for delete. Carries the pool count so the
  // dialog can spell out the consequence ("3 live pool(s) currently
  // reference this category").
  const [deleteTarget, setDeleteTarget] = useState<{ cat: Category; poolCount: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminFetch<{ success: boolean; data: Category[] }>('/categories'),
  });

  // Live pool count per category code, so the list shows which categories have pools.
  const { data: poolCountsData } = useQuery({
    queryKey: ['admin-pool-counts'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/config/pool-counts`);
      const d = await r.json();
      return (d.data || {}) as Record<string, number>;
    },
  });
  const poolCounts = poolCountsData || {};

  // All mutations now invalidate cache on success and let
  // useMutationFeedback route the toast + friendly error mapping.
  const toggleMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });

  const comingSoonMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}/coming-soon`, { method: 'PATCH' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-categories'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      adminFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setEditCat(null); },
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<Category>) =>
      adminFetch('/categories', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setCreating(false); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setDeleteTarget(null); },
    onError: () => setDeleteTarget(null),
  });

  // Re-sync sources with the latest config and create pools now (background job).
  const syncMutation = useMutation({
    mutationFn: () => adminFetch<{ success: boolean; message?: string }>('/actions/sync-pools', {
      method: 'POST', body: JSON.stringify({ scope: 'all' }), headers: { 'Content-Type': 'application/json' },
    }),
  });

  const categories = data?.data || [];
  const grouped = categories.reduce<Record<string, Category[]>>((acc, cat) => {
    (acc[cat.type] = acc[cat.type] || []).push(cat);
    return acc;
  }, {});
  // Available parents = enabled SPORT_GROUP rows, sorted by sortOrder.
  // Disabled groups still appear so the operator can re-parent a child
  // there if they're staging a future enable.
  const parents = categories.filter(c => c.type === 'SPORT_GROUP').sort((a, b) => a.sortOrder - b.sortOrder);

  if (isLoading) return <LoadingState variant="block" />;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', color: dt.text.tertiary }}>
          {categories.length} categories · {categories.filter(c => c.enabled).length} active · {categories.filter(c => c.comingSoon).length} coming soon
        </Typography>
        <Box sx={{ flex: 1 }} />
        <ActionButton
          kind="primary"
          label="+ New category"
          onClick={() => { setEditCat(null); setCreating(true); }}
        />
        <ActionButton
          kind="secondary"
          label="Sync pools now"
          loading={syncMutation.isPending}
          onClick={() => feedback.run(syncMutation, undefined, { success: (r) => r?.message || 'Sync started' })}
        />
      </Box>

      {Object.entries(TYPE_LABELS).map(([type, label]) => {
        const cats = grouped[type] || [];
        if (cats.length === 0) return null;
        const activeCount = cats.filter(c => c.enabled).length;

        return (
          <Box key={type}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ width: 4, height: 20, borderRadius: 1, bgcolor: TYPE_COLORS[type] }} />
              <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{label}</Typography>
              <Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.3)' }}>
                {activeCount}/{cats.length} active
              </Typography>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
              {cats.map(cat => (
                <CategoryCard
                  key={cat.id}
                  cat={cat}
                  poolCount={poolCounts[cat.code] ?? 0}
                  onToggle={() => feedback.run(toggleMutation, cat.id, { success: `${cat.label} ${cat.enabled ? 'disabled' : 'enabled'}` })}
                  onToggleComingSoon={() => feedback.run(comingSoonMutation, cat.id, { success: 'Coming-soon flag updated' })}
                  onEdit={() => { setCreating(false); setEditCat(cat); }}
                  // Replaces window.confirm - now uses ConfirmDialog with
                  // severity=destructive and the live pool count in the
                  // consequence copy (Plan §3.2).
                  onDelete={() => setDeleteTarget({ cat, poolCount: poolCounts[cat.code] ?? 0 })}
                />
              ))}
            </Box>
          </Box>
        );
      })}

      <EditDialog
        cat={editCat}
        isNew={creating}
        open={creating || !!editCat}
        parents={parents}
        onClose={() => { setCreating(false); setEditCat(null); }}
        onSave={(data) => {
          if (creating) {
            void feedback.run(createMutation, data, { success: 'Category created' });
          } else if (editCat) {
            void feedback.run(updateMutation, { id: editCat.id, data }, { success: 'Category updated' });
          }
        }}
      />

      {/* Delete confirmation - destructive, with the live pool count
          spelled out. The backend (PR 3) ALSO refuses to delete a
          category with live pools, but surfacing the count up-front
          avoids the round-trip. */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && feedback.run(deleteMutation, deleteTarget.cat.id, { success: `Deleted ${deleteTarget.cat.label}` })}
        loading={deleteMutation.isPending}
        severity="destructive"
        title="Delete category?"
        actionLabel="Delete"
        consequences={deleteTarget ? (
          <>
            <Box component="strong" sx={{ color: dt.text.primary }}>{deleteTarget.cat.label}</Box>
            {' ('}<Box component="code" sx={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{deleteTarget.cat.code}</Box>{') will be removed from the category list. '}
            {deleteTarget.poolCount > 0
              ? <>The backend will <Box component="strong" sx={{ color: dt.error }}>refuse</Box> the delete because {deleteTarget.poolCount} live pool(s) still reference this category. Disable it instead, or wait for those pools to fully close.</>
              : <>No live pools reference this category, so the delete will succeed. Existing on-chain pool history is not affected.</>}
          </>
        ) : ''}
      />
    </Box>
  );
}
