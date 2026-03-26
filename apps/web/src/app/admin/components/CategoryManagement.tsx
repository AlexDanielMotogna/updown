'use client';

import { useState } from 'react';
import {
  Box, Card, Typography, Switch, Chip, CircularProgress,
  FormControlLabel, Alert, TextField, Select, MenuItem, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';

interface Category {
  id: string;
  code: string;
  type: string;
  enabled: boolean;
  comingSoon: boolean;
  label: string;
  shortLabel: string | null;
  color: string | null;
  badgeUrl: string | null;
  iconKey: string | null;
  apiSource: string | null;
  adapterKey: string | null;
  numSides: number;
  sideLabels: string[];
  config: Record<string, unknown> | null;
  sortOrder: number;
}

const TYPE_LABELS: Record<string, string> = {
  FOOTBALL_LEAGUE: 'Football Leagues',
  SPORTSDB_SPORT: 'Sports (TheSportsDB)',
  POLYMARKET: 'Prediction Markets',
};

const TYPE_COLORS: Record<string, string> = {
  FOOTBALL_LEAGUE: '#22C55E',
  SPORTSDB_SPORT: '#F97316',
  POLYMARKET: '#A78BFA',
};

function StatusChip({ enabled, comingSoon }: { enabled: boolean; comingSoon: boolean }) {
  if (enabled) return <Chip label="Active" size="small" sx={{ bgcolor: 'rgba(34,197,94,0.15)', color: '#22C55E', fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
  if (comingSoon) return <Chip label="Coming Soon" size="small" sx={{ bgcolor: 'rgba(251,191,36,0.15)', color: '#FBBF24', fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
  return <Chip label="Hidden" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
}

function CategoryCard({ cat, onToggle, onToggleComingSoon, onEdit }: {
  cat: Category;
  onToggle: () => void;
  onToggleComingSoon: () => void;
  onEdit: () => void;
}) {
  return (
    <Card sx={{
      p: 2,
      border: '1px solid',
      borderColor: cat.enabled ? `${TYPE_COLORS[cat.type] || '#fff'}30` : 'rgba(255,255,255,0.06)',
      opacity: cat.enabled ? 1 : 0.7,
      transition: 'all 0.2s',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          {cat.badgeUrl ? (
            <Box component="img" src={cat.badgeUrl} alt="" sx={{
              width: 28, height: 28, objectFit: 'contain', borderRadius: '4px',
              ...(cat.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(255,255,255,0.85)', p: '2px', borderRadius: '50%' }),
            }} />
          ) : (
            <Box sx={{ width: 28, height: 28, borderRadius: '4px', bgcolor: `${cat.color || TYPE_COLORS[cat.type] || '#666'}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: cat.color || TYPE_COLORS[cat.type] || '#666' }} />
            </Box>
          )}
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: '0.9rem' }}>{cat.label}</Typography>
            <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>
              {cat.code} {cat.apiSource ? `(${cat.apiSource})` : ''}
            </Typography>
          </Box>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusChip enabled={cat.enabled} comingSoon={cat.comingSoon} />
          <Switch
            checked={cat.enabled}
            onChange={onToggle}
            size="small"
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: TYPE_COLORS[cat.type] || '#22C55E' }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: TYPE_COLORS[cat.type] || '#22C55E' } }}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)' }}>
          {cat.numSides}-way | {cat.sideLabels.join(' / ')}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                checked={cat.comingSoon}
                onChange={onToggleComingSoon}
                size="small"
                disabled={cat.enabled}
              />
            }
            label={<Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)' }}>Coming Soon</Typography>}
            sx={{ m: 0 }}
          />
          <Button size="small" onClick={onEdit} sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.5)', textTransform: 'none', minWidth: 0 }}>
            Edit
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

function EditDialog({ cat, open, onClose, onSave }: {
  cat: Category | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Category>) => void;
}) {
  const [form, setForm] = useState<Partial<Category>>({});

  const handleOpen = () => {
    if (cat) setForm({ label: cat.label, shortLabel: cat.shortLabel, color: cat.color, badgeUrl: cat.badgeUrl, iconKey: cat.iconKey, sortOrder: cat.sortOrder, numSides: cat.numSides });
  };

  return (
    <Dialog open={open} onClose={onClose} TransitionProps={{ onEnter: handleOpen }} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: '#0D1219', backgroundImage: 'none' } }}>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>Edit {cat?.code}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        <TextField label="Label" size="small" value={form.label || ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
        <TextField label="Short Label" size="small" value={form.shortLabel || ''} onChange={e => setForm(f => ({ ...f, shortLabel: e.target.value }))} />
        <TextField label="Color (hex)" size="small" value={form.color || ''} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          InputProps={{ startAdornment: form.color ? <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: form.color, mr: 1, flexShrink: 0 }} /> : null }}
        />
        <TextField label="Badge URL" size="small" value={form.badgeUrl || ''} onChange={e => setForm(f => ({ ...f, badgeUrl: e.target.value }))} />
        <TextField label="Icon Key (MUI)" size="small" value={form.iconKey || ''} onChange={e => setForm(f => ({ ...f, iconKey: e.target.value }))} placeholder="e.g. SportsBasketball, Gavel" />
        <TextField label="Sort Order" size="small" type="number" value={form.sortOrder ?? 0} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
        <FormControl size="small">
          <InputLabel>Sides</InputLabel>
          <Select value={form.numSides ?? 3} label="Sides" onChange={e => setForm(f => ({ ...f, numSides: Number(e.target.value) }))}>
            <MenuItem value={2}>2-way (Home/Away or Yes/No)</MenuItem>
            <MenuItem value={3}>3-way (Home/Draw/Away)</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancel</Button>
        <Button onClick={() => onSave(form)} variant="contained" sx={{ bgcolor: '#22C55E', color: '#000', textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: '#16A34A' } }}>Save</Button>
      </DialogActions>
    </Dialog>
  );
}

export function CategoryManagement() {
  const qc = useQueryClient();
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => adminFetch<{ success: boolean; data: Category[] }>('/categories'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}/toggle`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setResult({ type: 'success', message: 'Category toggled' }); },
    onError: (e: Error) => setResult({ type: 'error', message: e.message }),
  });

  const comingSoonMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}/coming-soon`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); },
    onError: (e: Error) => setResult({ type: 'error', message: e.message }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Category> }) =>
      adminFetch(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setEditCat(null); setResult({ type: 'success', message: 'Category updated' }); },
    onError: (e: Error) => setResult({ type: 'error', message: e.message }),
  });

  const categories = data?.data || [];
  const grouped = categories.reduce<Record<string, Category[]>>((acc, cat) => {
    (acc[cat.type] = acc[cat.type] || []).push(cat);
    return acc;
  }, {});

  if (isLoading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress size={28} /></Box>;
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {result && (
        <Alert severity={result.type} onClose={() => setResult(null)} sx={{ mb: 1 }}>
          {result.message}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <Typography sx={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.4)' }}>
          {categories.length} categories | {categories.filter(c => c.enabled).length} active | {categories.filter(c => c.comingSoon).length} coming soon
        </Typography>
      </Box>

      {Object.entries(TYPE_LABELS).map(([type, label]) => {
        const cats = grouped[type] || [];
        if (cats.length === 0) return null;
        const activeCount = cats.filter(c => c.enabled).length;

        return (
          <Box key={type}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
              <Box sx={{ width: 4, height: 20, borderRadius: 2, bgcolor: TYPE_COLORS[type] }} />
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
                  onToggle={() => toggleMutation.mutate(cat.id)}
                  onToggleComingSoon={() => comingSoonMutation.mutate(cat.id)}
                  onEdit={() => setEditCat(cat)}
                />
              ))}
            </Box>
          </Box>
        );
      })}

      <EditDialog
        cat={editCat}
        open={!!editCat}
        onClose={() => setEditCat(null)}
        onSave={(data) => editCat && updateMutation.mutate({ id: editCat.id, data })}
      />
    </Box>
  );
}
