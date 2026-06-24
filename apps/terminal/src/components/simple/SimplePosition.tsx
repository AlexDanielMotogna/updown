'use client';

import { useState } from 'react';
import type { Position } from 'exchange-core';
import { placeOrder } from '@/lib/api';
import { useToast } from '../Toast';
import type { OrderSide } from '@/lib/types';

const usd = (n: number) => (Number.isFinite(n) ? `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '$0.00');

/**
 * Beginner-friendly position card (PLAN-SIMPLE-MODE §4.4): entry / current / PnL /
 * size / liquidation + Close. No pro columns. (Add Margin is a fast-follow once the
 * HL updateIsolatedMargin endpoint exists — §7.)
 */
export function SimplePosition({ pos, walletAddress }: { pos: Position; walletAddress?: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const base = pos.symbol.replace('-USD', '');
  const long = pos.side === 'LONG';
  const pnl = Number(pos.unrealizedPnl);
  const sizeUsd = Number(pos.metadata?.positionValue ?? 0);

  async function close() {
    if (!walletAddress || busy) return;
    setBusy(true);
    const opp: OrderSide = long ? 'SELL' : 'BUY';
    const tid = toast.loading(`Close ${base} — pending`);
    const res = await placeOrder({ walletAddress, symbol: pos.symbol, side: opp, type: 'MARKET', amount: pos.amount, reduceOnly: true, maxSlippagePct: 8 });
    setBusy(false);
    toast.update(tid, res.success ? 'success' : 'error', res.success ? `Close ${base} submitted` : res.error?.message ?? 'Close failed');
  }

  const Row = ({ label, value, cls }: { label: string; value: string; cls?: string }) => (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className="text-surface-400">{label}</span>
      <span className={`font-medium tabular-nums ${cls ?? 'text-surface-100'}`}>{value}</span>
    </div>
  );

  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-bold text-surface-100">{base}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-bold text-black ${long ? 'bg-win-500' : 'bg-loss-500'}`}>
          {long ? 'LONG' : 'SHORT'}
        </span>
      </div>
      <Row label="Entry" value={usd(Number(pos.entryPrice))} />
      <Row label="Current" value={usd(Number(pos.markPrice))} />
      <Row label="PnL" value={`${pnl >= 0 ? '+' : ''}${usd(pnl)}`} cls={pnl >= 0 ? 'text-win-500' : 'text-loss-500'} />
      <Row label="Size" value={usd(sizeUsd)} />
      <Row label="Liquidation" value={usd(Number(pos.liquidationPrice))} />
      <button onClick={close} disabled={busy}
        className="mt-2 w-full rounded-lg bg-loss-500 py-2 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:opacity-50">
        {busy ? 'Closing…' : 'Close Position'}
      </button>
    </div>
  );
}
