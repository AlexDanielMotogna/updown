'use client';

import { Box, Typography, Tooltip } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';
import { useThemeTokens } from '@/app/providers';
import { useTradingSummary, useTradingHistory } from '@/hooks/useTrading';
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

/**
 * Profile "Trading" view — HyperLiquid trading activity (from persisted fills),
 * keyed by the same identity as predictions. Mirrors the predictions layout:
 * a cumulative realized-PnL chart + stat tiles, then a fill-history table.
 */
export function TradingTab({ walletAddress }: { walletAddress?: string }) {
  const t = useThemeTokens();
  const { data: summary, isLoading } = useTradingSummary(walletAddress);
  const { data: fills } = useTradingHistory(walletAddress);

  const hasData = !!summary && summary.trades > 0;

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

  const tiles: Array<{ label: string; tip: string; value: string; sub?: string; color: string; icon?: React.ReactNode }> = [
    {
      label: 'Realized P&L',
      tip: 'Net realized profit/loss from closed positions (HyperLiquid closedPnl). Open positions are not included.',
      value: `${pnlPositive ? '+' : ''}${usd(pnl)}`,
      color: pnlPositive ? t.gain : t.down,
      icon: pnlPositive ? <TrendingUp sx={{ fontSize: 15 }} /> : <TrendingDown sx={{ fontSize: 15 }} />,
    },
    {
      label: 'Win Rate',
      tip: 'Share of closing trades that realized a profit',
      value: `${(summary?.winRate ?? 0).toFixed(1)}%`,
      sub: `${summary?.wins ?? 0}W / ${summary?.losses ?? 0}L`,
      color: t.gain,
    },
    {
      label: 'Volume Traded',
      tip: 'Total notional traded (Σ size × price across all fills)',
      value: usd(summary?.volumeUsd ?? 0, 0),
      sub: `${summary?.trades ?? 0} trade${(summary?.trades ?? 0) === 1 ? '' : 's'}`,
      color: t.text.primary,
    },
    {
      label: 'Fees Paid',
      tip: 'Total exchange fees across all fills',
      value: usd(summary?.feesUsd ?? 0),
      sub: summary?.bestCoin ? `best: ${summary.bestCoin.coin} ${usd(summary.bestCoin.pnl)}` : undefined,
      color: t.text.secondary,
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

      {/* Fill history */}
      <Box sx={{ bgcolor: t.bg.surface, border: `1px solid ${t.border.subtle}`, borderRadius: 1.5, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr 0.9fr 1fr 0.8fr 1fr', gap: 1, px: 2, py: 1.25, borderBottom: `1px solid ${t.border.subtle}` }}>
          {['Time', 'Coin', 'Direction', 'Size', 'Price', 'Fee', 'PnL'].map((h, i) => (
            <Typography key={h} sx={{ fontSize: '0.66rem', fontWeight: 600, color: t.text.quaternary, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: i >= 3 ? 'right' : 'left' }}>{h}</Typography>
          ))}
        </Box>
        {(fills ?? []).length === 0 ? (
          <Typography sx={{ textAlign: 'center', color: t.text.tertiary, py: 5, fontSize: '0.85rem' }}>No fills yet.</Typography>
        ) : (
          (fills ?? []).map((f: TradeFillRow) => {
            const pnlN = f.pnlUsd != null ? Number(f.pnlUsd) : null;
            const isClose = (f.dir ?? '').toLowerCase().includes('close');
            const dirColor = !f.dir ? t.text.secondary : isClose ? t.accent : f.side === 'BUY' ? t.gain : t.down;
            return (
              <Box key={f.id} sx={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 0.9fr 0.9fr 1fr 0.8fr 1fr', gap: 1, px: 2, py: 1, borderBottom: `1px solid ${t.border.subtle}`, fontVariantNumeric: 'tabular-nums' }}>
                <Typography sx={{ fontSize: '0.76rem', color: t.text.tertiary, whiteSpace: 'nowrap' }}>{fmtTime(f.time)}</Typography>
                <Typography sx={{ fontSize: '0.78rem', fontWeight: 600, color: t.text.primary }}>{f.coin}</Typography>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: dirColor }}>{f.dir ?? f.side}</Typography>
                <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{Number(f.sz).toLocaleString(undefined, { maximumFractionDigits: 4 })}</Typography>
                <Typography sx={{ fontSize: '0.76rem', color: t.text.secondary, textAlign: 'right' }}>{usd(Number(f.px))}</Typography>
                <Typography sx={{ fontSize: '0.76rem', color: t.text.quaternary, textAlign: 'right' }}>{usd(Number(f.feeUsd))}</Typography>
                <Typography sx={{ fontSize: '0.76rem', fontWeight: 600, color: pnlN == null ? t.text.quaternary : pnlN >= 0 ? t.gain : t.down, textAlign: 'right' }}>
                  {pnlN == null || pnlN === 0 ? '—' : `${pnlN >= 0 ? '+' : ''}${usd(pnlN)}`}
                </Typography>
              </Box>
            );
          })
        )}
      </Box>
    </>
  );
}
