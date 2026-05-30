'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Box, Typography } from '@mui/material';
import { ChevronLeft, ChevronRight, SportsSoccer } from '@mui/icons-material';
import { getIcon } from '@/lib/icon-registry';
import { INTERVAL_LABELS } from '@/lib/constants';
import { useThemeTokens } from '@/app/providers';
import { withAlpha } from '@/lib/theme';
import { getSocket, connectSocket, subscribePool, unsubscribePool } from '@/lib/socket';
import { OddsChart } from '@/components/pool/OddsChart';
import type { Pool } from '@/lib/api';
import type { CategoryConfig } from '@/hooks/useCategories';

const ASSET_NAMES: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana' };

interface Props {
  pools: Pool[];
  categoryMap: Map<string, CategoryConfig>;
  onSelect: (pool: Pool) => void;
}

/** Kalshi-style featured hero: a carousel of the top trending markets, each shown
 *  large with its outcomes and a live odds chart. Auto-rotates; arrows to navigate. */
export function FeaturedHero({ pools, categoryMap, onSelect }: Props) {
  const t = useThemeTokens();
  const [index, setIndex] = useState(0);
  const [live, setLive] = useState<{ up: string; down: string; draw: string } | null>(null);
  const [flash, setFlash] = useState(false);

  const count = pools.length;
  useEffect(() => { if (index >= count) setIndex(0); }, [count, index]);

  const safeIndex = count > 0 ? Math.min(index, count - 1) : 0;
  const currentId = pools[safeIndex]?.id;

  // Live totals via WebSocket — re-subscribes whenever the featured pool changes.
  useEffect(() => {
    setLive(null);
    setFlash(false);
    if (typeof window === 'undefined' || !currentId) return;
    const sock = getSocket();
    connectSocket();
    subscribePool(currentId);
    const onUpdate = (d: { id: string; totalUp: string; totalDown: string; totalDraw: string }) => {
      if (d.id !== currentId) return;
      setLive({ up: d.totalUp, down: d.totalDown, draw: d.totalDraw });
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    };
    sock.on('pool:updated', onUpdate);
    return () => { sock.off('pool:updated', onUpdate); unsubscribePool(currentId); };
  }, [currentId]);

  if (count === 0) return null;
  const pool = pools[safeIndex];

  const isPrediction = !!pool.league?.startsWith('PM_');
  const isCrypto = pool.poolType !== 'SPORTS';
  const isTwoWay = isCrypto || isPrediction || pool.numSides === 2;

  // Category chip
  const category = pool.league ? categoryMap.get(pool.league) : undefined;
  const catColor = isCrypto ? t.up : category?.color || (isPrediction ? t.prediction : t.draw);
  const catLabel = isCrypto ? 'Crypto' : category?.label || pool.league || 'Sports';
  const CatIcon = getIcon(category?.iconKey);
  const catIcon: ReactNode = isCrypto
    ? <Box component="img" src={`/coins/${pool.asset.toLowerCase()}-coin.png`} alt="" sx={{ width: 18, height: 18, borderRadius: '50%' }} />
    : category?.badgeUrl
      ? <Box component="img" src={category.badgeUrl} alt="" sx={{ width: 18, height: 18, objectFit: 'contain', ...(category?.type === 'FOOTBALL_LEAGUE' && { bgcolor: 'rgba(255,255,255,0.85)', borderRadius: '50%', p: '1px' }) }} />
      : CatIcon ? <CatIcon sx={{ fontSize: 16 }} /> : !isPrediction ? <SportsSoccer sx={{ fontSize: 16 }} /> : null;

  const title = isCrypto
    ? `${ASSET_NAMES[pool.asset] || pool.asset} · ${INTERVAL_LABELS[pool.interval] || pool.interval}`
    : isPrediction
      ? (pool.awayTeam ? `${pool.homeTeam} vs ${pool.awayTeam}` : pool.homeTeam || 'Prediction market')
      : `${pool.homeTeam || 'Home'} vs ${pool.awayTeam || 'Away'}`;

  const tUp = live?.up ?? pool.totalUp;
  const tDown = live?.down ?? pool.totalDown;
  const tDraw = live?.draw ?? pool.totalDraw;
  const totalUp = Number(tUp), totalDown = Number(tDown), totalDraw = Number(tDraw);
  const tot = totalUp + totalDown + totalDraw;
  const pct = (s: number, def: number) => (tot > 0 ? Math.round((s / tot) * 100) : def);
  const upIcon = <Box component="img" src="/assets/up-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />;
  const downIcon = <Box component="img" src="/assets/down-icon-64x64.png" alt="" sx={{ width: 18, height: 18 }} />;
  const outcomes: Array<{ name: string; color: string; pct: number; icon?: ReactNode; crest?: string | null }> = isCrypto
    ? [{ name: 'Up', color: t.up, pct: pct(totalUp, 50), icon: upIcon }, { name: 'Down', color: t.down, pct: pct(totalDown, 50), icon: downIcon }]
    : isPrediction
      ? [{ name: pool.awayTeam ? pool.homeTeam! : 'Yes', color: t.up, pct: pct(totalUp, 50) }, { name: pool.awayTeam || 'No', color: t.down, pct: pct(totalDown, 50) }]
      : [
          { name: pool.homeTeam || 'Home', color: t.up, pct: pct(totalUp, isTwoWay ? 50 : 33), crest: pool.homeTeamCrest },
          ...(!isTwoWay ? [{ name: 'Draw', color: t.draw, pct: pct(totalDraw, 34) }] : []),
          { name: pool.awayTeam || 'Away', color: t.down, pct: pct(totalDown, isTwoWay ? 50 : 33), crest: pool.awayTeamCrest },
        ];

  let livePoolNum = Number(pool.totalPool);
  try { livePoolNum = Number(BigInt(tUp || '0') + BigInt(tDown || '0') + BigInt(tDraw || '0')); } catch { /* keep */ }
  const volUsd = livePoolNum / 1_000_000;
  const volLabel = volUsd >= 1e6 ? `$${(volUsd / 1e6).toFixed(1)}M` : volUsd >= 1e3 ? `$${(volUsd / 1e3).toFixed(1)}K` : `$${volUsd.toFixed(0)}`;

  return (
    <Box sx={{ bgcolor: t.bg.surface, border: t.surfaceBorder, borderRadius: 2, p: { xs: 1.75, md: 2.5 }, mb: { xs: 3, md: 4 } }}>
      {/* Header: category + pagination */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <Box sx={{ color: catColor, display: 'flex' }}>{catIcon}</Box>
          <Typography sx={{ fontSize: '0.68rem', fontWeight: 800, color: catColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{catLabel}</Typography>
        </Box>
        {count > 1 && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
            <Box component="button" onClick={() => setIndex(i => (i - 1 + count) % count)} sx={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}>
              <ChevronLeft sx={{ fontSize: 16 }} />
            </Box>
            <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: t.text.tertiary, fontVariantNumeric: 'tabular-nums', minWidth: 36, textAlign: 'center' }}>{index + 1} / {count}</Typography>
            <Box component="button" onClick={() => setIndex(i => (i + 1) % count)} sx={{ background: 'none', border: `1px solid ${t.border.default}`, borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: t.text.secondary, '&:hover': { color: t.text.primary, borderColor: t.border.medium } }}>
              <ChevronRight sx={{ fontSize: 16 }} />
            </Box>
          </Box>
        )}
      </Box>

      {/* Body: outcomes (left) + chart (right). Left column stretches to match
          the chart height so its content can spread (title at top, volume at bottom). */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '300px 1fr' }, gap: { xs: 2, md: 3 }, alignItems: 'stretch' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Typography
            onClick={() => onSelect(pool)}
            sx={{ fontSize: { xs: '1.1rem', md: '1.35rem' }, fontWeight: 800, color: t.text.primary, lineHeight: 1.25, mb: 1.5, cursor: 'pointer', '&:hover': { color: t.up } }}
          >
            {title}
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, mb: 1.5 }}>
            {outcomes.map((o) => (
              <Box key={o.name} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {o.crest ? (
                  <Box component="img" src={o.crest} alt="" sx={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
                ) : o.icon ? (
                  <Box sx={{ display: 'flex', flexShrink: 0 }}>{o.icon}</Box>
                ) : (
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: o.color, flexShrink: 0, mx: '6px' }} />
                )}
                <Typography sx={{ flex: 1, minWidth: 0, fontSize: '0.9rem', fontWeight: 600, color: t.text.primary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</Typography>
                <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: o.color, fontVariantNumeric: 'tabular-nums' }}>{o.pct}%</Typography>
              </Box>
            ))}
          </Box>
          <Box
            onClick={() => onSelect(pool)}
            sx={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 0.5, px: 2, py: 0.75, borderRadius: 1, cursor: 'pointer', bgcolor: withAlpha(catColor, 0.12), color: catColor, fontSize: '0.8rem', fontWeight: 700, mt: 'auto', '&:hover': { bgcolor: withAlpha(catColor, 0.2) } }}
          >
            View market <ChevronRight sx={{ fontSize: 16 }} />
          </Box>
          <Typography sx={{ fontSize: '0.72rem', color: t.text.quaternary, mt: 1, pt: 0 }}>
            <Box component="span" sx={{ fontWeight: 700, color: flash ? t.gain : t.text.tertiary, px: 0.5, borderRadius: 0.75, bgcolor: flash ? withAlpha(t.gain, 0.15) : 'transparent', transition: 'background-color 0.4s ease, color 0.4s ease' }}>{volLabel} Vol.</Box>
          </Typography>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <OddsChart key={pool.id} poolId={pool.id} totalUp={pool.totalUp} totalDown={pool.totalDown} totalDraw={pool.totalDraw} lockSource="updown" hideControls seedDefault />
        </Box>
      </Box>
    </Box>
  );
}
