'use client';

import { useMemo, useState } from 'react';
import {
  Box, Typography, Chip, CircularProgress, Button,
  Table, TableBody, TableCell, TableHead, TableRow, Alert,
  TextField, InputAdornment, Dialog, DialogTitle, DialogContent, DialogActions,
  Select, MenuItem, FormControl, InputLabel,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import TravelExploreRoundedIcon from '@mui/icons-material/TravelExploreRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { useQuery } from '@tanstack/react-query';
import { adminFetch, adminPost } from '../lib/adminApi';
import { darkTokens as t, withAlpha } from '@/lib/theme';
import { resolveBadgeBackground } from '@/lib/badgeBackground';
import { type SdbLeague, SPORT_COLORS } from './match-explorer-config';

export function BrowseSdbModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: (msg: string) => void }) {
  const [sport, setSport] = useState<string>('Soccer');
  const [query, setQuery] = useState('');
  const [pendingAdd, setPendingAdd] = useState<SdbLeague | null>(null);

  const sdbQ = useQuery({
    queryKey: ['admin-sports-sdb-leagues'],
    queryFn: () => adminFetch<{ success: true; data: { leagues: SdbLeague[]; sportsCount: number } }>('/sports/sdb-leagues').then(r => r.data),
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const allLeagues = sdbQ.data?.leagues ?? [];
  const allSports = useMemo(() => {
    const s = new Set<string>();
    for (const l of allLeagues) if (l.sport) s.add(l.sport);
    return [...s].sort();
  }, [allLeagues]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allLeagues.filter(l => {
      if (sport !== 'ALL' && l.sport !== sport) return false;
      if (!q) return true;
      return l.name.toLowerCase().includes(q)
        || l.alternate.toLowerCase().includes(q)
        || l.id.includes(q);
    });
  }, [allLeagues, sport, query]);

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="md"
        fullWidth
        PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}`, height: '80vh' } }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '1rem', borderBottom: `1px solid ${t.border.subtle}` }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TravelExploreRoundedIcon sx={{ fontSize: 20 }} />
            Browse TheSportsDB Leagues
            <Chip label={`${allLeagues.length} total`} size="small" sx={{ ml: 1, height: 18, fontSize: '0.65rem' }} />
          </Box>
          <Button size="small" onClick={onClose} sx={{ minWidth: 0, p: 0.5, color: t.text.tertiary }}><CloseRoundedIcon /></Button>
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: '12px !important' }}>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <FormControl size="small" sx={{ minWidth: 180 }}>
              <InputLabel>Sport</InputLabel>
              <Select value={sport} label="Sport" onChange={e => setSport(e.target.value)}>
                <MenuItem value="ALL">All sports</MenuItem>
                {allSports.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField
              size="small"
              fullWidth
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name, alternate, or SDB id"
              InputProps={{ startAdornment: <InputAdornment position="start"><SearchRoundedIcon sx={{ fontSize: 16 }} /></InputAdornment> }}
            />
          </Box>

          <Typography sx={{ fontSize: '0.7rem', color: t.text.tertiary }}>
            {filtered.length} match{filtered.length === 1 ? '' : 'es'} • cached 10 min server-side
          </Typography>

          <Box sx={{ overflow: 'auto', flex: 1, border: `1px solid ${t.border.subtle}`, borderRadius: 1 }}>
            {sdbQ.isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress size={20} /></Box>
            ) : (
              <Table size="small" stickyHeader sx={{ '& td, & th': { borderColor: t.border.subtle, fontSize: '0.75rem' }, '& th': { bgcolor: t.bg.surface } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>SDB id</TableCell>
                    <TableCell>League</TableCell>
                    <TableCell>Sport</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filtered.map(l => (
                    <TableRow key={l.id} hover>
                      <TableCell sx={{ fontFamily: 'ui-monospace, monospace', color: t.text.tertiary }}>{l.id}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.78rem' }}>{l.name}</Typography>
                        {l.alternate && <Typography sx={{ fontSize: '0.65rem', color: t.text.tertiary }}>{l.alternate}</Typography>}
                      </TableCell>
                      <TableCell><Chip label={l.sport || '-'} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: withAlpha(SPORT_COLORS[l.sport.toUpperCase()] || t.text.tertiary, 0.15) }} /></TableCell>
                      <TableCell align="right">
                        {l.inUse ? (
                          <Chip label={`in use as ${l.categoryCode}`} size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: withAlpha(t.gain, 0.15), color: t.gain }} />
                        ) : (
                          <Button
                            size="small"
                            startIcon={<AddRoundedIcon sx={{ fontSize: 14 }} />}
                            onClick={() => setPendingAdd(l)}
                            sx={{ fontSize: '0.7rem', textTransform: 'none', py: 0.25, px: 1.25, color: t.text.primary, bgcolor: t.hover.medium, '&:hover': { bgcolor: t.hover.strong } }}
                          >
                            Add
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
        </DialogContent>
      </Dialog>

      {pendingAdd && (
        <AddCategoryDialog
          league={pendingAdd}
          existingCodes={new Set(allLeagues.filter(l => l.inUse && l.categoryCode).map(l => l.categoryCode!))}
          onClose={() => setPendingAdd(null)}
          onSuccess={(code) => {
            setPendingAdd(null);
            onAdded(`Added category ${code}`);
          }}
        />
      )}
    </>
  );
}

// ─── Add Category confirm dialog ──────────────────────────────────────────────

function suggestCode(name: string, sport: string): string {
  // First, try a sport-aware abbreviation for soccer (most common case):
  // "English Premier League" → EPL, "Brazilian Serie A" → BSA.
  const words = name.replace(/[^A-Za-z0-9 ]/g, '').split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const initials = words.map(w => w[0].toUpperCase()).join('');
    if (initials.length >= 2 && initials.length <= 5) return initials;
  }
  // Fallback: first 4-5 letters of the name uppercased.
  return name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || sport.slice(0, 4).toUpperCase();
}

function AddCategoryDialog({ league, existingCodes, onClose, onSuccess }: {
  league: SdbLeague;
  existingCodes: Set<string>;
  onClose: () => void;
  onSuccess: (code: string) => void;
}) {
  const isSoccer = league.sport === 'Soccer';
  const [code, setCode] = useState(() => {
    let c = suggestCode(league.name, league.sport);
    let i = 1;
    while (existingCodes.has(c)) c = `${suggestCode(league.name, league.sport)}${i++}`;
    return c;
  });
  const [label, setLabel] = useState(league.name);
  const [sortOrder, setSortOrder] = useState<number>(99);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Pre-fetch the rich SDB record so the create payload includes badgeUrl
  // and the operator gets a visual confirmation BEFORE submitting. Falls
  // through to a null badge if SDB doesn't ship one for this league -
  // category still creates, just without a badge column.
  const detailQ = useQuery({
    queryKey: ['admin-sdb-league-detail', league.id],
    queryFn: () => adminFetch<{ data: { badge: string | null; logo: string | null; country: string | null; badgeBgColor: 'light' | 'dark' | null } }>(`/sports/sdb-league/${encodeURIComponent(league.id)}`).then(r => r.data),
    staleTime: 60 * 60_000, // 1h client cache; backend caches 6h
  });
  const badge = detailQ.data?.badge ?? null;
  const country = detailQ.data?.country ?? null;
  // Auto-detected by the backend (services/sports/badge-analyzer.ts).
  // 'dark' means the badge content is bright/white → render on a dark
  // background; 'light' is the historical default. The operator can
  // still override in the Categories edit dialog.
  const badgeBgColor = detailQ.data?.badgeBgColor ?? null;

  const codeUpper = code.toUpperCase().replace(/[^A-Z0-9_]/g, '');
  const codeValid = codeUpper.length >= 2 && !existingCodes.has(codeUpper);

  // Map SDB's strSport to the canonical SPORT_GROUP code so newly-added
  // categories nest correctly under the right umbrella in the public
  // filter. Soccer → FOOTBALL is handled implicitly via the FOOTBALL_LEAGUE
  // type's backfill in the DB; here we pin SPORTSDB_SPORT additions.
  const SDB_SPORT_TO_GROUP: Record<string, string> = {
    Soccer: 'FOOTBALL',
    Basketball: 'BASKETBALL',
    'Ice Hockey': 'ICE_HOCKEY',
    'American Football': 'AMERICAN_FOOTBALL',
    Baseball: 'BASEBALL',
    Fighting: 'FIGHTING',
    Rugby: 'RUGBY',
    Tennis: 'TENNIS',
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      const type = isSoccer ? 'FOOTBALL_LEAGUE' : 'SPORTSDB_SPORT';
      const config: Record<string, unknown> = { externalLeagueId: league.id };
      if (!isSoccer) {
        // SDB sport name is already the v1 livescore query string - the
        // old SPORT_TO_QUERY map mapped every key to itself, so it was
        // pure noise (Plan §3.10).
        config.sportQuery = league.sport;
        config.leagueFilter = league.name;
      }
      const parentCode = SDB_SPORT_TO_GROUP[league.sport] ?? (isSoccer ? 'FOOTBALL' : null);
      const body: Record<string, unknown> = {
        code: codeUpper,
        type,
        label,
        shortLabel: codeUpper,
        sortOrder,
        numSides: isSoccer ? 3 : 2,
        sideLabels: isSoccer ? ['Home', 'Draw', 'Away'] : ['Home', 'Away'],
        enabled: true,
        comingSoon: true, // hide from public feed until operator promotes it
        apiSource: 'sports',
        adapterKey: isSoccer ? 'FOOTBALL' : codeUpper,
        config,
        parentCode,
      };
      // Include badgeUrl when SDB gave us one - categories created from
      // the Browse SDB flow now ship with the league logo already wired.
      if (badge) body.badgeUrl = badge;
      // The auto-detected background preference lets white-on-transparent
      // logos render correctly without operator intervention.
      if (badgeBgColor) body.badgeBgColor = badgeBgColor;
      const res = await adminPost<{ success: true; data: { code: string } }>('/categories', body);
      onSuccess(res.data.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add category');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { bgcolor: t.bg.surface, border: `1px solid ${t.border.medium}` } }}>
      <DialogTitle sx={{ fontSize: '0.95rem' }}>Add as category</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '12px !important' }}>
        <Box sx={{ p: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, borderRadius: 1, fontSize: '0.75rem', display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
          {/* Badge preview from lookupleague.php. Cached 6h server-side
              + 1h client-side, so reopening the dialog for the same league
              is free. The slot reserves space even while loading so the
              dialog doesn't jump. */}
          <Box sx={{
            width: 44, height: 44, flexShrink: 0,
            borderRadius: 1,
            // Use the auto-detected preference so the preview matches what
            // the public app will actually render - a white badge shows
            // on dark, a coloured badge on light.
            bgcolor: badge ? resolveBadgeBackground(badgeBgColor) : t.bg.surface,
            border: `1px solid ${t.border.subtle}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            {detailQ.isLoading ? (
              <CircularProgress size={14} sx={{ color: t.text.tertiary }} />
            ) : badge ? (
              <Box component="img" src={badge} alt="" sx={{ width: 38, height: 38, objectFit: 'contain' }} />
            ) : (
              <Box sx={{ fontSize: '0.55rem', color: t.text.tertiary, textAlign: 'center', lineHeight: 1.1 }}>no<br/>badge</Box>
            )}
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Box>SDB id <strong>{league.id}</strong></Box>
              <Box>sport <strong>{league.sport || '-'}</strong></Box>
              {country && <Box>country <strong>{country}</strong></Box>}
            </Box>
            <Typography sx={{ fontSize: '0.78rem', mt: 0.5, color: t.text.primary }}>{league.name}</Typography>
            {league.alternate && <Typography sx={{ fontSize: '0.65rem', color: t.text.tertiary }}>{league.alternate}</Typography>}
          </Box>
        </Box>

        <TextField
          size="small"
          label="Code"
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
          error={!codeValid}
          helperText={!codeValid ? (codeUpper.length < 2 ? 'Too short' : `Code "${codeUpper}" already exists`) : 'Permanent identifier (e.g. EPL, BSA). Pools reference this.'}
        />
        <TextField size="small" label="Display label" value={label} onChange={e => setLabel(e.target.value)} />
        <TextField size="small" type="number" label="Sort order" value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} helperText="Lower = shows earlier in tabs" />

        <Alert severity="info" sx={{ fontSize: '0.72rem' }}>
          Will be created with type <strong>{isSoccer ? 'FOOTBALL_LEAGUE' : 'SPORTSDB_SPORT'}</strong>,
          {' '}sides <strong>{isSoccer ? '3-way (H/D/A)' : '2-way (H/A)'}</strong>,
          {' '}under sport group <strong>{SDB_SPORT_TO_GROUP[league.sport] ?? (isSoccer ? 'FOOTBALL' : '(none)')}</strong>,
          {' '}and <strong>coming-soon</strong> (hidden from feed until you toggle it on Categories tab).
        </Alert>

        {error && <Alert severity="error" sx={{ fontSize: '0.72rem' }}>{error}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: 'none', color: t.text.tertiary }}>Cancel</Button>
        <Button onClick={submit} disabled={busy || !codeValid || !label} variant="contained" sx={{ textTransform: 'none', bgcolor: t.gain, '&:hover': { bgcolor: t.successDark } }}>
          {busy ? 'Adding…' : 'Add category'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
