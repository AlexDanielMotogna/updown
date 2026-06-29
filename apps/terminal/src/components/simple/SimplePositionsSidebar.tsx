'use client';

import { useState } from 'react';
import type { Order, Position } from 'exchange-core';
import { type SpotBalanceRow } from '@/lib/api';
import { useTrading } from '@/hooks/useTrading';
import { SimplePosition } from './SimplePosition';
import { TokenIcon } from '../TokenIcon';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');
const qty = (n: number, dp = 4) => (Number.isFinite(n) ? n.toLocaleString(undefined, { maximumFractionDigits: dp }) : '0');

/** Centered empty / connect state — UpDown-icon node in a brand-tinted box with a
 *  soft pulse, matching the ConnectGate look the user liked. */
function EmptyState({ connected }: { connected: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10">
        <span className="absolute inset-0 rounded-2xl border border-brand/30 animate-ping" style={{ animationDuration: '2.6s' }} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/updown-logos/Logo_48px_Cyan_Transparent.png" alt="UpDown" className="h-9 w-9" />
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-bold text-surface-100">{connected ? 'No open positions' : 'Connect to trade'}</h3>
        <p className="text-xs leading-relaxed text-surface-300">
          {connected
            ? 'Your open positions will show up here. Pick a market and go Long or Short.'
            : 'Connect your wallet to see your positions and orders here.'}
        </p>
      </div>
    </div>
  );
}

/**
 * Right rail for the Simple catalog (PLAN-SIMPLE-MODE): "what do I have open" —
 * live positions (with Close) + any resting orders (with Cancel). Reuses
 * SimplePosition; reads nothing itself (data passed from the catalog's stream).
 */
export function SimplePositionsSidebar({
  kind = 'perp',
  positions,
  holdings = [],
  walletAddress,
  evmAddress,
  connected,
}: {
  kind?: 'perp' | 'spot';
  positions: Position[];
  // Resting orders are intentionally NOT shown in Simple mode (positions only).
  // Kept in the props so the Pro-side callers can pass it without a type error.
  orders?: Order[];
  holdings?: SpotBalanceRow[];
  walletAddress?: string;
  evmAddress?: string;
  connected: boolean;
}) {
  const [view, setView] = useState<'card' | 'row'>('card');
  // One-time, GLOBAL agent approval. MUST be called before any early return below
  // (the spot branch) so the hook order is stable across perp↔spot (React #300).
  const { enabled: tradingEnabled, busy: enabling, enableTrading } = useTrading(walletAddress, evmAddress);

  // Spot mode: the right rail shows token HOLDINGS (your "open" things in spot),
  // not perp positions/orders. Exclude USDC (cash) + sub-lot dust.
  if (kind === 'spot') {
    const rows = holdings
      .filter((b) => b.asset !== 'USDC' && Number(b.total) > 0 && Number(b.total) >= Math.pow(10, -(b.metadata?.szDecimals ?? 0)))
      .map((b) => {
        const value = Number(b.usdValue ?? 0);
        const entry = Number(b.entryNotional ?? 0);
        const pnl = entry > 0 ? value - entry : null;
        const roe = pnl != null && entry > 0 ? (pnl / entry) * 100 : null;
        return { ...b, value, pnl, roe };
      })
      .sort((a, b) => b.value - a.value);

    if (!connected || rows.length === 0) return <EmptyState connected={connected} />;
    return (
      <div className="flex h-full flex-col gap-4 p-3">
        <h2 className="text-sm font-bold text-surface-100">Holdings</h2>
        <div className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.asset} className="rounded-lg border border-surface-800 bg-surface-850 p-2.5 text-xs">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <TokenIcon symbol={r.asset} size="sm" spot />
                  <span className="font-semibold text-surface-100">{r.asset}</span>
                </span>
                <span className="tabular-nums text-surface-100">{usd(r.value)}</span>
              </div>
              <div className="flex items-center justify-between text-surface-400">
                <span className="tabular-nums">{qty(Number(r.total))} {r.asset}</span>
                <span className={`tabular-nums ${r.pnl == null ? 'text-surface-500' : r.pnl >= 0 ? 'text-win-500' : 'text-loss-500'}`}>
                  {r.pnl == null ? '--' : `${r.pnl >= 0 ? '+' : ''}${usd(r.pnl)}${r.roe != null ? ` (${r.roe >= 0 ? '+' : ''}${r.roe.toFixed(1)}%)` : ''}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  const needsAgent = !!walletAddress && positions.length > 0 && !tradingEnabled;

  // Centered empty state (not connected, or connected with no open positions).
  if (!connected || positions.length === 0) {
    return <EmptyState connected={connected} />;
  }

  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-surface-100">Open Positions</h2>
          {/* card | row view switch (matches the catalog) */}
          <div className="flex items-center rounded-md bg-surface-800 p-0.5">
            {([
              ['card', <svg key="g" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>],
              ['row', <svg key="l" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" /></svg>],
            ] as const).map(([v, icon]) => (
              <button key={v} onClick={() => setView(v)} aria-label={`${v} view`}
                className={`rounded px-1.5 py-1 transition-colors ${view === v ? 'bg-surface-700 text-surface-100' : 'text-surface-400 hover:text-surface-100'}`}>
                {icon}
              </button>
            ))}
          </div>
        </div>
        {needsAgent && (
          <div className="mb-2 rounded-lg border border-brand/30 bg-brand/10 p-2.5">
            <p className="mb-2 text-xs leading-relaxed text-surface-200">Enable trading once to close or manage your positions.</p>
            <button onClick={enableTrading} disabled={enabling}
              className="w-full rounded-lg bg-brand py-2 text-sm font-bold text-surface-950 transition-opacity hover:opacity-90 disabled:opacity-50">
              {enabling ? 'Enabling…' : 'Enable Trading'}
            </button>
          </div>
        )}
        {positions.length === 0 ? (
          <p className="text-xs text-surface-500">No open positions.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {positions.map((p) => (
              <SimplePosition key={p.symbol} pos={p} walletAddress={walletAddress} canClose={tradingEnabled} compact={view === 'row'} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
