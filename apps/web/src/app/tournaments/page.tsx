'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  CircularProgress,
  Alert,
  Button,
  Chip,
  IconButton,
  Collapse,
} from '@mui/material';
import { EmojiEvents, ShowChart, SportsSoccer, FilterList, GridView } from '@mui/icons-material';
import { FilterDropdown } from '@/components/sports/MarketFilter';
import Link from 'next/link';
import { AppShell, AssetIcon } from '@/components';
import { fetchTournaments, type TournamentSummary } from '@/lib/api';
import { UP_COLOR, ACCENT_COLOR, GAIN_COLOR, DRAW_COLOR } from '@/lib/constants';
import { formatDate } from '@/lib/format';
import { useWalletBridge } from '@/hooks/useWalletBridge';
import { useTournamentRegister, type RegisterStatus } from '@/hooks/useTournamentRegister';
import { useCategories, type CategoryConfig } from '@/hooks/useCategories';
import { getIcon } from '@/lib/icon-registry';

const SPORT_FILTERS = [
  { value: 'SOCCER', label: 'Soccer' },
];

// League filters are now built dynamically from useCategories()

const ASSET_FILTERS = [
  { value: 'ALL', label: 'All', img: null, icon: <GridView sx={{ fontSize: 18 }} /> },
  { value: 'BTC', label: 'BTC', img: '/coins/btc-coin.png' },
  { value: 'ETH', label: 'ETH', img: '/coins/eth-coin.png' },
  { value: 'SOL', label: 'SOL', img: '/coins/sol-coin.png' },
];

const STATUS_COLORS: Record<string, string> = {
  REGISTERING: UP_COLOR,
  ACTIVE: ACCENT_COLOR,
  COMPLETED: 'rgba(255,255,255,0.35)',
};

const STATUS_LABELS: Record<string, string> = {
  REGISTERING: 'Open',
  ACTIVE: 'Live',
  COMPLETED: 'Ended',
};

const STATUS_BUTTON_LABEL: Record<RegisterStatus, string> = {
  idle: 'Register',
  preparing: 'Preparing...',
  signing: 'Sign in Wallet...',
  confirming: 'Confirming...',
  registering: 'Registering...',
  success: 'Registered',
  error: 'Try Again',
};

// League names are now from useCategories()

function TournamentCard({ t, onRegistered }: { t: TournamentSummary; onRegistered: () => void }) {
  const { connected, walletAddress } = useWalletBridge();
  const { register, status: regStatus, error: regError, reset } = useTournamentRegister();
  const entryFeeUsdc = (Number(t.entryFee) / 1_000_000).toFixed(2);
  const prizePoolUsdc = (Number(t.prizePool) / 1_000_000).toFixed(2);
  const statusColor = STATUS_COLORS[t.status] || 'rgba(255,255,255,0.35)';
  const statusLabel = STATUS_LABELS[t.status] || t.status;
  const filled = t.participantCount ?? t._count?.participants ?? 0;
  const isRegistering = t.status === 'REGISTERING';
  const alreadyRegistered = !!(walletAddress && t.participantWallets?.includes(walletAddress));
  const isRegistered = alreadyRegistered || regStatus === 'success';
  const isBusy = regStatus !== 'idle' && regStatus !== 'success' && regStatus !== 'error';
  const isSports = t.tournamentType === 'SPORTS';

  return (
    <Box
      sx={{
        bgcolor: '#0D1219',
        borderRadius: 0,
        p: { xs: 2, md: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        transition: 'background 0.15s ease',
        '&:hover': { background: 'rgba(255,255,255,0.04)' },
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {isSports && t.league ? (
            <Box
              component="img"
              src={`https://crests.football-data.org/${t.league}.png`}
              alt={t.league}
              sx={{ width: 32, height: 32, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '3px' }}
            />
          ) : (
            <Box
              component="img"
              src={`/tournaments/tournament-${t.asset.toLowerCase()}.png`}
              alt={t.asset}
              sx={{ width: 36, height: 36, objectFit: 'contain' }}
            />
          )}
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{t.name}</Typography>
        </Box>
        <Chip
          label={statusLabel}
          size="small"
          sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}25`, borderRadius: 0 }}
        />
      </Box>

      {/* Info grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        {isSports ? (
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>League</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                component="img"
                src={`https://crests.football-data.org/${t.league}.png`}
                alt={t.league || ''}
                sx={{ width: 20, height: 20, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }}
              />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.league}</Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>Asset</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AssetIcon asset={t.asset} size={20} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.asset}</Typography>
            </Box>
          </Box>
        )}
        <InfoItem label="Entry Fee" value={`$${entryFeeUsdc}`} />
        <InfoItem label="Players" value={`${filled} / ${t.size}`} />
        <InfoItem label="Prize Pool" value={`$${prizePoolUsdc}`} color={GAIN_COLOR} />
        {t.scheduledAt && (
          <InfoItem label="Starts" value={formatDate(t.scheduledAt)} />
        )}
      </Box>

      {/* Round info */}
      {t.status !== 'REGISTERING' && (
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.35)' }}>
          Round {t.currentRound} / {t.totalRounds}
        </Typography>
      )}

      {/* Buttons — always same structure */}
      <Box sx={{ display: 'flex', gap: 1, mt: 'auto' }}>
        {/* Register / Registered button */}
        {isRegistering && connected ? (
          <Button
            variant="contained"
            disabled={isBusy || isRegistered}
            onClick={async () => {
              if (regStatus === 'error') reset();
              const ok = await register(t.id);
              if (ok) onRegistered();
            }}
            sx={{
              flex: 1,
              bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : regStatus === 'error' ? 'rgba(248,113,113,0.15)' : UP_COLOR,
              color: isRegistered ? UP_COLOR : regStatus === 'error' ? '#F87171' : '#000',
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 0,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : `${UP_COLOR}CC`, boxShadow: 'none' },
              '&:disabled': isRegistered
                ? { bgcolor: 'rgba(255,255,255,0.04)', color: UP_COLOR }
                : { bgcolor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.4)' },
            }}
          >
            {isBusy ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <CircularProgress size={14} sx={{ color: 'inherit' }} />
                {STATUS_BUTTON_LABEL[regStatus]}
              </Box>
            ) : isRegistered ? 'Registered' : regStatus === 'error' ? 'Try Again' : `Register · $${entryFeeUsdc}`}
          </Button>
        ) : isRegistering ? (
          <Button disabled fullWidth sx={{ flex: 1, fontSize: '0.8rem', textTransform: 'none', borderRadius: 0, py: 0.75, color: 'rgba(255,255,255,0.25)' }}>
            Connect wallet
          </Button>
        ) : null}

        {/* View button */}
        <Link href={`/tournament/${t.id}`} style={{ textDecoration: 'none', flex: isRegistering ? undefined : 1 }}>
          <Button
            fullWidth
            variant="contained"
            sx={{
              bgcolor: 'rgba(255,255,255,0.06)',
              color: '#fff',
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 0,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { bgcolor: 'rgba(255,255,255,0.1)', boxShadow: 'none' },
            }}
          >
            View
          </Button>
        </Link>
      </Box>

      {/* Error */}
      {regError && (
        <Typography sx={{ fontSize: '0.65rem', color: '#F87171', textAlign: 'center' }}>{regError}</Typography>
      )}
    </Box>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: color || '#fff', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Box>
  );
}

