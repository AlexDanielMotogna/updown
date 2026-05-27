'use client';

import { useState, useEffect, type ReactNode } from 'react';
import {
  Box, Card, Typography, Switch, Chip, CircularProgress,
  FormControlLabel, Alert, TextField, Select, MenuItem, Button,
  Dialog, DialogTitle, DialogContent, DialogActions, FormControl, InputLabel,
  Checkbox,
} from '@mui/material';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminFetch } from '../lib/adminApi';
import { darkTokens as dt, palette, withAlpha } from '@/lib/theme';
import { ICON_REGISTRY } from '@/lib/icon-registry';

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

function CategoryCard({ cat, onToggle, onToggleComingSoon, onEdit, onDelete }: {
  cat: Category;
  onToggle: () => void;
  onToggleComingSoon: () => void;
  onEdit: () => void;
  onDelete: () => void;
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
          <Button size="small" onClick={onDelete} sx={{ fontSize: '0.65rem', color: withAlpha(dt.down, 0.7), textTransform: 'none', minWidth: 0, '&:hover': { color: dt.down } }}>
            Delete
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

interface PmConfig {
  tags: string[];        // labels — kept in sync with tagIds (one PM tag = one pair)
  tagIds: string[];      // Gamma tag ids (for per-tag fetch)
  minVolume24h: string;
  maxDaysAhead: string;
  matchPriority: string;
  maxMarkets: string;
  maxSubmarketsPerEvent: string;
  subcategories: string[];
}

const SectionLabel = ({ children }: { children: ReactNode }) => (
  <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', mt: 1.5 }}>{children}</Typography>
);
const Helper = ({ children }: { children: ReactNode }) => (
  <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.3)', mb: 0.5 }}>{children}</Typography>
);

function PolymarketConfigFields({ pm, onChange }: { pm: PmConfig; onChange: (pm: PmConfig) => void }) {
  const [tagName, setTagName] = useState('');
  const [resolving, setResolving] = useState(false);
  const [tagError, setTagError] = useState('');
  const [related, setRelated] = useState<Array<{ id: string; label: string; rank: number }>>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);

  const set = (patch: Partial<PmConfig>) => onChange({ ...pm, ...patch });
  const tagIdsKey = pm.tagIds.join(',');

  // Load Polymarket's REAL sub-tags for this category's tag(s) — the only source
  // for sidebar filters (no free text => no dead filters).
  useEffect(() => {
    if (pm.tagIds.length === 0) { setRelated([]); return; }
    setLoadingRelated(true);
    fetch(`${API}/api/config/pm-related-tags?tagIds=${tagIdsKey}`)
      .then(r => r.json())
      .then(d => setRelated(d.success ? d.data : []))
      .catch(() => setRelated([]))
      .finally(() => setLoadingRelated(false));
  }, [tagIdsKey]);

  const addTag = async () => {
    const name = tagName.trim();
    if (!name) return;
    setResolving(true); setTagError('');
    try {
      const r = await fetch(`${API}/api/config/pm-tag?name=${encodeURIComponent(name)}`);
      const d = await r.json();
      if (d.success && d.data) {
        if (!pm.tagIds.includes(d.data.id)) set({ tags: [...pm.tags, d.data.label], tagIds: [...pm.tagIds, d.data.id] });
        setTagName('');
      } else {
        setTagError(`Polymarket has no tag "${name}"`);
      }
    } catch { setTagError('Lookup failed'); }
    finally { setResolving(false); }
  };
  const removeTag = (i: number) => set({ tags: pm.tags.filter((_, j) => j !== i), tagIds: pm.tagIds.filter((_, j) => j !== i) });
  const selectedSubs = new Set(pm.subcategories);

  return (
    <>
      {/* Polymarket tags — what this category imports (resolved against PM, never free text) */}
      <SectionLabel>Polymarket Tags</SectionLabel>
      <Helper>Top-level Polymarket tags this category imports. Type a name; it's resolved against Polymarket&apos;s tag list.</Helper>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
        {pm.tags.map((tag, i) => (
          <Chip key={pm.tagIds[i] || tag} label={`${tag} #${pm.tagIds[i] ?? '?'}`} size="small" onDelete={() => removeTag(i)}
            sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: withAlpha(dt.gain, 0.15), color: dt.gain, '& .MuiChip-deleteIcon': { color: withAlpha(dt.gain, 0.5), '&:hover': { color: dt.gain } } }}
          />
        ))}
      </Box>
      <Box sx={{ display: 'flex', gap: 1 }}>
        <TextField label="Add Polymarket tag" size="small" value={tagName} error={!!tagError} helperText={tagError || undefined}
          onChange={e => { setTagName(e.target.value); setTagError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
          placeholder="e.g. Geopolitics" sx={{ flex: 1 }}
        />
        <Button size="small" variant="outlined" disabled={!tagName.trim() || resolving} onClick={addTag}
          startIcon={resolving ? <CircularProgress size={12} sx={{ color: 'inherit' }} /> : undefined}
          sx={{ textTransform: 'none', borderColor: dt.border.strong, color: dt.text.secondary, minWidth: 60, alignSelf: 'flex-start' }}
        >Add</Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
        <TextField label="Min Volume 24h ($)" size="small" type="number" value={pm.minVolume24h} onChange={e => set({ minVolume24h: e.target.value })} sx={{ flex: 1 }} />
        <TextField label="Max Days Ahead" size="small" type="number" value={pm.maxDaysAhead} onChange={e => set({ maxDaysAhead: e.target.value })} sx={{ flex: 1 }} />
      </Box>
      <Box sx={{ display: 'flex', gap: 2 }}>
        <TextField label="Max Pools" size="small" type="number" value={pm.maxMarkets} onChange={e => set({ maxMarkets: e.target.value })} sx={{ flex: 1 }} helperText="Cap of pools per category" />
        <TextField label="Sub-markets / event" size="small" type="number" value={pm.maxSubmarketsPerEvent} onChange={e => set({ maxSubmarketsPerEvent: e.target.value })} sx={{ flex: 1 }} helperText="1 = no price ladders" />
      </Box>
      <TextField label="Match Priority (advanced)" size="small" type="number" value={pm.matchPriority} onChange={e => set({ matchPriority: e.target.value })}
        helperText="Lower = matched first. Set high (e.g. 99) for the generic catch-all category." />

      {/* Sidebar Filters — only from Polymarket's real related-tags for this category */}
      <SectionLabel>Sidebar Filters</SectionLabel>
      <Helper>Polymarket&apos;s sub-tags for this category. Click to add/remove — you can only use what Polymarket offers.</Helper>
      {pm.tagIds.length === 0 ? (
        <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>Add a Polymarket tag above first — sub-tags come from it.</Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 0.5 }}>
            {pm.subcategories.map(sub => (
              <Chip key={sub} label={sub} size="small" onDelete={() => set({ subcategories: pm.subcategories.filter(s => s !== sub) })}
                sx={{ fontSize: '0.7rem', fontWeight: 600, bgcolor: withAlpha(dt.accent, 0.15), color: dt.accent, '& .MuiChip-deleteIcon': { color: withAlpha(dt.accent, 0.5), '&:hover': { color: dt.accent } } }}
              />
            ))}
            {pm.subcategories.length === 0 && <Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.25)', fontStyle: 'italic' }}>No filters yet — pick from Polymarket&apos;s sub-tags below.</Typography>}
          </Box>
          {loadingRelated ? (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><CircularProgress size={14} /><Typography sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Loading Polymarket sub-tags…</Typography></Box>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {related.filter(t => !selectedSubs.has(t.label)).map(t => (
                <Chip key={t.id} label={t.label} size="small" onClick={() => set({ subcategories: [...pm.subcategories, t.label] })}
                  sx={{ fontSize: '0.6rem', cursor: 'pointer', bgcolor: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.5)', '&:hover': { bgcolor: 'rgba(255,255,255,0.08)' } }}
                />
              ))}
              {related.length === 0 && <Typography sx={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.25)' }}>Polymarket returned no sub-tags for these tag(s).</Typography>}
            </Box>
          )}
        </>
      )}
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

const EMPTY_PM: PmConfig = { tags: [], tagIds: [], minVolume24h: '', maxDaysAhead: '', matchPriority: '', maxMarkets: '', maxSubmarketsPerEvent: '', subcategories: [] };

function EditDialog({ cat, isNew, open, onClose, onSave }: {
  cat: Category | null;
  isNew: boolean;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<Category>) => void;
}) {
  const [form, setForm] = useState<Partial<Category>>({});
  const [pm, setPm] = useState<PmConfig>(EMPTY_PM);
  const [configSportQuery, setConfigSportQuery] = useState('');
  const [configLeagueFilter, setConfigLeagueFilter] = useState('');
  const [configLeagueId, setConfigLeagueId] = useState('');

  const str = (v: unknown) => (v != null ? String(v) : '');

  const handleOpen = () => {
    setConfigSportQuery(''); setConfigLeagueFilter(''); setConfigLeagueId(''); setPm(EMPTY_PM);
    if (isNew) {
      setForm({ code: '', type: 'POLYMARKET', label: '', shortLabel: '', color: '#A78BFA', badgeUrl: '', iconKey: 'Public', sortOrder: 50, numSides: 2, enabled: true, comingSoon: false, apiSource: 'predictions', adapterKey: 'POLYMARKET', sideLabels: ['Yes', 'No'] });
      // Sensible PM defaults so the admin isn't guessing blank numbers.
      setPm({ ...EMPTY_PM, minVolume24h: '5000', maxDaysAhead: '90', maxMarkets: '50', maxSubmarketsPerEvent: '1' });
      return;
    }
    if (!cat) return;
    setForm({ code: cat.code, type: cat.type, label: cat.label, shortLabel: cat.shortLabel, color: cat.color, badgeUrl: cat.badgeUrl, iconKey: cat.iconKey, sortOrder: cat.sortOrder, numSides: cat.numSides, enabled: cat.enabled, comingSoon: cat.comingSoon, apiSource: cat.apiSource, adapterKey: cat.adapterKey, sideLabels: cat.sideLabels });
    const cfg = (cat.config || {}) as Record<string, unknown>;
    setPm({
      tags: Array.isArray(cfg.tags) ? cfg.tags as string[] : [],
      tagIds: Array.isArray(cfg.tagIds) ? (cfg.tagIds as unknown[]).map(String) : [],
      minVolume24h: str(cfg.minVolume24h),
      maxDaysAhead: str(cfg.maxDaysAhead),
      matchPriority: str(cfg.matchPriority),
      maxMarkets: str(cfg.maxMarkets),
      maxSubmarketsPerEvent: str(cfg.maxSubmarketsPerEvent),
      subcategories: Array.isArray(cfg.subcategories) ? cfg.subcategories as string[] : [],
    });
    setConfigSportQuery(typeof cfg.sportQuery === 'string' ? cfg.sportQuery : '');
    setConfigLeagueFilter(typeof cfg.leagueFilter === 'string' ? cfg.leagueFilter : '');
    setConfigLeagueId(typeof cfg.theSportsDbLeagueId === 'string' ? cfg.theSportsDbLeagueId : '');
  };

  const type = form.type;

  const handleSave = () => {
    // Build the FULL config so nothing is dropped (tagIds, matchPriority, caps...).
    const config: Record<string, unknown> = {};
    if (type === 'POLYMARKET') {
      if (pm.tags.length) config.tags = pm.tags;
      if (pm.tagIds.length) config.tagIds = pm.tagIds;
      if (pm.minVolume24h) config.minVolume24h = Number(pm.minVolume24h);
      if (pm.maxDaysAhead) config.maxDaysAhead = Number(pm.maxDaysAhead);
      if (pm.matchPriority) config.matchPriority = Number(pm.matchPriority);
      if (pm.maxMarkets) config.maxMarkets = Number(pm.maxMarkets);
      if (pm.maxSubmarketsPerEvent) config.maxSubmarketsPerEvent = Number(pm.maxSubmarketsPerEvent);
      if (pm.subcategories.length) config.subcategories = pm.subcategories;
    } else if (type === 'SPORTSDB_SPORT') {
      if (configSportQuery) config.sportQuery = configSportQuery;
      if (configLeagueFilter) config.leagueFilter = configLeagueFilter;
    } else if (type === 'FOOTBALL_LEAGUE') {
      if (configLeagueId) config.theSportsDbLeagueId = configLeagueId;
    }
    onSave({ ...form, config: Object.keys(config).length > 0 ? config : undefined });
  };

  const canSave = isNew ? !!(form.code && form.type && form.label) : true;

  return (
    <Dialog open={open} onClose={onClose} TransitionProps={{ onEnter: handleOpen }} maxWidth="sm" fullWidth PaperProps={{ sx: { bgcolor: dt.bg.surfaceAlt, border: dt.surfaceBorder, boxShadow: dt.surfaceShadow, backgroundImage: 'none' } }}>
      <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700 }}>{isNew ? 'New Category' : `Edit ${cat?.code}`}</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
        {isNew && (
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="Code" size="small" value={form.code || ''} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase().replace(/\s+/g, '_') }))}
              placeholder="PM_SCIENCE" sx={{ flex: 1 }} helperText="Unique & permanent" />
            <FormControl size="small" sx={{ flex: 1 }}>
              <InputLabel>Type</InputLabel>
              <Select value={form.type || 'POLYMARKET'} label="Type"
                onChange={e => setForm(f => ({ ...f, type: e.target.value, ...(e.target.value === 'POLYMARKET' ? { apiSource: 'predictions', adapterKey: 'POLYMARKET', numSides: 2, sideLabels: ['Yes', 'No'] } : { apiSource: 'sports' }) }))}>
                <MenuItem value="POLYMARKET">Prediction (Polymarket)</MenuItem>
                <MenuItem value="SPORTSDB_SPORT">Sport (TheSportsDB)</MenuItem>
                <MenuItem value="FOOTBALL_LEAGUE">Football League</MenuItem>
              </Select>
            </FormControl>
          </Box>
        )}
        <TextField label="Label" size="small" value={form.label || ''} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
        <TextField label="Short Label" size="small" value={form.shortLabel || ''} onChange={e => setForm(f => ({ ...f, shortLabel: e.target.value }))} />
        <TextField label="Color (hex)" size="small" value={form.color || ''} onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
          InputProps={{ startAdornment: form.color ? <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: form.color, mr: 1, flexShrink: 0 }} /> : null }}
        />
        <TextField label="Badge URL" size="small" value={form.badgeUrl || ''} onChange={e => setForm(f => ({ ...f, badgeUrl: e.target.value }))} />
        <FormControl size="small">
          <InputLabel>Icon</InputLabel>
          <Select label="Icon" value={form.iconKey && ICON_REGISTRY[form.iconKey] ? form.iconKey : ''}
            onChange={e => setForm(f => ({ ...f, iconKey: e.target.value }))}
            renderValue={(v) => { const Ic = ICON_REGISTRY[v as string]; return <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>{Ic ? <Ic sx={{ fontSize: 18 }} /> : null}{String(v || '')}</Box>; }}>
            {Object.entries(ICON_REGISTRY).map(([key, Ic]) => (
              <MenuItem key={key} value={key}><Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}><Ic sx={{ fontSize: 18 }} /> {key}</Box></MenuItem>
            ))}
          </Select>
        </FormControl>
        <TextField label="Sort Order" size="small" type="number" value={form.sortOrder ?? 0} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} helperText="Position in the tab bar — lower shows first" />
        <FormControl size="small">
          <InputLabel>Sides</InputLabel>
          <Select value={form.numSides ?? 2} label="Sides" onChange={e => setForm(f => ({ ...f, numSides: Number(e.target.value) }))}>
            <MenuItem value={2}>2-way (Home/Away or Yes/No)</MenuItem>
            <MenuItem value={3}>3-way (Home/Draw/Away)</MenuItem>
          </Select>
        </FormControl>

        {type === 'POLYMARKET' && <PolymarketConfigFields pm={pm} onChange={setPm} />}

        {type === 'SPORTSDB_SPORT' && (
          <SportsDbConfigFields
            sportQuery={configSportQuery}
            onSportQueryChange={setConfigSportQuery}
            leagueFilter={configLeagueFilter}
            onLeagueFilterChange={setConfigLeagueFilter}
          />
        )}

        {type === 'FOOTBALL_LEAGUE' && (
          <TextField label="TheSportsDB League ID" size="small" value={configLeagueId} onChange={e => setConfigLeagueId(e.target.value)}
            placeholder="e.g. 4480 (Champions League)" helperText="Numeric ID from TheSportsDB. Required for fixture sync." />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{ color: 'rgba(255,255,255,0.5)', textTransform: 'none' }}>Cancel</Button>
        <Button onClick={handleSave} disabled={!canSave} variant="contained" sx={{ bgcolor: dt.gain, color: dt.text.contrast, textTransform: 'none', fontWeight: 700, '&:hover': { bgcolor: palette.green600 }, '&.Mui-disabled': { bgcolor: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.3)' } }}>{isNew ? 'Create' : 'Save'}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function CategoryManagement() {
  const qc = useQueryClient();
  const [editCat, setEditCat] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
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

  const createMutation = useMutation({
    mutationFn: (data: Partial<Category>) =>
      adminFetch('/categories', { method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json' } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setCreating(false); setResult({ type: 'success', message: 'Category created' }); },
    onError: (e: Error) => setResult({ type: 'error', message: e.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminFetch(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-categories'] }); setResult({ type: 'success', message: 'Category deleted' }); },
    onError: (e: Error) => setResult({ type: 'error', message: e.message }),
  });

  // Re-sync sources with the latest config and create pools now (background job).
  const syncMutation = useMutation({
    mutationFn: () => adminFetch<{ success: boolean; message?: string }>('/actions/sync-pools', {
      method: 'POST', body: JSON.stringify({ scope: 'all' }), headers: { 'Content-Type': 'application/json' },
    }),
    onSuccess: (r) => setResult({ type: 'success', message: r?.message || 'Sync started' }),
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
        <Box sx={{ flex: 1 }} />
        <Button
          variant="contained"
          size="small"
          onClick={() => { setEditCat(null); setCreating(true); }}
          sx={{ textTransform: 'none', bgcolor: dt.gain, color: dt.text.contrast, fontWeight: 700, whiteSpace: 'nowrap', '&:hover': { bgcolor: palette.green600 } }}
        >
          + New Category
        </Button>
        <Button
          variant="outlined"
          size="small"
          disabled={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
          startIcon={syncMutation.isPending ? <CircularProgress size={14} sx={{ color: 'inherit' }} /> : undefined}
          sx={{ textTransform: 'none', borderColor: dt.border.strong, color: dt.text.secondary, whiteSpace: 'nowrap', '&:hover': { borderColor: dt.accent, color: dt.accent } }}
        >
          {syncMutation.isPending ? 'Syncing…' : 'Sync pools now'}
        </Button>
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
                  onEdit={() => { setCreating(false); setEditCat(cat); }}
                  onDelete={() => { if (window.confirm(`Delete category "${cat.label}" (${cat.code})? Existing pools are NOT affected on-chain, but will lose this category in the UI.`)) deleteMutation.mutate(cat.id); }}
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
        onClose={() => { setCreating(false); setEditCat(null); }}
        onSave={(data) => {
          if (creating) createMutation.mutate(data);
          else if (editCat) updateMutation.mutate({ id: editCat.id, data });
        }}
      />
    </Box>
  );
}
