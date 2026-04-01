'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useBadgeLookup } from '@/hooks/useCategories';
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
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
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

function useStatusColors() {
  const t = useThemeTokens();
  return {
    REGISTERING: t.up,
    ACTIVE: t.accent,
    COMPLETED: t.text.quaternary,
  } as Record<string, string>;
}

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

function TournamentCard({ t: tourneyData, onRegistered }: { t: TournamentSummary; onRegistered: () => void }) {
  const t = useThemeTokens();
  const STATUS_COLORS = useStatusColors();
  const getBadge = useBadgeLookup();
  const { connected, walletAddress } = useWalletBridge();
  const { register, status: regStatus, error: regError, reset } = useTournamentRegister();
  const entryFeeUsdc = (Number(tourneyData.entryFee) / 1_000_000).toFixed(2);
  const prizePoolUsdc = (Number(tourneyData.prizePool) / 1_000_000).toFixed(2);
  const statusColor = STATUS_COLORS[tourneyData.status] || t.text.quaternary;
  const statusLabel = STATUS_LABELS[tourneyData.status] || tourneyData.status;
  const filled = tourneyData.participantCount ?? tourneyData._count?.participants ?? 0;
  const isRegistering = tourneyData.status === 'REGISTERING';
  const alreadyRegistered = !!(walletAddress && tourneyData.participantWallets?.includes(walletAddress));
  const isRegistered = alreadyRegistered || regStatus === 'success';
  const isBusy = regStatus !== 'idle' && regStatus !== 'success' && regStatus !== 'error';
  const isSports = tourneyData.tournamentType === 'SPORTS';

  return (
    <Box
      sx={{
        bgcolor: t.bg.surfaceAlt,
        border: t.surfaceBorder,
        boxShadow: t.surfaceShadow,
        borderRadius: 1,
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
          {isSports && tourneyData.league ? (
            <Box
              component="img"
              src={getBadge(tourneyData.league!) || ''}
              alt={tourneyData.league}
              sx={{ width: 32, height: 32, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '3px' }}
            />
          ) : (
            <Box
              component="img"
              src={`/tournaments/tournament-${tourneyData.asset.toLowerCase()}.png`}
              alt={tourneyData.asset}
              sx={{ width: 36, height: 36, objectFit: 'contain' }}
            />
          )}
          <Typography sx={{ fontWeight: 700, fontSize: '0.95rem' }}>{tourneyData.name}</Typography>
        </Box>
        <Chip
          label={statusLabel}
          size="small"
          sx={{ fontWeight: 700, fontSize: '0.65rem', height: 22, bgcolor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}25`, borderRadius: 1 }}
        />
      </Box>

      {/* Info grid */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1 }}>
        {isSports ? (
          <Box>
            <Typography variant="caption" sx={{ color: t.text.tertiary, fontWeight: 500 }}>League</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                component="img"
                src={getBadge(tourneyData.league!) || ''}
                alt={tourneyData.league || ''}
                sx={{ width: 20, height: 20, objectFit: 'contain', bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '2px' }}
              />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{tourneyData.league}</Typography>
            </Box>
          </Box>
        ) : (
          <Box>
            <Typography variant="caption" sx={{ color: t.text.tertiary, fontWeight: 500 }}>Asset</Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <AssetIcon asset={tourneyData.asset} size={20} />
              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700 }}>{tourneyData.asset}</Typography>
            </Box>
          </Box>
        )}
        <InfoItem label="Entry Fee" value={`$${entryFeeUsdc}`} />
        <InfoItem label="Players" value={`${filled} / ${tourneyData.size}`} />
        <InfoItem label="Prize Pool" value={`$${prizePoolUsdc}`} color={t.gain} />
        {tourneyData.scheduledAt && (
          <InfoItem label="Starts" value={formatDate(tourneyData.scheduledAt)} />
        )}
      </Box>

      {/* Round info */}
      {tourneyData.status !== 'REGISTERING' && (
        <Typography variant="caption" sx={{ color: t.text.quaternary }}>
          Round {tourneyData.currentRound} / {tourneyData.totalRounds}
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
              const ok = await register(tourneyData.id);
              if (ok) onRegistered();
            }}
            sx={{
              flex: 1,
              bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : regStatus === 'error' ? 'rgba(248,113,113,0.15)' : t.up,
              color: isRegistered ? t.up : regStatus === 'error' ? t.error : '#000',
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 1,
              py: 0.75,
              boxShadow: 'none',
              '&:hover': { bgcolor: isRegistered ? 'rgba(255,255,255,0.04)' : `${t.up}CC`, boxShadow: 'none' },
              '&:disabled': isRegistered
                ? { bgcolor: 'rgba(255,255,255,0.04)', color: t.up }
                : { bgcolor: 'rgba(255,255,255,0.06)', color: t.text.tertiary },
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
          <Button disabled fullWidth sx={{ flex: 1, fontSize: '0.8rem', textTransform: 'none', borderRadius: 1, py: 0.75, color: t.text.muted }}>
            Connect wallet
          </Button>
        ) : null}

        {/* View button */}
        <Link href={`/tournament/${tourneyData.id}`} style={{ textDecoration: 'none', flex: isRegistering ? undefined : 1 }}>
          <Button
            fullWidth
            variant="contained"
            sx={{
              bgcolor: 'rgba(255,255,255,0.06)',
              color: t.text.primary,
              fontWeight: 700,
              fontSize: '0.8rem',
              textTransform: 'none',
              borderRadius: 1,
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
        <Typography sx={{ fontSize: '0.65rem', color: t.error, textAlign: 'center' }}>{regError}</Typography>
      )}
    </Box>
  );
}

function InfoItem({ label, value, color }: { label: string; value: string; color?: string }) {
  const t = useThemeTokens();
  return (
    <Box>
      <Typography variant="caption" sx={{ color: t.text.tertiary, fontWeight: 500 }}>
        {label}
      </Typography>
      <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: color || t.text.primary, fontVariantNumeric: 'tabular-nums' }}>
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
  const t = useThemeTokens();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const getBadge = useBadgeLookup();
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { data: categories } = useCategories();

  const rawType = searchParams.get('type');
  const marketType: TabType = rawType && (rawType === 'CRYPTO' || rawType === 'SPORTS' || rawType.startsWith('PM_')) ? rawType : 'CRYPTO';
  const assetFilter = searchParams.get('asset') ?? 'ALL';
  const leagueFilter = searchParams.get('league') ?? 'ALL';
  const sportFilter = searchParams.get('sport') ?? 'ALL';
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
      result = result.filter(tr => tr.league === marketType);
    } else if (marketType === 'CRYPTO') {
      if (assetFilter !== 'ALL') result = result.filter(tr => tr.asset === assetFilter);
    } else if (marketType === 'SPORTS') {
      if (sportFilter !== 'ALL') result = result.filter(tr => tr.sport?.toUpperCase() === sportFilter.toUpperCase());
      if (leagueFilter !== 'ALL') result = result.filter(tr => tr.league === leagueFilter);
    }
    return result;
  }, [tournaments, marketType, assetFilter, leagueFilter, sportFilter, isPM]);

  const { tabs: dynamicTabs, leagueFilters, tabColorMap } = useMemo(() => {
    const cats = categories || [];
    const pmCats = cats.filter(c => c.type === 'POLYMARKET' && c.enabled);
    const footballCats = cats.filter(c => c.type === 'FOOTBALL_LEAGUE' && c.enabled);
    const tabs = [
      { key: 'CRYPTO', label: 'Crypto', icon: <ShowChart sx={{ fontSize: 16 }} />, color: t.up },
      { key: 'SPORTS', label: 'Sports', icon: <SportsSoccer sx={{ fontSize: 16 }} />, color: t.draw },
      ...pmCats.map(c => ({ key: c.code, label: c.shortLabel || c.label, icon: buildIcon(c), color: c.color || t.prediction })),
    ];
    const leagueFilters = [
      { value: 'ALL', label: 'All', img: null as string | null, icon: <GridView sx={{ fontSize: 18 }} /> },
      ...footballCats.map(c => ({ value: c.code, label: c.shortLabel || c.label, img: c.badgeUrl })),
    ];
    const tabColorMap: Record<string, string> = { CRYPTO: t.up, SPORTS: t.draw };
    for (const c of pmCats) tabColorMap[c.code] = c.color || t.prediction;
    return { tabs, leagueFilters, tabColorMap };
  }, [categories]);

  const tabColor = tabColorMap[marketType] || t.up;

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
                    color: active ? tab.color : t.text.quaternary,
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
              sx={{ color: showFilters ? tabColor : t.text.quaternary, '&:hover': { color: tabColor }, flexShrink: 0 }}
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
                color={t.up}
              />
            ) : (
              <>
                <FilterDropdown
                  value="SOCCER"
                  label="Sport"
                  icon={<SportsSoccer sx={{ fontSize: 18 }} />}
                  options={SPORT_FILTERS.map(f => ({ ...f, img: null, icon: <SportsSoccer sx={{ fontSize: 18 }} /> }))}
                  onChange={() => {}}
                  color={t.draw}
                />
                <FilterDropdown
                  value={leagueFilter}
                  label="League"
                  options={leagueFilters}
                  onChange={(v) => updateParam('league', v)}
                  color={t.draw}
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
            <CircularProgress size={32} sx={{ color: t.up }} />
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
            {filtered.map((tr) => (
              <TournamentCard key={tr.id} t={tr} onRegistered={load} />
            ))}
          </Box>
        )}
      </Container>
    </AppShell>
  );
}