type TabType = string;

function buildIcon(cat: CategoryConfig, size: number = 16): React.ReactNode {
  const Icon = getIcon(cat.iconKey);
  if (Icon) return <Icon sx={{ fontSize: size }} />;
  return null;
}

export default function TournamentsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useCategories();

  const rawType = searchParams.get('type');
  const marketType: TabType = rawType && (rawType === 'CRYPTO' || rawType === 'SPORTS' || rawType.startsWith('PM_')) ? rawType : 'CRYPTO';
  const assetFilter = searchParams.get('asset') ?? 'ALL';
  const leagueFilter = searchParams.get('league') ?? 'ALL';
  const [showFilters, setShowFilters] = useState(false);

  const updateParam = useCallback((key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'ALL' || value === 'CRYPTO') {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    // Clean irrelevant params when switching type
    if (key === 'type') {
      params.delete('asset');
      params.delete('league');
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const load = useCallback(async () => {
    try {
      const fetchType = marketType.startsWith('PM_') ? 'SPORTS' : marketType;
      const res = await fetchTournaments(undefined, fetchType);
      if (res.success && res.data) {
        setTournaments(res.data);
        setError(null);
      } else {
        setError(res.error?.message || 'Failed to load tournaments');
      }
    } catch {
      setError('Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }, [marketType]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15_000);
    return () => clearInterval(interval);
  }, [load]);

  const isPM = marketType.startsWith('PM_');
  const filtered = useMemo(() => {
    let result = tournaments;
    if (isPM) {
      result = result.filter(t => t.league === marketType);
    } else if (assetFilter !== 'ALL' && marketType === 'CRYPTO') {
      result = result.filter(t => t.asset === assetFilter);
    } else if (leagueFilter !== 'ALL' && marketType === 'SPORTS') {
      result = result.filter(t => t.league === leagueFilter);
    }
    return result;
  }, [tournaments, marketType, assetFilter, leagueFilter, isPM]);

  const { tabs: dynamicTabs, leagueFilters, tabColorMap } = useMemo(() => {
    const cats = categories || [];
    const pmCats = cats.filter(c => c.type === 'POLYMARKET' && c.enabled);
    const footballCats = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && c.enabled);
    const tabs = [
      { key: 'CRYPTO', label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: UP_COLOR },
      { key: 'SPORTS', label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: DRAW_COLOR },
      ...pmCats.map(c => ({ key: c.code, label: c.shortLabel || c.label, icon: buildIcon(c), color: c.color || '#A78BFA' })),
    ];
    const leagueFilters = [
      { value: 'ALL', label: 'All', img: null as string | null, icon: <GridView sx={{ fontSize: 18 }} /> },
      ...footballCats.map(c => ({ value: c.code, label: c.shortLabel || c.label, img: c.badgeUrl })),
    ];
    const tabColorMap: Record<string, string> = { CRYPTO: UP_COLOR, SPORTS: DRAW_COLOR };
    for (const c of pmCats) tabColorMap[c.code] = c.color || '#A78BFA';
    return { tabs, leagueFilters, tabColorMap };
  }, [categories]);

  const tabColor = tabColorMap[marketType] || UP_COLOR;

  return (
    <AppShell>
      <Container maxWidth={false} sx={{ py: { xs: 2, md: 3 }, px: { xs: 2, md: 3 } }}>
        {/* Page header */}
        <Box sx={{ mb: 3 }}>
          <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.3rem', md: '1.6rem' }, mb: 0.5 }}>
            Tournaments
          </Typography>
          <Typography sx={{ fontSize: '0.85rem', color: 'text.secondary' }}>
            Compete head-to-head in bracket-style elimination tournaments.
          </Typography>
        </Box>

        {/* Crypto / Sports tabs + filter icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
          <Box sx={{ display: 'flex', gap: 0, overflow: 'auto', '&::-webkit-scrollbar': { display: 'none' } }}>
            {dynamicTabs.map((tab) => {
              const active = marketType === tab.key;
              return (
                <Box
                  key={tab.key}
                  onClick={() => { updateParam('type', tab.key); setShowFilters(false); }}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.75,
                    px: { xs: 1.25, md: 2 },
                    py: 1,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    borderBottom: active ? `2px solid ${tab.color}` : '2px solid transparent',
                    color: active ? tab.color : 'rgba(255,255,255,0.35)',
                    transition: 'all 0.15s ease',
                    '&:hover': { color: tab.color },
                  }}
                >
                  {tab.icon}
                  <Typography sx={{ fontSize: { xs: '0.75rem', md: '0.85rem' }, fontWeight: active ? 700 : 500 }}>
                    {tab.label}
                  </Typography>
                </Box>
              );
            })}
          </Box>
          {!isPM && (
            <IconButton
              onClick={() => setShowFilters(!showFilters)}
              size="small"
              sx={{ color: showFilters ? tabColor : 'rgba(255,255,255,0.35)', '&:hover': { color: tabColor }, flexShrink: 0 }}
            >
              <FilterList sx={{ fontSize: 20 }} />
            </IconButton>
          )}
        </Box>

        {/* Collapsible filter dropdowns */}
        <Collapse in={showFilters}>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, py: 0.5 }}>
            {marketType === 'CRYPTO' ? (
              <FilterDropdown
                value={assetFilter}
                label="Asset"
                options={ASSET_FILTERS}
                onChange={(v) => updateParam('asset', v)}
                color={UP_COLOR}
              />
            ) : (
              <>
                <FilterDropdown
                  value="SOCCER"
                  label="Sport"
                  icon={<SportsSoccer sx={{ fontSize: 18 }} />}
                  options={SPORT_FILTERS.map(f => ({ ...f, img: null, icon: <SportsSoccer sx={{ fontSize: 18 }} /> }))}
                  onChange={() => {}}
                  color={DRAW_COLOR}
                />
                <FilterDropdown
                  value={leagueFilter}
                  label="League"
                  options={leagueFilters}
                  onChange={(v) => updateParam('league', v)}
                  color={DRAW_COLOR}
                />
              </>
            )}
          </Box>
        </Collapse>

        {/* Error */}
        {error && (
          <Alert
            severity="error"
            sx={{
              mb: 3,
              bgcolor: 'rgba(248,113,113,0.1)',
              border: 'none',
              borderRadius: 1,
            }}
          >
            {error}
          </Alert>
        )}

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress size={32} sx={{ color: UP_COLOR }} />
          </Box>
        )}

        {/* Tournament cards */}
        {!loading && filtered.length === 0 && !error && (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <EmojiEvents sx={{ fontSize: 48, color: 'rgba(255,255,255,0.1)', mb: 2 }} />
            <Typography sx={{ color: 'text.secondary', fontSize: '0.9rem' }}>
              {marketType === 'SPORTS'
                ? 'Sports tournaments coming soon! Stay tuned.'
                : 'No tournaments available right now. Check back soon!'}
            </Typography>
          </Box>
        )}

        {!loading && filtered.length > 0 && (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(3, 1fr)' },
              gap: 2,
            }}
          >
            {filtered.map((t) => (
              <TournamentCard key={t.id} t={t} onRegistered={load} />
            ))}
          </Box>
        )}
      </Container>
    </AppShell>
  );
}
