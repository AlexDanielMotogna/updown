'use client';

import { useState, useEffect } from 'react';
import {
  Box, Card, Typography, Switch, Chip, CircularProgress,
  FormControlLabel, Alert, TextField, Select, MenuItem, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel,
  Checkbox,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as dt, palette, withAlpha } from '@/lib/theme';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

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
  FOOTBALL_LEAGUE: dt.adminTypeColors.footballLeague,
  SPORTSDB_SPORT: dt.adminTypeColors.sportsdbSport,
  POLYMARKET: dt.adminTypeColors.polymarket,
};

function StatusChip({ enabled, comingSoon }: { enabled: boolean; comingSoon: boolean }) {
  if (enabled) return <Chip label="Active" size="small" sx={{ bgcolor: withAlpha(dt.gain, 0.15), color: dt.gain, fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
  if (comingSoon) return <Chip label="Coming Soon" size="small" sx={{ bgcolor: withAlpha(dt.draw, 0.15), color: dt.draw, fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
  return <Chip label="Hidden" size="small" sx={{ bgcolor: dt.hover.medium, color: dt.text.dimmed, fontWeight: 700, fontSize: '0.65rem', height: 22 }} />;
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
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: TYPE_COLORS[cat.type] || dt.gain }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: TYPE_COLORS[cat.type] || dt.gain } }}
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

function PolymarketConfigFields({ selectedTags, onTagsChange, minVolume, onMinVolumeChange, maxDays, onMaxDaysChange }: {
  selectedTags: string[];
  onTagsChange: (tags: string[]) => void;
  minVolume: string;
  onMinVolumeChange: (v: string) => void;
  maxDays: string;
  onMaxDaysChange: (v: string) => void;
}) {
  const [availableTags, setAvailableTags] = useState<Array<{ label: string; count: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [tagFilter, setTagFilter] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    const seeds = selectedTags.length > 0 ? `?seeds=${encodeURIComponent(selectedTags.join(','))}` : '';
    fetch(`${API}/api/config/polymarket-tags${seeds}`)
      .then(r => r.json())
      .then((d: { success: boolean; data: Array<{ label: string; count: number }> }) => {
        if (!active) return;
        if (d.success) setAvailableTags(d.data);
      })
      .catch(() => {})
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedTags.join(',')]);

  const filtered = tagFilter ? availableTags.filter(t => t.label.toLowerCase().includes(tagFilter.toLowerCase())) : availableTags.slice(0, 50);

  return (
    <>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', mt: 1 }}>
        Polymarket Tags
      </Typography>
      <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', mb: 0.5 }}>
        {selectedTags.length} selected: {selectedTags.join(', ') || 'none'}
      </Typography>
      <TextField label="Search tags" size="small" value={tagFilter} onChange={e => setTagFilter(e.target.value)} placeholder="Filter tags..." />
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1 }}><CircularProgress size={20} /></Box>
      ) : (
        <Box sx={{ maxHeight: 200, overflow: 'auto', bgcolor: 'rgba(255,255,255,0.02)', borderRadius: '4px', '&::-webkit-scrollbar': { width: 2 }, '&::-webkit-scrollbar-track': { bgcolor: 'transparent' }, '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(255,255,255,0.06)' } }}>
          {filtered.map(t => {
            const selected = selectedTags.includes(t.label);
            return (
              <Box key={t.label} onClick={() => onTagsChange(selected ? selectedTags.filter(s => s !== t.label) : [...selectedTags, t.label])}
                sx={{ display: 'flex', alignItems: 'center', px: 1, py: 0.25, cursor: 'pointer', '&:hover': { bgcolor: 'rgba(255,255,255,0.04)' } }}
              >
                <Checkbox checked={selected} size="small" sx={{ p: 0.5, color: 'rgba(255,255,255,0.2)', '&.Mui-checked': { color: dt.gain } }} />
                <Typography sx={{ fontSize: '0.75rem', fontWeight: selected ? 600 : 400, color: selected ? '#fff' : 'rgba(255,255,255,0.6)', flex: 1 }}>
                  {t.label}
                </Typography>
                <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>
                  {t.count}
                </Typography>
              </Box>
            );
          })}
        </Box>
      )}
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField label="Min Volume 24h ($)" size="small" type="number" value={minVolume} onChange={e => onMinVolumeChange(e.target.value)} sx={{ flex: 1 }} />
        <TextField label="Max Days Ahead" size="small" type="number" value={maxDays} onChange={e => onMaxDaysChange(e.target.value)} sx={{ flex: 1 }} />
      </Box>
    </>
  );
}

