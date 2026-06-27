'use client';

import { useState } from 'react';
import { Box, Typography, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { useTradingSummary, useTradingHistory, useTradingPositions, TRADES_PAGE_SIZE } from '@/hooks/useTrading';
import { SegmentedToggle } from '@/components/ui/SegmentedToggle';
import { PnLChart } from './PnLChart';
import type { TradeFillRow } from '@/lib/api';

/** USD formatter — compact, sign-aware. */
function usd(n: number, dp = 2): string {
  const s = n < 0 ? '-' : '';
  return `${s}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: dp })}`;
}
function fmtTime(ms: number): string {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Label/value pair used inside the mobile (xs) stacked cards. */
function MobileField({ t, label, value, color }: { t: ReturnType<typeof useThemeTokens>; label: string; value: string; color?: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 1 }}>
      <Typography sx={{ fontSize: '0.68rem', color: t.text.quaternary }}>{label}</Typography>
      <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: color ?? t.text.secondary, fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
    </Box>
  );
}

/**
 * Profile "Trading" view — HyperLiquid trading activity (from persisted fills),
 * keyed by the same identity as predictions. Mirrors the predictions layout:
 * a cumulative realized-PnL chart + stat tiles, then a fill-history table.
 */
export function TradingTab({ walletAddress }: { walletAddress?: string }) {
  const t = useThemeTokens();
  const [page, setPage] = useState(0);
  const [posPage, setPosPage] = useState(0);
  const [sub, setSub] = useState<'open' | 'closed'>('open');
  const { data: summary, isLoading } = useTradingSummary(walletAddress);
  const { data: hist } = useTradingHistory(walletAddress, page);
  const { data: positions } = useTradingPositions(walletAddress);

  const openPositions = positions ?? [];
  const POS_PAGE_SIZE = 10;
  const posPageCount = Math.max(1, Math.ceil(openPositions.length / POS_PAGE_SIZE));
  const pagedPositions = openPositions.slice(posPage * POS_PAGE_SIZE, posPage * POS_PAGE_SIZE + POS_PAGE_SIZE);
  const hasData = (!!summary && summary.trades > 0) || openPositions.length > 0;

  if (!isLoading && !hasData) {
    return (
      <Box sx={{ textAlign: 'center', py: 10, px: 3 }}>
        <Typography sx={{ fontSize: '1rem', fontWeight: 600, color: t.text.secondary, mb: 1 }}>No trading activity yet</Typography>
        <Typography sx={{ fontSize: '0.85rem', color: t.text.tertiary }}>
          Trade perps in the UpDown Terminal and your stats show up here.
        </Typography>
      </Box>
    );
  }

  const pnl = summary?.realizedPnlUsd ?? 0;
  const pnlPositive = pnl >= 0;
  // PnLChart works in micro-USDC (like predictions) — scale the USD curve up.
  const series = (summary?.pnlCurve ?? []).map((p) => ({ t: p.t, pnl: Math.round(p.pnl * 1_000_000) }));

  // Server-side pagination — one page from the API + the total count, so the
  // user can page through ALL trades (no client-side cap).
  const rows = hist?.data ?? [];
  const total = hist?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / TRADES_PAGE_SIZE));

  const tiles: Array<{ label: string; tip: string; value: string; sub?: string; color: string; icon?: React.ReactNode }> = [
    {
      label: 'Realized P&L',
      tip: 'Net realized profit/loss from closed positions (HyperLiquid closedPnl). Open positions are not included.',
      value: `${pnlPositive ? '+' : ''}${usd(pnl)}`,
      color: pnlPositive ? t.gain : t.down,
      icon: pnlPositive ? <TrendingUp sx={{ fontSize: 15 }} /> : <TrendingDown sx={{ fontSize: 15 }} />,
    },
    {
      label: 'Trading Rate',
      tip: 'Share of closing trades that realized a profit',
      value: `${(summary?.winRate ?? 0).toFixed(1)}%`,
      sub: `${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`,
      color: t.gain,
    },
    {
      label: 'Volume Traded',
      tip: 'Total notional traded (Σ size × price across all fills)',
      value: usd(summary?.volumeUsd ?? 0, 0),
      color: t.text.primary,
    },
    {
      label: 'Total Trades',
      tip: 'Total number of fills (opens and closes) on HyperLiquid',
      value: `${summary?.trades ?? 0}`,
      sub: summary?.bestCoin ? `best: ${summary.bestCoin.coin} ${usd(summary.bestCoin.pnl)}` : undefined,
      color: t.text.primary,
    },
  ];

  return (
    <>
      {/* Chart (70%) + stat tiles (30%) — same split as predictions. */}
      <Box sx={{ mb: 4, display: 'grid', gridTemplateColumns: { xs: '1fr', md: '7fr 3fr' }, gap: 2 }}>
        <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, p: 2 }}>
          <PnLChart series={series} />
        </Box>
        <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, p: 2 }}>
          <Box sx={{ display: { xs: 'grid', md: 'flex' }, gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'none' }, flexDirection: { md: 'column' }, gap: 1, height: '100%' }}>
            {tiles.map((tile) => (
              <Tooltip key={tile.label} arrow placement="left" title={tile.tip}>
                <Box sx={{ flex: { md: 1 }, minHeight: 56, display: 'flex', flexDirection: 'column', justifyContent: 'center', px: 1.5, py: 1, borderRadius: 1.5, bgcolor: t.bg.surfaceAlt, border: `1px solid ${t.border.subtle}`, cursor: 'help' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {tile.icon && <Box sx={{ display: 'flex', color: tile.color }}>{tile.icon}</Box>}
                    <Typography sx={{ fontSize: '0.62rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5 }}>{tile.label}</Typography>
                  </Box>
                  <Typography sx={{ fontSize: '1.15rem', fontWeight: 700, color: tile.color, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{tile.value}</Typography>
                  {tile.sub && <Typography sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.tertiary }}>{tile.sub}</Typography>}
                </Box>
              </Tooltip>
            ))}
          </Box>
        </Box>
      </Box>

      {/* Sub-tabs: Open (live positions) | Closed (fill history) */}
      <Box sx={{ mb: 2 }}>
        <SegmentedToggle
          value={sub}
          onChange={setSub}
          options={[
            { value: 'open', label: 'Open' },
            { value: 'closed', label: 'Closed' },
          ]}
        />
      </Box>

      {/* Open positions (live from HyperLiquid) */}
      {sub === 'open' && (openPositions.length > 0 ? (
        <Box sx={{ mb: 4, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, overflow: 'hidden' }}>
          <Box sx={{ px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
            <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: t.text.primary }}>Open Positions</Typography>
          </Box>
          {/* Desktop: grid table */}
          <Box sx={{ display: { xs: 'none', md: 'block' } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 1fr 1fr 1fr 1fr 1fr', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
              {['Coin', 'Side', 'Size', 'Entry', 'Mark', 'Liq.', 'PnL'].map((h, i) => (
                <Typography key={h} sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 2 ? 'right' : 'left' }}>{h}</Typography>
              ))}
            </Box>
            {pagedPositions.map((p) => {
              const base = p.symbol.replace('-USD', '');
              const long = p.side === 'LONG';
              const pnlN = Number(p.unrealizedPnl);
              const sizeUsd = Number(p.metadata?.positionValue ?? 0);
              return (
                <Box key={p.symbol} sx={{ display: 'grid', gridTemplateColumns: '1fr 0.9fr 1fr 1fr 1fr 1fr 1fr', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}`, fontVariantNumeric: 'tabular-nums' }}>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.primary }}>{base}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: long ? t.gain : t.down }}>{long ? `Long ${p.leverage}x` : `Short ${p.leverage}x`}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{sizeUsd > 0 ? usd(sizeUsd) : Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{usd(Number(p.entryPrice))}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{usd(Number(p.markPrice))}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.quaternary, textAlign: 'right' }}>{Number(p.liquidationPrice) > 0 ? usd(Number(p.liquidationPrice)) : '—'}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: pnlN >= 0 ? t.gain : t.down, textAlign: 'right' }}>{pnlN >= 0 ? '+' : ''}{usd(pnlN)}</Typography>
                </Box>
              );
            })}
          </Box>
          {/* Mobile: stacked cards */}
          <Box sx={{ display: { xs: 'block', md: 'none' } }}>
            {pagedPositions.map((p) => {
              const base = p.symbol.replace('-USD', '');
              const long = p.side === 'LONG';
              const pnlN = Number(p.unrealizedPnl);
              const sizeUsd = Number(p.metadata?.positionValue ?? 0);
              return (
                <Box key={p.symbol} sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, fontVariantNumeric: 'tabular-nums' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: t.text.primary }}>{base}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 700, color: long ? t.gain : t.down, border: `1px solid ${long ? t.gain : t.down}`, borderRadius: '4px', px: 0.75, py: 0.1 }}>{long ? 'Long' : 'Short'} {p.leverage}x</Typography>
                    <Typography sx={{ ml: 'auto', fontSize: '0.95rem', fontWeight: 700, color: pnlN >= 0 ? t.gain : t.down }}>{pnlN >= 0 ? '+' : ''}{usd(pnlN)}</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5 }}>
                    <MobileField t={t} label="Size" value={sizeUsd > 0 ? usd(sizeUsd) : Number(p.amount).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
                    <MobileField t={t} label="Liquidation" value={Number(p.liquidationPrice) > 0 ? usd(Number(p.liquidationPrice)) : '—'} />
                    <MobileField t={t} label="Entry" value={usd(Number(p.entryPrice))} />
                    <MobileField t={t} label="Mark" value={usd(Number(p.markPrice))} />
                  </Box>
                </Box>
              );
            })}
          </Box>
          {/* Pagination (client-side, 10 per page) */}
          {openPositions.length > POS_PAGE_SIZE && (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, px: 2, py: 1.25 }}>
              <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>
                Page {posPage + 1} of {posPageCount} · {openPositions.length} position{openPositions.length === 1 ? '' : 's'}
              </Typography>
              <Box component="button" onClick={() => setPosPage((p) => Math.max(0, p - 1))} disabled={posPage === 0}
                sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', cursor: posPage === 0 ? 'default' : 'pointer', color: posPage === 0 ? t.text.quaternary : t.text.secondary, opacity: posPage === 0 ? 0.4 : 1, '&:hover': { color: posPage === 0 ? t.text.quaternary : t.text.primary } }}>
                <ChevronLeft sx={{ fontSize: 18 }} />
              </Box>
              <Box component="button" onClick={() => setPosPage((p) => Math.min(posPageCount - 1, p + 1))} disabled={posPage >= posPageCount - 1}
                sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', cursor: posPage >= posPageCount - 1 ? 'default' : 'pointer', color: posPage >= posPageCount - 1 ? t.text.quaternary : t.text.secondary, opacity: posPage >= posPageCount - 1 ? 0.4 : 1, '&:hover': { color: posPage >= posPageCount - 1 ? t.text.quaternary : t.text.primary } }}>
                <ChevronRight sx={{ fontSize: 18 }} />
              </Box>
            </Box>
          )}
        </Box>
      ) : (
        <Box sx={{ textAlign: 'center', py: 8, px: 3, bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5 }}>
          <Typography sx={{ fontSize: '0.9rem', fontWeight: 600, color: t.text.secondary }}>No open positions</Typography>
          <Typography sx={{ fontSize: '0.8rem', color: t.text.tertiary, mt: 0.5 }}>Open a perp in the UpDown Terminal and it shows up here.</Typography>
        </Box>
      ))}

      {/* Closed: fill history */}
      {sub === 'closed' && (
      <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, overflow: 'hidden' }}>
        <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1.1fr 1fr 0.9fr 0.9fr 1fr 0.8fr 1fr', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
          {['Time', 'Coin', 'Direction', 'Size', 'Price', 'Fee', 'PnL'].map((h, i) => (
            <Typography key={h} sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</Typography>
          ))}
        </Box>
        {total === 0 ? (
          <Typography sx={{ textAlign: 'center', color: t.text.tertiary, py: 5, fontSize: '0.85rem' }}>No fills yet.</Typography>
        ) : (
          rows.map((f: TradeFillRow) => {
            const pnlN = f.pnlUsd != null ? Number(f.pnlUsd) : null;
            const isClose = (f.dir ?? '').toLowerCase().includes('close');
            const dirColor = !f.dir ? t.text.secondary : isClose ? t.accent : f.side === 'BUY' ? t.gain : t.down;
            const pnlStr = pnlN == null || pnlN === 0 ? '—' : `${pnlN >= 0 ? '+' : ''}${usd(pnlN)}`;
            const pnlColor = pnlN == null ? t.text.quaternary : pnlN >= 0 ? t.gain : t.down;
            return (
              <Box key={f.id}>
                {/* Desktop row */}
                <Box sx={{ display: { xs: 'none', md: 'grid' }, gridTemplateColumns: '1.1fr 1fr 0.9fr 0.9fr 1fr 0.8fr 1fr', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}`, fontVariantNumeric: 'tabular-nums' }}>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.tertiary, whiteSpace: 'nowrap' }}>{fmtTime(f.time)}</Typography>
                  <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.primary }}>{f.coin}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: dirColor }}>{f.dir ?? f.side}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{Number(f.sz).toLocaleString(undefined, { maximumFractionDigits: 4 })}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{usd(Number(f.px))}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', color: t.text.quaternary, textAlign: 'right' }}>{usd(Number(f.feeUsd))}</Typography>
                  <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: pnlColor, textAlign: 'right' }}>{pnlStr}</Typography>
                </Box>
                {/* Mobile card */}
                <Box sx={{ display: { xs: 'block', md: 'none' }, px: 2, py: 1.5, borderBottom: `1px solid ${t.border.subtle}`, fontVariantNumeric: 'tabular-nums' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: t.text.primary }}>{f.coin}</Typography>
                    <Typography sx={{ fontSize: '0.7rem', fontWeight: 600, color: dirColor }}>{f.dir ?? f.side}</Typography>
                    <Typography sx={{ ml: 'auto', fontSize: '0.6rem', color: t.text.tertiary }}>{fmtTime(f.time)}</Typography>
                  </Box>
                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0.5 }}>
                    <MobileField t={t} label="Size" value={Number(f.sz).toLocaleString(undefined, { maximumFractionDigits: 4 })} />
                    <MobileField t={t} label="Price" value={usd(Number(f.px))} />
                    <MobileField t={t} label="Fee" value={usd(Number(f.feeUsd))} />
                    <MobileField t={t} label="PnL" value={pnlStr} color={pnlColor} />
                  </Box>
                </Box>
              </Box>
            );
          })
        )}

        {/* Pagination footer */}
        {total > TRADES_PAGE_SIZE && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 1.5, px: 2, py: 1.25 }}>
            <Typography sx={{ fontSize: '0.72rem', color: t.text.tertiary }}>
              Page {page + 1} of {pageCount} · {total} trade{total === 1 ? '' : 's'}
            </Typography>
            <Box
              component="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', cursor: page === 0 ? 'default' : 'pointer', color: page === 0 ? t.text.quaternary : t.text.secondary, opacity: page === 0 ? 0.4 : 1, '&:hover': { color: page === 0 ? t.text.quaternary : t.text.primary } }}
            >
              <ChevronLeft sx={{ fontSize: 18 }} />
            </Box>
            <Box
              component="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={page >= pageCount - 1}
              sx={{ display: 'flex', alignItems: 'center', p: 0.5, borderRadius: 1, border: `1px solid ${t.border.subtle}`, bgcolor: 'transparent', cursor: page >= pageCount - 1 ? 'default' : 'pointer', color: page >= pageCount - 1 ? t.text.quaternary : t.text.secondary, opacity: page >= pageCount - 1 ? 0.4 : 1, '&:hover': { color: page >= pageCount - 1 ? t.text.quaternary : t.text.primary } }}
            >
              <ChevronRight sx={{ fontSize: 18 }} />
            </Box>
          </Box>
        )}
      </Box>
      )}
    </>
  );
}