function SportsDbConfigFields({ sportQuery, onSportQueryChange, leagueFilter, onLeagueFilterChange }: {
  sportQuery: string;
  onSportQueryChange: (v: string) => void;
  leagueFilter: string;
  onLeagueFilterChange: (v: string) => void;
}) {
  const [sports, setSports] = useState<string[]>([]);
  const [leagues, setLeagues] = useState<Array<{ id: string; name: string }>>([]);
  const [loadingLeagues, setLoadingLeagues] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/config/sportsdb-sports`)
      .then(r => r.json())
      .then(d => { if (d.success) setSports(d.data); })
      .catch(() => {
        setSports(['Soccer', 'Basketball', 'Ice Hockey', 'American Football', 'Fighting', 'Baseball', 'Motorsport', 'Tennis', 'Rugby', 'Cricket', 'Golf', 'ESports']);
      });
  }, []);

  useEffect(() => {
    if (!sportQuery) return;
    setLoadingLeagues(true);
    fetch(`${API}/api/config/sportsdb-leagues?sport=${encodeURIComponent(sportQuery)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setLeagues(d.data); })
      .catch(() => setLeagues([]))
      .finally(() => setLoadingLeagues(false));
  }, [sportQuery]);

  return (
    <>
      <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', mt: 1 }}>
        TheSportsDB Config
      </Typography>
      <FormControl size="small">
        <InputLabel>Sport</InputLabel>
        <Select value={sportQuery} onChange={e => { onSportQueryChange(e.target.value); onLeagueFilterChange(''); }} label="Sport">
          {sports.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
        </Select>
      </FormControl>
      {loadingLeagues ? (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={16} /><Typography sx={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>Loading leagues...</Typography></Box>
      ) : leagues.length > 0 ? (
        <FormControl size="small">
          <InputLabel>League</InputLabel>
          <Select value={leagueFilter} onChange={e => onLeagueFilterChange(e.target.value)} label="League">
            {leagues.map(l => <MenuItem key={l.id} value={l.name}>{l.name}</MenuItem>)}
          </Select>
        </FormControl>
      ) : sportQuery ? (
        <TextField label="League Filter" size="small" value={leagueFilter} onChange={e => onLeagueFilterChange(e.target.value)}
          placeholder="e.g. NBA, NHL, UFC" helperText="Type the exact league name"
        />
      ) : null}
    </>
  );
}

function EditDialog({ cat, open, onClose, onSave }: {
  cat: Category | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Category>) => void;
}) {
  const [form, setForm] = useState<Partial<Category>>({});
  const [configTags, setConfigTags] = useState('');
  const [configMinVolume, setConfigMinVolume] = useState('');
  const [configMaxDays, setConfigMaxDays] = useState('');
  const [configSportQuery, setConfigSportQuery] = useState('');
  const [configLeagueFilter, setConfigLeagueFilter] = useState('');
  const [configLeagueId, setConfigLeagueId] = useState('');

  const handleOpen = () => {
    if (!cat) return;
    setForm({ label: cat.label, shortLabel: cat.shortLabel, color: cat.color, badgeUrl: cat.badgeUrl, iconKey: cat.iconKey, sortOrder: cat.sortOrder, numSides: cat.numSides });
    const cfg = cat.config as Record<string, unknown> | null;
    setConfigTags(Array.isArray(cfg?.tags) ? (cfg.tags as string[]).join(', ') : '');
    setConfigMinVolume(cfg?.minVolume24h != null ? String(cfg.minVolume24h) : '');
    setConfigMaxDays(cfg?.maxDaysAhead != null ? String(cfg.maxDaysAhead) : '');
    setConfigSportQuery(typeof cfg?.sportQuery === 'string' ? cfg.sportQuery : '');
    setConfigLeagueFilter(typeof cfg?.leagueFilter === 'string' ? cfg.leagueFilter : '');
    setConfigLeagueId(typeof cfg?.theSportsDbLeagueId === 'string' ? cfg.theSportsDbLeagueId : '');
  };

  const handleSave = () => {
    const config: Record<string, unknown> = {};
    if (cat?.type === 'POLYMARKET') {
      if (configTags) config.tags = configTags.split(',').map(t => t.trim()).filter(Boolean);
      if (configMinVolume) config.minVolume24h = Number(configMinVolume);
      if (configMaxDays) config.maxDaysAhead = Number(configMaxDays);
    } else if (cat?.type === 'SPORTSDB_SPORT') {
      if (configSportQuery) config.sportQuery = configSportQuery;
      if (configLeagueFilter) config.leagueFilter = configLeagueFilter;
    } else if (cat?.type === 'FOOTBALL_LEAGUE') {
      if (configLeagueId) config.theSportsDbLeagueId = configLeagueId;
    }
    onSave({ ...form, config: Object.keys(config).length > 0 ? config : undefined });
  };

  return (
    <Dialog open={open} onClose={onClose} TransitionProps={{ onEnter: handleOpen }} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: dt.bg.surfaceAlt, border: dt.surfaceBorder, boxShadow: dt.surfaceShadow, backgroundImage: 'none' } }}>
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

        {/* API Config — Polymarket */}
        {cat?.type === 'POLYMARKET' && (
          <PolymarketConfigFields
            selectedTags={configTags ? configTags.split(',').map(t => t.trim()).filter(Boolean) : []}
            onTagsChange={(tags) => setConfigTags(tags.join(', '))}
            minVolume={configMinVolume}
            onMinVolumeChange={setConfigMinVolume}
            maxDays={configMaxDays}
            onMaxDaysChange={setConfigMaxDays}
          />
        )}

        {/* API Config — TheSportsDB */}
        {cat?.type === 'SPORTSDB_SPORT' && (
          <SportsDbConfigFields
            sportQuery={configSportQuery}
            onSportQueryChange={setConfigSportQuery}
            leagueFilter={configLeagueFilter}
            onLeagueFilterChange={setConfigLeagueFilter}
          />
        )}

        {/* Football league config — TheSportsDB league ID */}
        {cat?.type === 'FOOTBALL_LEAGUE' && (
          <>
            <TextField
              label="TheSportsDB League ID"
              size="small"
              value={configLeagueId}
              onChange={e => setConfigLeagueId(e.target.value)}
              placeholder="e.g. 4480 (Champions League)"
              helperText="Numeric ID from TheSportsDB. Required for fixture sync."
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancel</Button>
        <Button onClick={handleSave} variant="contained" sx={{ bgcolor: dt.gain, color: dt.text.contrast, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: palette.green600 } }}>Save</Button>
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
